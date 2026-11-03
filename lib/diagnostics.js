import { randomUUID, timingSafeEqual } from 'node:crypto';
import { services } from './services.js';

// Server-only checks. The caller must already possess this channel's access token.
// No tokens, user identities, request bodies or project content are returned.
export async function diagnose(request, env, fetcher) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const expected = Buffer.from(`Bearer ${(env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()}`);
  const received = Buffer.from(request.headers.get('authorization') || '');
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || expected.length !== received.length || !timingSafeEqual(expected, received)) return new Response('Unauthorized', { status: 401 });
  const svc = services(env, fetcher), checks = [];
  async function check(name, run) {
    try { const detail = await run(); checks.push({ name, ok: true, ...detail }); }
    catch (error) { checks.push({ name, ok: false, service: error.service || 'runtime', status: error.status || 'error', ...(error.code ? { code: error.code } : {}), ...(error.reason ? { reason: error.reason } : {}), ...(error.providerMessage ? { detail: error.providerMessage } : {}) }); }
  }
  let target = 'core';
  try { target = (await request.json()).target || 'core'; } catch { /* An empty body checks the core services. */ }
  if (!['core', 'gemini'].includes(target)) return new Response('Unknown diagnostic target', { status: 400 });
  const headers = { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN.trim()}`, 'Content-Type': 'application/json' };
  await check('redis.write', async () => {
    const fresh = await svc.redis('SET', `studio:diagnostics:rate:${target}`, '1', 'NX', 'EX', '30');
    if (fresh !== 'OK') throw Object.assign(new Error('Rate limited'), { status: 429 });
    return {};
  });
  if (checks[0].status === 429) return Response.json({ checks }, { status: 429 });
  if (target === 'gemini') {
    const model = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    if (!env.GEMINI_API_KEY) return Response.json({ ok: false, checks: [{ name: 'gemini.key', ok: false, status: 'missing' }] });
    await check('gemini.models', async () => {
      const response = await svc.call('Gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY.trim() } });
      const data = await response.json();
      return { selected: model, available: Boolean(data.models?.some(x => x.name === `models/${model}`)), textModels: data.models?.filter(x => x.supportedGenerationMethods?.includes('generateContent')).map(x => x.name).slice(0, 40) };
    });
    if (checks.at(-1).ok) await check('gemini.generate', async () => {
      if (!/^[\w.-]+$/.test(model)) throw Object.assign(new Error('Invalid model'), { status: 'invalid_model' });
      const response = await svc.call('Gemini', `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY.trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Return JSON with ok set to true.' }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, maxOutputTokens: 128 } }),
      }, 25000);
      const data = await response.json();
      return { model, returnedContent: Boolean(data.candidates?.[0]?.content?.parts?.some(x => x.text)) };
    });
    return Response.json({ ok: checks.every(x => x.ok), checks }, { headers: { 'Cache-Control': 'no-store' } });
  }
  await check('line.token', async () => {
    const data = await (await svc.call('LINE token', 'https://api.line.me/v2/bot/info', { headers })).json();
    return { displayName: data.displayName, chatMode: data.chatMode };
  });
  await check('line.webhook', async () => {
    const data = await (await svc.call('LINE webhook', 'https://api.line.me/v2/bot/channel/webhook/endpoint', { headers })).json();
    return { endpoint: data.endpoint, active: data.active };
  });
  await check('line.verify', async () => {
    const data = await (await svc.call('LINE verify', 'https://api.line.me/v2/bot/channel/webhook/test', { method: 'POST', headers, body: '{}' })).json();
    return { ok: data.success, status: data.statusCode };
  });
  await check('github.branch.write', async () => {
    const branch = `game/diagnostic/${randomUUID()}`;
    const head = await svc.github(`/git/ref/heads/${encodeURIComponent(env.GITHUB_REF || 'main')}`);
    await svc.github('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.object.sha }) });
    try { await svc.github(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'DELETE' }); }
    catch (error) { checks.push({ name: 'github.cleanup', ok: false, status: error.status, branch }); }
    return {};
  });
  return Response.json({ ok: checks.every(x => x.ok), checks }, { headers: { 'Cache-Control': 'no-store' } });
}
