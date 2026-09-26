// Small production-only preview for constrained test hosts. No bundler/HMR
// worker pool is needed to serve an already-built offline release.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const port = Number(process.env.PORT ?? 5178);
const hosts = new Set((process.env.FILM_PHOTO_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,[::1],macbook,macbook.tail2b1388.ts.net').split(',').map(host => host.trim()));
const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.wasm':'application/wasm' };
const server = http.createServer(async (request, response) => {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    if (!hosts.has(new URL(`http://${request.headers.host}`).hostname)) { response.writeHead(403); response.end('Host not allowed'); return; }
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + (pathname === '/' || pathname === '/guest' || pathname === '/guest/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Production preview: http://127.0.0.1:${port}`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
