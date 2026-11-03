import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleRequest } from '../lib/bot.js';

const env = {
  LINE_CHANNEL_SECRET: 'test-secret', LINE_CHANNEL_ACCESS_TOKEN: 'test-token', LINE_ALLOWED_USER_IDS: 'Uallowed',
  GITHUB_TOKEN: 'test-gh', GITHUB_OWNER: 'banyapon', GITHUB_REPO: 'linegodotbuild',
  UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-redis',
};
function request(events, signature) {
  const raw = JSON.stringify({ events });
  return new Request('https://example.com/api/webhook', { method: 'POST', body: raw,
    headers: { 'x-line-signature': signature ?? createHmac('sha256', env.LINE_CHANNEL_SECRET).update(raw).digest('base64') } });
}
const event = { type: 'message', message: { type: 'text', text: 'build web' }, source: { type: 'user', userId: 'Uallowed' }, replyToken: 'reply', webhookEventId: 'event1' };

test('rejects forged requests before making upstream calls', async () => {
  const response = await handleRequest(request([event], 'forged'), env, () => assert.fail('upstream called'));
  assert.equal(response.status, 401);
});
test('LINE verification works before other integrations are configured', async () => {
  assert.equal((await handleRequest(request([]), { LINE_CHANNEL_SECRET: env.LINE_CHANNEL_SECRET })).status, 200);
});
test('unauthorized user and group commands cannot dispatch builds', async () => {
  for (const source of [{ type: 'user', userId: 'Uother' }, { type: 'group', userId: 'Uallowed' }]) {
    assert.equal((await handleRequest(request([{ ...event, source }]), env, () => assert.fail('upstream called'))).status, 200);
  }
});
test('duplicate delivery dispatches exactly once and uses configured repo and ref', async () => {
  let claimed = false;
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url === env.UPSTASH_REDIS_REST_URL) {
      const result = claimed ? null : 'OK'; claimed = true;
      return Response.json({ result });
    }
    if (url.endsWith('/dispatches')) return new Response(null, { status: 204 });
    return Response.json({});
  };
  await handleRequest(request([event]), env, fetcher);
  await handleRequest(request([event]), env, fetcher);
  const dispatches = calls.filter(call => call.url.endsWith('/dispatches'));
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].url, 'https://api.github.com/repos/banyapon/linegodotbuild/actions/workflows/godot-build.yml/dispatches');
  assert.deepEqual(dispatches[0].body, { ref: 'main', inputs: { target: 'web', line_user_id: 'Uallowed', request_id: 'event1' } });
});
test('Redis failure fails closed without triggering a build', async () => {
  const response = await handleRequest(request([event]), env, async url => {
    assert.equal(url, env.UPSTASH_REDIS_REST_URL);
    return new Response('failed', { status: 500 });
  });
  assert.equal(response.status, 502);
});
test('status reads latest workflow run and replies with run URL', async () => {
  const calls = [];
  const response = await handleRequest(request([{ ...event, message: { type: 'text', text: 'status' } }]), env, async (url, options) => {
    calls.push(url);
    if (url === env.UPSTASH_REDIS_REST_URL) return Response.json({ result: 'OK' });
    if (url.includes('/runs?')) return Response.json({ workflow_runs: [{ display_title: 'Build web', conclusion: 'success', html_url: 'https://github.com/banyapon/linegodotbuild/actions/runs/1' }] });
    assert.match(JSON.parse(options.body).messages[0].text, /success/);
    return Response.json({});
  });
  assert.equal(response.status, 200);
  assert.equal(calls.some(url => url.endsWith('/dispatches')), false);
});
