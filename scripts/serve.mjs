import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = process.env.DIR || join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
  try {
    const body = await readFile(join(dist, path || 'index.html'));
    res.writeHead(200, { 'content-type': types[extname(path || 'x.html')] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(Number(process.env.PORT) || 4173, () => console.log('serving dist'));
