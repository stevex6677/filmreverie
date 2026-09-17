import { createServer as httpServer, Server, RequestListener } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// Serve the real production dist on an isolated ephemeral origin. Faults are
// server-side, so service-worker downloads encounter real HTTP failures.
export async function offlineServer(tls = false) {
  let fail = '', release = '', requests = 0, temporary = '';
  const handle: RequestListener = async (req, res) => {
    requests++;
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === fail) { res.writeHead(503); res.end('Interrupted download'); return; }
    let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative.includes('..')) { res.writeHead(400);res.end();return; }
    try {
      let data = await readFile(path.join('dist', relative));
      if (relative === 'sw.js' && release) data = Buffer.from(data.toString().replace(/const RELEASE = "[^"]+";/, `const RELEASE = "${release}";`));
      const mime: Record<string,string> = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(relative)] || 'application/octet-stream', 'Cache-Control':'no-store' });res.end(data);
    } catch { res.writeHead(404);res.end('Not found'); }
  };
  let server: Server;
  if (tls) {
    temporary = await mkdtemp(path.join(os.tmpdir(),'darkroom-tls-'));
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temporary,'key.pem'),'-out',path.join(temporary,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
    server = httpsServer({key:await readFile(path.join(temporary,'key.pem')),cert:await readFile(path.join(temporary,'cert.pem'))},handle);
  } else server = httpServer(handle);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url = `${tls?'https':'http'}://127.0.0.1:${(server.address() as {port:number}).port}`;
  return { url, fail(pathname:string) {fail=pathname;}, release(value:string) {release=value;}, requests:()=>requests,
    async stop() { if(server.listening) await new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();});if(temporary)await rm(temporary,{recursive:true,force:true}); } };
}
