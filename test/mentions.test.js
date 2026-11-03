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

test('unaddressed group messages are silent before Redis, AI, LINE or project mutations', async () => {
  for (const text of ['hello', 'status', 'build web create a game', 'พอแล้ว', 'x-delete "p_0123456789abcdef"']) {
    const e = event(); e.message.text = text; e.source = { type: 'group', groupId: 'Ctest', userId: 'Ualice' };
    const r = await handleRequest(request([e]), env, () => assert.fail('Unaddressed text made an upstream call'));
    assert.equal(r.status, 200);
  }
});

test('group Card actions include the tag; direct Card actions do not need it', async () => {
  for (const kind of ['result', 'progress', 'error']) {
    const [card] = lineCard('project_id: p_0123456789abcdef', env, kind, true);
    for (const { action } of card.contents.footer.contents) if (action.type === 'message') {
      assert(action.text.startsWith('@gamecreator '));
      assert(addressedText({ type: 'text', text: action.text }));
    }
  }
  const f = fixture();
  const create = lineCard('Ready', env)[0].contents.footer.contents[0].action.text;
  assert.equal(create, 'new game');
  const e = event(); e.message.text = create;
  await handleRequest(request([e]), env, f.fetcher);
  assert.equal(f.projects().length, 1);
});

test('group images require a one-use upload request scoped to sender and group', async () => {
  const f = fixture(), send = e => handleRequest(request([e]), env, f.fetcher);
  const source = { type: 'group', groupId: 'Ctest', userId: 'Ualice' };
  const image = () => ({ ...event(), source, message: { type: 'image', id: 'image-test' } });
  await send(image()); assert.equal(f.messages.length, 0); assert.equal(f.projects().length, 0);
  await send({ ...event('upload'), source });
  const gate = f.calls.find(c => c.url === env.UPSTASH_REDIS_REST_URL && JSON.parse(c.options.body)[1]?.startsWith('studio:upload:') && JSON.parse(c.options.body)[0] === 'SET');
  assert.deepEqual(JSON.parse(gate.options.body).slice(-2), ['EX', '120']);
  await send({ ...image(), source: { ...source, groupId: 'Cother' } });
  await send({ ...image(), source: { ...source, userId: 'Ubob' } });
  assert.equal(f.projects().length, 0);
  await send(image()); assert.equal(f.projects()[0].assets.length, 1);
  const replies = f.messages.length;
  await send(image()); assert.equal(f.messages.length, replies); assert.equal(f.projects()[0].assets.length, 1);
  assert.equal(f.calls.filter(c => c.url.startsWith('https://api-data.line.me/')).length, 1);
  f.fail('redis.test'); await send(image()); assert.equal(f.messages.length, replies);
});

test('direct chats accept untagged commands and images, with optional mention', async () => {
  const f = fixture(), send = e => handleRequest(request([e]), env, f.fetcher);
  const create = event(); create.message.text = 'new collector';
  await send(create); assert.equal(f.projects().length, 1);
  await send({ ...event(), message: { type: 'image', id: 'direct-image' } });
  assert.equal(f.projects()[0].assets.length, 1);
  await send(event('status')); assert.match(f.lastMessage(), /สถานะ:/);
  assert.equal(f.messages.at(-1).to, 'Ualice');
  const plain = event(); plain.message.text = 'status';
  await send(plain); assert.match(f.lastMessage(), /สถานะ:/);
});

test('mentioned group commands and errors respond to the same group, not a DM', async () => {
  const f = fixture(), source = { type: 'group', groupId: 'Ctest', userId: 'Ualice' };
  const send = e => handleRequest(request([{ ...e, source }]), env, f.fetcher);
  await send(event('new collector')); assert.equal(f.projects().length, 1);
  assert.equal(f.messages.at(-1).to, 'Ctest');
  const native = event(); native.message = { type: 'text', text: '@Game Creator status', mention: { mentionees: [{ type: 'user', isSelf: true, index: 0, length: 13 }] } };
  await send(native); assert.match(f.lastMessage(), /สถานะ:/); assert.equal(f.messages.at(-1).to, 'Ctest');
  await send(event('x-delete "p_0000000000000000"')); assert.match(f.lastMessage(), /ไม่พบโปรเจกต์/);
  assert.equal(f.messages.at(-1).to, 'Ctest');
  const untrusted = { ...event('new game'), source: { ...source, userId: 'Uother' } };
  await handleRequest(request([untrusted]), env, () => assert.fail('Non-allowlisted group member was processed'));
});
