import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../api/index.js';

test('Vercel context does not replace server environment variables', async t => {
  const previous = process.env.LINE_CHANNEL_SECRET;
  process.env.LINE_CHANNEL_SECRET = 'entrypoint-test-secret';
  t.after(() => {
    if (previous === undefined) delete process.env.LINE_CHANNEL_SECRET;
    else process.env.LINE_CHANNEL_SECRET = previous;
  });
  const response = await app.fetch(new Request('https://example.com/api/webhook', {
    method: 'POST', headers: { 'x-line-signature': 'invalid' }, body: '{"events":[]}',
  }), { waitUntil() {} });
  assert.equal(response.status, 401);
});
