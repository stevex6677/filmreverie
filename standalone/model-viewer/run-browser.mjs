import { spawn } from 'node:child_process';
import { root } from './catalog.mjs';
// Test this checkout on an ephemeral loopback port, never the deployed service.
const server = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PREVIEW_HOST: '127.0.0.1', PREVIEW_PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Viewer test server timeout')), 15000);
    server.stdout.on('data', chunk => { const match = chunk.toString().match(/http:\/\/[^\s]+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Viewer server exited ${code}`)); });
  });
  const test = spawn(process.execPath, ['verify.mjs'], { cwd: root, env: { ...process.env, PREVIEW_URL: url }, stdio: 'inherit' });
  process.exitCode = await new Promise(resolve => test.once('exit', code => resolve(code ?? 1)));
} finally { server.kill('SIGTERM'); }
