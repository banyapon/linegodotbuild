import { createHmac, timingSafeEqual } from 'node:crypto';

export function validSignature(raw, signature, secret) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('base64');
  const received = Buffer.from(signature);
  return received.length === expected.length && timingSafeEqual(received, Buffer.from(expected));
}

export function parseCommand(text) {
  const command = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (['build web', 'build windows'].includes(command)) return { type: 'build', target: command.split(' ')[1] };
  if (['status', 'logs'].includes(command)) return { type: command };
  return { type: 'help' };
}

async function jsonFetch(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export async function handleRequest(request, env = process.env, fetcher = fetch) {
  const path = new URL(request.url).pathname;
  if (path === '/api/health' && request.method === 'GET') {
    return Response.json({ ok: true, service: 'linegodot', configured: required.every(key => Boolean(env[key])) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (path !== '/api/webhook') return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.LINE_CHANNEL_SECRET) return new Response('Configuration required', { status: 503 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 1024 * 1024) return new Response('Too large', { status: 413 });
  if (!validSignature(raw, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET)) return new Response('Invalid signature', { status: 401 });
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (!Array.isArray(body.events)) return new Response('Invalid events', { status: 400 });
  if (!body.events.length) return Response.json({ ok: true }); // LINE Console verification
  if (!required.every(key => Boolean(env[key]))) return new Response('Configuration required', { status: 503 });

  const allowed = new Set(env.LINE_ALLOWED_USER_IDS.split(',').map(id => id.trim()).filter(Boolean));
  const repo = `${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
  const workflow = encodeURIComponent(env.GITHUB_WORKFLOW || 'godot-build.yml');
  const ref = env.GITHUB_REF || 'main';
  const github = (route, options = {}) => jsonFetch(fetcher, `https://api.github.com/repos/${repo}${route}`, {
    ...options,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
  });
  const reply = (event, text) => jsonFetch(fetcher, 'https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text }] }),
  });
  try {
    for (const event of body.events) {
      if (event.type !== 'message' || event.message?.type !== 'text' || event.source?.type !== 'user' || !allowed.has(event.source.userId)) continue;
      if (!event.webhookEventId || !event.replyToken) continue;
      const command = parseCommand(event.message.text);
      // Durable claim prevents duplicate dispatch across concurrent serverless invocations.
      // Retain on ambiguous upstream errors: operators inspect Actions before issuing a new command.
      const claim = await jsonFetch(fetcher, env.UPSTASH_REDIS_REST_URL, {
        method: 'POST', headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', `linegodot:${repo}:${event.webhookEventId}`, '1', 'NX', 'EX', '604800']),
      });
      if (claim.error) throw new Error('Dedup store failed');
      if (claim.result !== 'OK') continue;
      let message = 'คำสั่ง: build web, build windows, status, logs';
      try {
        if (command.type === 'build') {
          await github(`/actions/workflows/${workflow}/dispatches`, {
            method: 'POST', body: JSON.stringify({ ref, inputs: { target: command.target, line_user_id: event.source.userId, request_id: event.webhookEventId } }),
          });
          message = `รับงาน build ${command.target} จาก ${ref} แล้ว\nhttps://github.com/${repo}/actions/workflows/${workflow}`;
        } else if (command.type === 'status' || command.type === 'logs') {
          const data = await github(`/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=1`);
          const run = data.workflow_runs?.[0];
          message = run ? `${run.display_title}: ${run.conclusion || run.status}\n${run.html_url}${command.type === 'logs' ? '\nเปิด Jobs เพื่อดู log และ Artifacts เพื่อดาวน์โหลด' : ''}` : 'ยังไม่มีงาน build';
        }
      } catch {
        console.error('Command upstream failed', { type: command.type });
        message = 'ติดต่อ GitHub ไม่สำเร็จ กรุณาตรวจ Actions ก่อนสั่งใหม่ เพราะงานอาจรับคำสั่งแล้ว';
      }
      await reply(event, message);
    }
    return Response.json({ ok: true });
  } catch {
    console.error('Webhook processing failed');
    return new Response('Processing failed', { status: 502 });
  }
}

const required = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_ALLOWED_USER_IDS', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
