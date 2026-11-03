import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../lib/bot.js';
import { ownerId, command } from '../lib/projects.js';
import { template, sanitizeDesign, design } from '../lib/designer.js';
import { validAssetUrl } from '../lib/services.js';
import { env, event, request, fixture } from './helpers.js';
test('forged signature rejected before upstream access', async () => { assert.equal((await handleRequest(request([event()], 'forged'), env, () => assert.fail())).status, 401); });
test('LINE Verify works with only channel secret', async () => { assert.equal((await handleRequest(request([]), { LINE_CHANNEL_SECRET: env.LINE_CHANNEL_SECRET })).status, 200); });
test('unauthorized users and group chats cannot create projects', async () => {
  for (const source of [{ type: 'user', userId: 'Uother' }, { type: 'group', userId: 'Ualice' }]) assert.equal((await handleRequest(request([{ ...event(), source }]), env, () => assert.fail())).status, 200);
});
test('create → edit → upload → publish → public URL → owner deletion', async () => {
  const f = fixture(), send = e => handleRequest(request([e]), env, f.fetcher);
  await send(event()); let p = f.projects()[0]; assert.equal(p.design.genre, '2d'); assert.match(p.branch, /^game\/[a-f0-9]{20}\/p_/);
  assert.equal(f.files.get(p.branch).id, p.id); assert(!JSON.stringify(f.files.get(p.branch)).includes('Ualice'));
  await send(event('เหรียญ 12')); assert.equal(f.projects()[0].design.game.coinCount, 12);
  await send({ ...event(), message: { type: 'image', id: 'image-1' } }); p = f.projects()[0]; assert.equal(p.assets.length, 1); assert.equal(p.assets[0].owned, true);
  const upload = f.calls.find(c => c.url.endsWith('/image/upload')); assert(upload.options.body instanceof FormData); assert(upload.options.body.get('signature'));
  await send(event('ภาพ ล่าสุด ตัวละคร')); assert.equal(f.projects()[0].assets[0].role, 'player');
  await send(event('พอแล้ว')); p = f.projects()[0]; assert(p.published); assert.match(f.lastMessage(), /\/play\//);
  const url = `https://test/api/games/${p.owner}/${p.id}`;
  const r = await handleRequest(new Request(url), env, f.fetcher); assert.equal(r.status, 200); const data = await r.json(); assert.equal(data.game.coinCount, 12); assert(!('history' in data)); assert(!JSON.stringify(data).includes('publicId'));
  await send(event('เหรียญ 5')); assert.equal((await (await handleRequest(new Request(url), env, f.fetcher)).json()).game.coinCount, 12);
  await send(event(`x-delete "${p.id}"`, 'Ubob')); assert.match(f.lastMessage(), /ไม่พบโปรเจกต์/); assert(f.projects()[0].published);
  await send(event(`x-delete "${p.id}"`)); assert.equal(f.projects()[0].status, 'deleted'); assert.equal(f.branches.size, 0); assert(f.calls.some(c => c.url.endsWith('/image/destroy')));
  assert.equal((await handleRequest(new Request(url), env, f.fetcher)).status, 404);
});
test('duplicate delivery creates only one branch', async () => { const f = fixture(), e = event(); await handleRequest(request([e]), env, f.fetcher); await handleRequest(request([e]), env, f.fetcher); assert.equal(f.projects().length, 1); assert.equal(f.branches.size, 1); });
test('delete revokes URL before failed cleanup and supports retry', async () => {
  const f = fixture(), send = e => handleRequest(request([e]), env, f.fetcher); await send(event()); await send({ ...event(), message: { type: 'image', id: 'image-2' } }); await send(event('พอแล้ว'));
  const p = f.projects()[0]; f.fail('api.cloudinary.com'); await send(event(`x-delete "${p.id}"`)); assert.equal(f.projects()[0].status, 'deleting'); assert.equal(f.projects()[0].published, null);
  f.fail(''); await send(event(`x-delete "${p.id}"`)); assert.equal(f.projects()[0].status, 'deleted');
});
test('Redis failure cannot create GitHub branches', async () => { const f = fixture(); f.fail('redis.test'); await handleRequest(request([event()]), env, f.fetcher); assert.equal(f.branches.size, 0); });
test('GitHub failure prevents publish', async () => { const f = fixture(); await handleRequest(request([event()]), env, f.fetcher); f.fail('api.github.com'); await handleRequest(request([event('พอแล้ว')]), env, f.fetcher); assert.equal(f.projects()[0].published, null); });
test('public routes hide drafts and check owner namespace', async () => {
  const f = fixture(); await handleRequest(request([event()]), env, f.fetcher); const p = f.projects()[0]; assert.equal((await handleRequest(new Request(`https://test/api/games/${p.owner}/${p.id}`), env, f.fetcher)).status, 404);
  await handleRequest(request([event('พอแล้ว')]), env, f.fetcher); assert.equal((await handleRequest(new Request(`https://test/api/games/${ownerId('Ubob')}/${p.id}`), env, f.fetcher)).status, 404);
});
test('AI cannot inject assets, scripts, colors or unbounded difficulty', () => {
  const previous = template(); const safe = sanitizeDesign({ ...previous, game: { coinCount: 999999, enemyCount: -2, speed: 9999, duration: 1 }, palette: { background: 'url(javascript:evil)' }, assets: [{ url: 'javascript:evil' }], script: 'evil' }, previous, []);
  assert.deepEqual(safe.game, { coinCount: 40, enemyCount: 0, speed: 400, duration: 15 }); assert.equal(safe.assets.length, 0); assert(!('script' in safe)); assert.equal(safe.palette.background, previous.palette.background);
});
test('asset URLs restrict protocol, host, cloud and extension', () => {
  assert(validAssetUrl('https://res.cloudinary.com/test-cloud/image/upload/v1/a.png', env));
  for (const url of ['https://127.0.0.1/a.png', 'http://res.cloudinary.com/test-cloud/image/upload/a.png', 'https://res.cloudinary.com/other/image/upload/a.jpg', 'https://res.cloudinary.com/test-cloud/image/upload/a.svg']) assert(!validAssetUrl(url, env));
});
test('delete accepts quoted ID but rejects path traversal', () => { assert.equal(command('x-delete "p_1234567890123456"').type, 'delete'); assert.equal(command('x-delete "../main"').type, 'help'); });
test('Gemini uses header key and validates structured design', async () => {
  const previous = template(); const result = await design({ design: previous, assets: [], history: [] }, 'อยากได้ดาว 9 ดวง', { GEMINI_API_KEY: 'synthetic-key' }, { call: async (service, url, options) => {
    assert.equal(service, 'Gemini'); assert(!url.includes('synthetic-key')); assert.equal(options.headers['x-goog-api-key'], 'synthetic-key'); assert(JSON.parse(options.body).generationConfig.responseJsonSchema);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...previous, game: { ...previous.game, coinCount: 9 }, reply: 'เพิ่มดาวแล้ว อยากเพิ่มอะไรอีก?' }) }] } }] });
  } }); assert.equal(result.design.game.coinCount, 9);
});
test('demos do not require integrations', async () => { for (const genre of ['2d', '3d', 'vn']) { const r = await handleRequest(new Request(`https://test/api/games/demo/${genre}`), {}, () => assert.fail()); assert.equal(r.status, 200); assert.equal((await r.json()).genre, genre); } });
test('screenshot build web command publishes playable Tic Tac Toe with full brief', async () => {
  const f = fixture();
  const message = 'build web สร้างเกม Tic Tac Toe\nแบบ monster';
  assert.equal(command(message).type, 'generate');
  await handleRequest(request([event(message)]), env, f.fetcher);
  const project = f.projects()[0];
  assert.equal(project.published.mode, 'tictactoe'); assert.equal(project.published.genre, '2d');
  assert(project.history.some(x => x.text.includes('Tic Tac Toe'))); assert.match(f.lastMessage(), /เกมพร้อมเล่นแล้ว/);
});
test('known Tic Tac Toe can publish a labeled template if Gemini fails', async () => {
  const f = fixture(); f.fail('generativelanguage.googleapis.com');
  await handleRequest(request([event('build web สร้างเกม Tic Tac Toe แบบ monster')]), { ...env, GEMINI_API_KEY: 'synthetic-key' }, f.fetcher);
  assert.equal(f.projects()[0].published.mode, 'tictactoe'); assert.match(f.lastMessage(), /Gemini ยังปรับรายละเอียดไม่สำเร็จ/);
});
test('LINE token whitespace is trimmed before authorization', async () => {
  const f = fixture(); await handleRequest(request([event('status')]), { ...env, LINE_CHANNEL_ACCESS_TOKEN: ' test-token\n' }, f.fetcher);
  const lineCall = f.calls.find(x => x.url.startsWith('https://api.line.me/'));
  assert.equal(lineCall.options.headers.Authorization, 'Bearer test-token');
});
