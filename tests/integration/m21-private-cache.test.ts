import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

describe('private network boundaries under the installed service worker', () => {
  it('lets owner login navigation, draft reads, upload mutations and Access redirects reach the network', () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const source = readFileSync('src/offline/worker.js', 'utf8');
    runInNewContext(source, {
      __DARKROOM_RELEASE__: 'test-release', __DARKROOM_ASSETS__: [{ url: '/index.html', hash: 'unused' }], __DARKROOM_OPTIONAL__: [], URL,
      self: { location: { origin: 'https://filmreverie.app' }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) },
    });
    for (const [path, method, mode] of [
      ['/api/owner/session', 'GET', 'navigate'], ['/api/owner/drafts', 'GET', 'cors'],
      ['/api/owner/uploads', 'POST', 'cors'], ['/cdn-cgi/access/login', 'GET', 'navigate'],
      ['/api/gallery', 'GET', 'cors'],
    ]) {
      let intercepted = false;
      handlers.get('fetch')!({ request: { url: `https://filmreverie.app${path}`, method, mode }, respondWith: () => { intercepted = true; } });
      expect(intercepted, `${method} ${path}`).toBe(false);
    }
  });
});
