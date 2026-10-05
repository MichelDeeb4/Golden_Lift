// Local preview of the exported SPA. Public files only; no directory listing or provider proxy.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const root = path.resolve('apps/storefront/dist'),
  port = Number(process.env.STOREFRONT_PREVIEW_PORT ?? 8082);
if (!fs.existsSync(path.join(root, 'index.html')))
  throw new Error('Run npm run storefront:build first.');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.json': 'application/json',
};
const server = http.createServer((req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method ?? '')) {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(pathname)) {
        res.writeHead(404);
        res.end();
        return;
      }
      file = path.join(root, 'index.html');
    }
    const size = fs.statSync(file).size;
    res.writeHead(200, {
      'content-type': types[path.extname(file)] ?? 'application/octet-stream',
      'content-length': size,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(400);
    res.end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Golden Lift exported preview: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
