import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateUuid, sha256Hex, fallbackSha256 } from '../../src/storage/crypto';
import crypto from 'node:crypto';

describe('crypto utilities for secure and insecure contexts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('generates valid RFC 4122 v4 UUIDs using standard crypto.randomUUID when available', () => {
    const uuid = generateUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates valid RFC 4122 v4 UUIDs when crypto.randomUUID is undefined (insecure context)', () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (buf: any) => originalCrypto.getRandomValues(buf)
    });

    const uuids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = generateUuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      uuids.add(id);
    }
    expect(uuids.size).toBe(50);
  });

  it('generates valid UUIDs when crypto is undefined', () => {
    vi.stubGlobal('crypto', undefined);
    const id = generateUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('computes exact SHA-256 matching node crypto with subtle digest', async () => {
    const inputs = [
      new Uint8Array(0),
      new TextEncoder().encode('abc'),
      new TextEncoder().encode('Hello darkroom world!'),
      crypto.randomBytes(1024 * 64)
    ];

    for (const input of inputs) {
      const expected = crypto.createHash('sha256').update(input).digest('hex');
      const actual = await sha256Hex(input);
      expect(actual).toBe(expected);
    }
  });

  it('computes exact SHA-256 matching node crypto without crypto.subtle (insecure context)', async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (buf: any) => originalCrypto.getRandomValues(buf)
      // subtle is omitted
    });

    const inputs = [
      new Uint8Array(0),
      new TextEncoder().encode('abc'),
      new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      new Uint8Array(55).fill(65),
      new Uint8Array(56).fill(65),
      new Uint8Array(64).fill(65),
      new Uint8Array(65).fill(65),
      new Uint8Array(128).fill(65),
      new TextEncoder().encode('Unsecured HTTP photo import test'),
      crypto.randomBytes(1024 * 128)
    ];

    for (const input of inputs) {
      const expected = crypto.createHash('sha256').update(input).digest('hex');
      const actual = await sha256Hex(input);
      expect(actual).toBe(expected);
      expect(fallbackSha256(input)).toBe(expected);
    }
  });
});
