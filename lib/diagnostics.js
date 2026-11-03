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
    catch (error) { checks.push({ name, ok: false, service: error.service || 'runtime', status: error.status || 'error' }); }
  }
  const headers = { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN.trim()}`, 'Content-Type': 'application/json' };
  await check('redis.write', async () => {
    const fresh = await svc.redis('SET', 'studio:diagnostics:rate', '1', 'NX', 'EX', '30');
    if (fresh !== 'OK') throw Object.assign(new Error('Rate limited'), { status: 429 });
    return {};
  });
  if (checks[0].status === 429) return Response.json({ checks }, { status: 429 });
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
