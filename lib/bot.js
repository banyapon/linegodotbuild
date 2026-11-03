import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { readiness, UserError, geminiFailureMessage } from './config.js';
import { services, readLimited } from './services.js';
import { projectManager, ownerId } from './projects.js';
import { template } from './designer.js';
import { diagnose } from './diagnostics.js';
import { lineCard } from './cards.js';
import { spaceSource, sourceDocument, sourceHeaders } from './game-source.js';
import { addressedText } from './mentions.js';

export function validSignature(raw, signature, secret) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('base64');
  const received = Buffer.from(signature);
  return received.length === expected.length && timingSafeEqual(received, Buffer.from(expected));
}

// schedule is Vercel waitUntil in production; tests/dev await processing directly.
export async function handleRequest(request, env = process.env, fetcher = fetch, schedule) {
  const path = new URL(request.url).pathname;
  const health = readiness(env);
  if (path === '/api/health' && request.method === 'GET') return Response.json(health, { headers: { 'Cache-Control': 'no-store' } });
  if (path === '/api/diagnostics') return diagnose(request, env, fetcher);
  const svc = services(env, fetcher);
  const manager = projectManager(env, svc);
  const sourceRoute = path.match(/^\/api\/games\/([^/]+)\/([^/]+)\/(index\.html|index\.js)$/);
  if (sourceRoute && request.method === 'GET') {
    let source;
    try { source = sourceRoute[1] === 'demo' && sourceRoute[2] === 'space' ? spaceSource() : await manager.publicSource(sourceRoute[1], sourceRoute[2]); }
    catch { return new Response('Game service unavailable', { status: 503 }); }
    if (!source) return new Response('Game not found or deleted', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const base = env.PUBLIC_BASE_URL || new URL(request.url).origin;
    const scriptUrl = `/api/games/${sourceRoute[1]}/${sourceRoute[2]}/index.js`;
    return sourceRoute[3] === 'index.js' ? new Response(source.js, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } }) : new Response(sourceDocument(source, scriptUrl, base), { headers: sourceHeaders(base, scriptUrl, source) });
  }
  const publicRoute = path.match(/^\/api\/games\/([^/]+)\/([^/]+)$/);
  if (publicRoute && request.method === 'GET') {
    let game;
    if (publicRoute[1] === 'demo' && publicRoute[2] === 'space') game = { ...template('2d', 'custom'), title: 'Starward Patrol', description: 'ขับยาน เก็บชัยชนะ · ยิงอัตโนมัติ · จอยเสมือน 9:16', id: 'demo-space' };
    else if (publicRoute[1] === 'demo' && ['2d', '3d', 'vn', 'ttt'].includes(publicRoute[2])) game = { ...template(publicRoute[2] === 'ttt' ? '2d' : publicRoute[2], publicRoute[2] === 'ttt' ? 'tictactoe' : 'collector'), id: `demo-${publicRoute[2]}` };
    else {
      if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return new Response('Storage unavailable', { status: 503 });
      try { game = await manager.publicGame(publicRoute[1], publicRoute[2]); }
      catch { return new Response('Game service unavailable', { status: 503 }); }
    }
    return game ? Response.json(game, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) : new Response('Game not found or deleted', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (path !== '/api/webhook') return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.LINE_CHANNEL_SECRET) return new Response('Configuration required', { status: 503 });
  let raw;
  try { raw = await readLimited(request, 1024 * 1024); } catch { return new Response('Payload too large', { status: 413 }); }
  if (!validSignature(raw, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET)) return new Response('Invalid signature', { status: 401 });
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (!Array.isArray(body.events) || body.events.length > 100) return new Response('Invalid events', { status: 400 });
  console.info('LINE webhook received', { events: body.events.length });
  if (!body.events.length) return Response.json({ ok: true });
  const allowed = new Set((env.LINE_ALLOWED_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean));
  const events = body.events.flatMap(e => {
    if (e.type !== 'message' || e.source?.type !== 'user' || !allowed.has(e.source.userId) || !e.webhookEventId || !e.replyToken) return [];
    if (e.message?.type === 'image') return [e]; // Only processed with an explicit, unexpired upload request below.
    const text = addressedText(e.message);
    return text === null ? [] : [{ ...e, message: { ...e.message, text } }];
  });
  console.info('LINE events selected', { accepted: events.length, ignored: body.events.length - events.length });
  if (!events.length) return Response.json({ ok: true });
  if (!health.configured) return new Response('Configuration required', { status: 503 });
  async function processEvents() {
    for (const event of events) {
      const owner = ownerId(event.source.userId);
      const token = randomUUID(); const lockKey = `studio:lock:${owner}`;
      const uploadKey = `studio:upload:${owner}`;
      let locked = false, canNotify = event.message.type === 'text';
      try {
        // Images cannot contain a LINE mention: require @gamecreator upload first.
        if (event.message.type === 'image' && !await svc.redis('GET', uploadKey)) continue;
        canNotify = true;
        if (await svc.redis('GET', `studio:event:${event.webhookEventId}`)) continue;
        // Claim a per-user lock BEFORE claiming the event so a busy event can be retried.
        locked = await svc.redis('SET', lockKey, token, 'NX', 'EX', '240') === 'OK';
        if (!locked) {
          await svc.line('reply', { replyToken: event.replyToken, messages: lineCard('กำลังจัดการคำสั่งก่อนหน้า กรุณารอสักครู่แล้วส่งข้อความนี้อีกครั้ง', env, 'progress') });
          continue;
        }
        const fresh = await svc.redis('SET', `studio:event:${event.webhookEventId}`, 'processing', 'NX', 'EX', '604800');
        if (fresh !== 'OK') continue;
        const countKey = `studio:rate:${owner}:${Math.floor(Date.now() / 60000)}`;
        const count = Number(await svc.redis('INCR', countKey));
        if (count === 1) await svc.redis('EXPIRE', countKey, 120);
        if (count > 20) throw new UserError('ส่งได้ไม่เกิน 20 คำสั่งต่อนาที กรุณารอสักครู่');
        // Reply immediately; later results are push messages to the same authorized user.
        await svc.line('reply', { replyToken: event.replyToken, messages: lineCard('รับคำสั่งแล้ว กำลังจัดการโปรเจกต์ให้ครับ', env, 'progress') });
        console.info('LINE reply accepted');
        let text;
        if (event.message.type === 'text' && /^(upload|ส่งภาพ|อัปโหลดภาพ)$/i.test(event.message.text)) {
          await svc.redis('SET', uploadKey, '1', 'EX', '120');
          text = 'ส่งภาพ PNG/JPEG ถัดไป 1 ภาพภายใน 2 นาทีได้เลยครับ\nหากจะส่งอีกภาพ ให้พิมพ์ @gamecreator upload ใหม่';
        } else {
          if (event.message.type === 'image') await svc.redis('DEL', uploadKey);
          text = await manager.process(event);
        }
        await svc.line('push', { to: event.source.userId, messages: lineCard(text, env) }, randomUUID());
        console.info('LINE result push accepted');
        await svc.redis('SET', `studio:event:${event.webhookEventId}`, 'done', 'EX', '604800');
      } catch (e) {
        console.error('Studio event failed', { service: e.service || 'studio', status: e.status || 'error', ...(e.code ? { code: e.code } : {}), ...(e.reason ? { reason: e.reason } : {}), ...(e instanceof UserError ? { reason: e.message } : {}) });
        const message = e instanceof UserError ? e.message : e.service === 'GitHub' ? 'ติดต่อ GitHub ไม่สำเร็จ ตรวจ GITHUB_TOKEN ว่ามี Contents: Read and write แล้วส่งคำสั่งใหม่' : e.service === 'Gemini' ? geminiFailureMessage(e) : 'ประมวลผลไม่สำเร็จ กรุณาตรวจการตั้งค่าบริการและลองใหม่ (หากสั่งลบ ให้ส่ง x-delete คำสั่งเดิมเพื่อทำต่อ)';
        if (canNotify) try { await svc.line('push', { to: event.source.userId, messages: lineCard(message, env, 'error') }, randomUUID()); } catch { console.error('LINE error notification failed'); }
      } finally {
        if (locked) {
          try { await svc.redis('EVAL', 'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end', 1, lockKey, token); }
          catch { console.error('Lock cleanup failed'); }
        }
      }
    }
  }
  if (schedule) schedule(processEvents()); else await processEvents();
  return Response.json({ ok: true });
}
