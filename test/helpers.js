import { createHmac } from 'node:crypto';
export const env = { LINE_CHANNEL_SECRET: 'test-secret', LINE_CHANNEL_ACCESS_TOKEN: 'test-token', LINE_ALLOWED_USER_IDS: 'Ualice,Ubob', GITHUB_TOKEN: 'test-gh', GITHUB_OWNER: 'banyapon', GITHUB_REPO: 'linegodotbuild', UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'test-redis', CLOUDINARY_CLOUNDNAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' };
let count = 0;
export function event(text = 'new collector', user = 'Ualice') { return { type: 'message', webhookEventId: `event-${++count}`, replyToken: `reply-${count}`, source: { type: 'user', userId: user }, message: { type: 'text', text: `@gamecreator ${text}` } }; }
export function request(events, signature) {
  const raw = JSON.stringify({ events });
  return new Request('https://example.test/api/webhook', { method: 'POST', body: raw, headers: { 'x-line-signature': signature ?? createHmac('sha256', env.LINE_CHANNEL_SECRET).update(raw).digest('base64') } });
}
export function fixture() {
  const store = new Map(), sets = new Map(), files = new Map(), branches = new Set(), calls = [], messages = [], trees = new Map();
  let failService = '';
  const redis = args => {
    const [cmd, key, ...v] = args;
    if (cmd === 'GET') return store.get(key) ?? null;
    if (cmd === 'SET') { if (v.includes('NX') && store.has(key)) return null; store.set(key, v[0]); return 'OK'; }
    if (cmd === 'DEL') return Number(store.delete(key));
    if (cmd === 'EXPIRE') return 1;
    if (cmd === 'INCR') { const n = Number(store.get(key) || 0) + 1; store.set(key, n); return n; }
    if (cmd === 'EVAL') { if (store.get(v[1]) === v[2]) return Number(store.delete(v[1])); return 0; }
    const set = sets.get(key) || new Set(); sets.set(key, set);
    if (cmd === 'SADD') { set.add(v[0]); return 1; } if (cmd === 'SREM') return Number(set.delete(v[0]));
    if (cmd === 'SCARD') return set.size; if (cmd === 'SMEMBERS') return [...set];
    throw new Error(`Unknown Redis ${cmd}`);
  };
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (failService && url.includes(failService)) return new Response('Unavailable', { status: 503 });
    if (url === env.UPSTASH_REDIS_REST_URL) return Response.json({ result: redis(JSON.parse(options.body)) });
    if (url.startsWith('https://api.line.me/')) { messages.push({ ...JSON.parse(options.body), mode: url.endsWith('/push') ? 'push' : 'reply' }); return Response.json({}); }
    if (url.startsWith('https://api-data.line.me/')) return new Response(new Uint8Array([137,80,78,71,13,10,26,10]), { headers: { 'Content-Type': 'image/png' } });
    if (url.startsWith('https://api.cloudinary.com/')) return Response.json(url.endsWith('/destroy') ? { result: 'ok' } : { secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/asset.png' });
    if (url.startsWith('https://api.github.com/')) {
      if (url.includes('/git/ref/heads/main')) return Response.json({ object: { sha: 'base-sha' } });
      if (url.includes('/git/ref/heads/')) return Response.json({ object: { sha: 'head-sha' } });
      if (url.includes('/git/commits/') && !options.method) return Response.json({ tree: { sha: 'base-tree' } });
      if (url.endsWith('/git/trees')) { const body=JSON.parse(options.body); const sha=`tree-${calls.length}`; trees.set(sha,body.tree); return Response.json({sha}); }
      if (url.endsWith('/git/commits') && options.method==='POST') { const body=JSON.parse(options.body); return Response.json({sha:body.tree}); }
      if (url.includes('/git/refs/heads/') && options.method==='PATCH') { const body=JSON.parse(options.body); const entries=trees.get(body.sha); const snapshot=JSON.parse(entries.find(e=>e.path==='studio/project.json').content); files.set(snapshot.design?`game/${snapshot.owner}/${snapshot.id}`:'unknown',snapshot); return Response.json({}); }
      if (url.endsWith('/git/refs') && options.method === 'POST') { branches.add(JSON.parse(options.body).ref); return Response.json({}); }
      if (url.includes('/git/refs/heads/') && options.method === 'DELETE') { branches.delete('refs/heads/' + decodeURIComponent(url.split('/heads/')[1])); return new Response(null, { status: 204 }); }
      if (url.includes('/contents/studio/project.json')) {
        if (options.method === 'PUT') { const b = JSON.parse(options.body); files.set(b.branch, JSON.parse(Buffer.from(b.content, 'base64').toString())); return Response.json({ content: { sha: `file-${calls.length}` } }); }
        return new Response('Not found', { status: 404 });
      }
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  return { store, files, branches, calls, messages, trees, fetcher, fail(service) { failService = service; }, lastMessage() { const message=messages.at(-1)?.messages[0];if(message?.type==='text')return message.text;const contents=message?.contents;const bubbles=contents?.type==='carousel'?contents.contents:[contents];return bubbles.filter(Boolean).map(b=>b.body.contents.map(x=>x.text||'').join('\n')).join('\n'); }, projects() { return [...store.entries()].filter(([k]) => k.startsWith('studio:project:')).map(([,v]) => JSON.parse(v)); } };
}
