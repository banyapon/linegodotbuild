import { createServer } from 'node:http';
import { handleRequest } from '../lib/bot.js';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

createServer(async (req, res) => {
  try {
    if (!req.url.startsWith('/api/')) {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost:3000').pathname);
      const relative = pathname.startsWith('/play/') ? '/play.html' : pathname === '/' ? '/index.html' : ['/privacy', '/terms'].includes(pathname) ? `${pathname}/index.html` : pathname;
      const file = resolve(root, `.${relative}`);
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(data); }
      catch { res.writeHead(404).end('Not found'); }
      return;
    }
    const request = new Request(`http://localhost:${Number(process.env.PORT || 3000)}${req.url}`, {
      method: req.method, headers: req.headers,
      ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: req, duplex: 'half' }),
    });
    const response = await handleRequest(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500).end(); }
}).listen(Number(process.env.PORT || 3000), () => console.log(`http://localhost:${process.env.PORT || 3000}/api/health`));
