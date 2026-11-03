import test from 'node:test';
import assert from 'node:assert/strict';
import { addressedText } from '../lib/mentions.js';
import { handleRequest } from '../lib/bot.js';
import { lineCard } from '../lib/cards.js';
import { env, event, request, fixture } from './helpers.js';

test('requires an exact bot tag or a native self mention and removes it before parsing', () => {
  const parse = (text, mention) => addressedText({ type: 'text', text, mention });
  for (const text of ['status', 'hello', 'gamecreator status', '@gamecreator2 status', 'x@gamecreator status', '@other status']) assert.equal(parse(text), null);
  assert.equal(parse('@GameCreator status'), 'status');
  assert.equal(parse('@gamecreator: new space'), 'new space');
  assert.equal(parse('status @gamecreator'), 'status');
  assert.equal(parse('@gamecreator'), 'help');
  assert.equal(parse('@Game Creator status', { mentionees: [{ type: 'user', isSelf: true, index: 0, length: 13 }] }), 'status');
  assert.equal(parse('@gamecreator status', { mentionees: [{ type: 'user', isSelf: false, index: 0, length: 12 }] }), null);
  assert.equal(parse('@all status', { mentionees: [{ type: 'all', index: 0, length: 4 }] }), null);
});

test('unaddressed messages are silent before Redis, AI, LINE or project mutations', async () => {
  for (const text of ['hello', 'status', 'build web create a game', 'พอแล้ว', 'x-delete "p_0123456789abcdef"']) {
    const e = event(); e.message.text = text;
    const r = await handleRequest(request([e]), env, () => assert.fail('Unaddressed text made an upstream call'));
    assert.equal(r.status, 200);
  }
});

test('Card message actions include the bot tag and work through the same gate', async () => {
  for (const kind of ['result', 'progress', 'error']) {
    const [card] = lineCard('project_id: p_0123456789abcdef', env, kind);
    for (const { action } of card.contents.footer.contents) if (action.type === 'message') {
      assert(action.text.startsWith('@gamecreator '));
      assert(addressedText({ type: 'text', text: action.text }));
    }
  }
  const f = fixture();
  const create = lineCard('Ready', env)[0].contents.footer.contents[0].action.text;
  const e = event(); e.message.text = create;
  await handleRequest(request([e]), env, f.fetcher);
  assert.equal(f.projects().length, 1);
});

test('images require an explicit one-use upload request with a two-minute expiry', async () => {
  const f = fixture(), send = e => handleRequest(request([e]), env, f.fetcher);
  const image = () => ({ ...event(), message: { type: 'image', id: 'image-test' } });
  await send(image()); assert.equal(f.messages.length, 0); assert.equal(f.projects().length, 0);
  await send(event('upload'));
  const gate = f.calls.find(c => c.url === env.UPSTASH_REDIS_REST_URL && JSON.parse(c.options.body)[1]?.startsWith('studio:upload:') && JSON.parse(c.options.body)[0] === 'SET');
  assert.deepEqual(JSON.parse(gate.options.body).slice(-2), ['EX', '120']);
  await send(image()); assert.equal(f.projects()[0].assets.length, 1);
  const replies = f.messages.length;
  await send(image()); assert.equal(f.messages.length, replies); assert.equal(f.projects()[0].assets.length, 1);
  assert.equal(f.calls.filter(c => c.url.startsWith('https://api-data.line.me/')).length, 1);
  f.fail('redis.test'); await send(image()); assert.equal(f.messages.length, replies);
});
