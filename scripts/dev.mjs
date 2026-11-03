import { createServer } from 'node:http';
import { handleRequest } from '../lib/bot.js';

createServer(async (req, res) => {
  try {
    const request = new Request(`http://localhost:3000${req.url}`, {
      method: req.method, headers: req.headers,
      ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: req, duplex: 'half' }),
    });
    const response = await handleRequest(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500).end(); }
}).listen(3000, () => console.log('http://localhost:3000/api/health'));
