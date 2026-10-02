import { expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildSync } from 'esbuild';

it('native R2 seals matching derivatives and rejects same-size corruption without retaining partial copies', async () => {
  // Execute the real completion code inside workerd so R2 body streams retain
  // their native fixed length (Node's RPC bridge loses that stream metadata).
  const script = buildSync({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    import { completeUpload, completedUpload, grantUpload } from './cloudflare/storage';
    import { hash, kinds } from './cloudflare/types';
    export default { async fetch(request, bindings) {
      const env = { ...bindings, R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'test-key',
        R2_SECRET_ACCESS_KEY: 'test-secret', PRIVATE_BUCKET_NAME: 'test-private' };
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const image = { bytes: bytes.length, mime: 'image/jpeg', sha256: await hash(bytes) };
      const grant = await grantUpload(env, { viewing: image, thumbnail: image });
      const corrupt = new URL(request.url).pathname === '/corrupt';
      for (const kind of kinds) {
        const body = bytes.slice();
        if (corrupt && kind === 'thumbnail') body[body.length - 1] ^= 1;
        await env.PRIVATE_BUCKET.put('staging/' + grant.id + '/' + kind, body,
          { httpMetadata: { contentType: 'image/jpeg' } });
      }
      try {
        await completeUpload(env, grant.id);
        return Response.json({ id: grant.id, completed: await completedUpload(env, grant.id) });
      } catch (error) { return Response.json({ id: grant.id, error: error.message }); }
    } }` }, bundle: true, format: 'esm', platform: 'browser', write: false }).outputFiles[0].text;
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script,
    compatibilityDate: '2026-09-25', r2Buckets: ['PRIVATE_BUCKET'] }));
  try {
    const bucket = await mf.getR2Bucket('PRIVATE_BUCKET');
    const valid = await (await mf.dispatchFetch('http://localhost/valid')).json() as { id: string; error?: string; completed: { images: Record<string, { key: string }> } };
    expect(valid.error).toBeUndefined();
    for (const image of Object.values(valid.completed.images)) {
      const stored = await bucket.get(image.key);
      expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
      expect(stored!.checksums.sha256).toBeDefined();
    }
    const corrupt = await (await mf.dispatchFetch('http://localhost/corrupt')).json() as { id: string; error?: string };
    expect(corrupt.error).toMatch(/SHA-256|checksum/i);
    expect(await bucket.head(`uploads/completed/${corrupt.id}.json`)).toBeNull();
    expect((await bucket.list({ prefix: `sealed/${corrupt.id}/` })).objects).toHaveLength(0);
  } finally { await mf.dispose(); }
}, 20000);
