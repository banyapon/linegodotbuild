import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSource, sourceDocument, sourceHeaders, spaceSource, generateSource } from '../lib/game-source.js';
import { joystickVector } from '../shared/joystick.js';
import { lineCard } from '../lib/cards.js';
import { command, ownerId } from '../lib/projects.js';
import { template } from '../lib/designer.js';
import { handleRequest } from '../lib/bot.js';
import { fixture, env, event, request } from './helpers.js';

test('joystick dead zone and diagonal normalization preserve analog magnitude', () => {
  assert.deepEqual(joystickVector(2, 2, 50), { x: 0, y: 0 });
  const p = joystickVector(100, 100, 50); assert(Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-8);
  const half = joystickVector(25, 0, 50); assert(half.x > 0 && half.x < 1); assert.equal(half.y, 0);
});
test('custom game HTML strips executable tags, event handlers and non-asset URLs', () => {
  const source = validateSource('<h1 onclick="evil()">Hello</h1><script>evil()</script><iframe src="https://evil.test"></iframe><img src="https://evil.test/a.png"><a href="javascript:evil()">go</a>', 'document.body.dataset.ready="yes";');
  assert(!source.html.includes('onclick')); assert(!source.html.includes('<script')); assert(!source.html.includes('<iframe')); assert(!source.html.includes('evil.test')); assert(!source.html.includes('javascript:'));
  assert.throws(() => validateSource('<canvas></canvas>', 'let = ;'));
});
test('standalone source contains joystick bridge and separate index.js, sandbox policy blocks privileged APIs', () => {
  const source = spaceSource(), html = sourceDocument(source);
  assert(html.includes('StudioInput')); assert(html.includes('Virtual Joystick')); assert(html.includes('src="./index.js"'));
  const headers = sourceHeaders('https://example.test', '/api/games/a/b/index.js', source);
  assert.match(headers['Content-Security-Policy'], /sandbox allow-scripts/); assert(!headers['Content-Security-Policy'].includes('allow-same-origin')); assert.match(headers['Content-Security-Policy'], /connect-src 'none'/);
});
test('LINE card offers scoped actions, play URI and preserves text fallback', () => {
  const id='p_1234567890123456', owner=ownerId('Ualice');
  const [card] = lineCard(`เกมพร้อมเล่นแล้ว\nMy Game\nhttps://linegodotbuild.vercel.app/play/${owner}/${id}\n${id}`, env);
  assert.equal(card.type,'flex'); assert(card.altText.includes('My Game'));
  const actions=card.contents.footer.contents.map(x=>x.action);
  assert(actions.some(a=>a.type==='uri'&&a.uri.includes('/play/')));
  assert(actions.some(a=>a.text===`@gamecreator publish ${id}`)); assert.equal(command(`publish ${id}`).type,'publish');
  assert(actions.some(a=>a.text===`@gamecreator x-delete "${id}"`));
});
test('new space → branch files → publish → serve source → delete revokes both files', async () => {
  const f=fixture(), send=e=>handleRequest(request([e]),env,f.fetcher);
  await send(event('new space')); const p=f.projects()[0]; assert.equal(p.design.mode,'custom');
  const entries=[...f.trees.values()].at(-1); assert(entries.some(x=>x.path==='index.html')); assert(entries.some(x=>x.path==='index.js'));
  await send(event(`publish ${p.id}`));
  for(const name of ['index.html','index.js']){
    const r=await handleRequest(new Request(`https://test/api/games/${p.owner}/${p.id}/${name}`),env,f.fetcher); assert.equal(r.status,200);
    if(name==='index.html') assert.match(r.headers.get('content-security-policy'),/sandbox allow-scripts/);
  }
  const revision=JSON.parse(f.store.get(`studio:project:${p.id}`)); revision.source.js+='\n// draft change'; await f.store.set(`studio:project:${p.id}`,JSON.stringify(revision));
  const published=await (await handleRequest(new Request(`https://test/api/games/${p.owner}/${p.id}/index.js`),env,f.fetcher)).text(); assert(!published.includes('draft change'));
  await send(event(`x-delete "${p.id}"`));
  assert.equal((await handleRequest(new Request(`https://test/api/games/${p.owner}/${p.id}/index.js`),env,f.fetcher)).status,404);
});
test('Gemini free generation returns executable source files instead of selecting a fixed template', async () => {
  const output={title:'Racing Birds',description:'Avoid rocks',indexHtml:'<canvas id="game"></canvas>',indexJs:'document.querySelector("canvas").dataset.game="racing";',engine:'canvas',reply:'เพิ่มสนามแข่งแล้ว อยากปรับอะไรต่อ?'};
  const result=await generateSource({design:template('2d','custom'),assets:[],history:[]},'เกมนกแข่ง',{GEMINI_API_KEY:'test-key'},{call:async (_service,_url,options)=>{
    const body=JSON.parse(options.body); assert.equal(body.generationConfig.responseMimeType,'application/json'); assert(body.systemInstruction.parts[0].text.includes('indexJs'));
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}]});
  }});
  assert.equal(result.design.mode,'custom'); assert(result.source.js.includes('racing')); assert.equal(result.design.title,'Racing Birds');
});
