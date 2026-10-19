import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Expo SQLite's web worker requires cross-origin isolation, including on HTML.
// Serve the exported app instead of relying on Metro's asset-only middleware.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/mobile/dist');
const port = Number(process.env.WEB_PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid WEB_PORT');
await stat(resolve(root, 'index.html'));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};
const server = createServer(async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.url?.split('?')[0] === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    let info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      // History-based Expo Router paths use the same app shell. Missing assets do not.
      if (extname(pathname) || pathname.startsWith('/_expo/') || pathname.startsWith('/assets/')) {
        res.writeHead(404); res.end(); return;
      }
      file = resolve(root, 'index.html'); info = await stat(file);
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch {
    res.writeHead(400); res.end('Invalid request');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Bruce’s Life is ready: http://localhost:${port}\nChoose “Try with sample data” to explore offline.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
