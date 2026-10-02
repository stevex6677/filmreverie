import { describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FILM_STOCKS } from '../../src/data/filmStocks';
import { FILM_LOOKS } from '../../src/data/filmLooks';
import { applyFilmLookPerceptualPixel, createFilmLookPreview, smoothstep } from '../../src/shaders/filmLook';
import { RollBundle, RollRepository, validateBundle } from '../../src/storage/rollRepository';
import { createRuntimeRoll } from '../../src/storage/rollRuntime';

function bundle(strengths: (number | undefined)[], rollStrength?: number): RollBundle {
  const ids = strengths.map((_, i) => `frame-${i}`);
  return { roll: { id: 'roll', name: 'Roll', filmStrength: rollStrength, stockId: 'portra-400', format: '135', frameIds: ids, coverId: ids[0], createdAt: 1, updatedAt: 1, trashedAt: null },
    frames: ids.map((id, i) => ({ id, rollId: 'roll', filename: `${id}.png`, mime: 'image/png', width: 600, height: 400, rotation: 0, hash: id,
      originalKey: `${id}:original`, viewingKey: `${id}:view`, thumbnailKey: `${id}:thumb`, ...(strengths[i] === undefined ? {} : { filmStrength: strengths[i] }) })),
    blobs: ids.flatMap(id => ['original', 'view', 'thumb'].map(key => ({ key: `${id}:${key}`, blob: new Blob([id + key]) }))) };
}

describe('Roll editor film strength', () => {
  it('editor preview matches the reference film look pixel for pixel', () => {
    const width = 23, height = 17, source = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < source.length; i += 4) {
      const p = i / 4;
      source.set([(p * 37) % 256, (p * 91 + 40) % 256, (p * 13 + 200) % 256, 255], i);
    }
    for (const stock of FILM_STOCKS) {
      const look = FILM_LOOKS[stock.id], widthMm = 36, heightMm = 24, seed = 4242;
      const render = createFilmLookPreview({ data: source }, width, height, look, widthMm, heightMm, seed);
      const resolved = 1 - smoothstep(.8, 2.8, Math.max(widthMm * look.grainPerMm / width, heightMm * look.grainPerMm / height));
      for (const strength of [0, 1, 37, 50, 100]) {
        const target = new Uint8ClampedArray(source.length);
        render(strength, target);
        for (let p = 0; p < width * height; p++) {
          const i = p * 4, x = p % width, y = Math.floor(p / width);
          const expected = applyFilmLookPerceptualPixel(source[i] / 255, source[i + 1] / 255, source[i + 2] / 255, x / width, y / height, look, strength, widthMm, heightMm, seed, resolved)
            .map(value => Math.round(value * 255));
          expect([target[i], target[i + 1], target[i + 2], target[i + 3]], `${stock.id} ${strength} pixel ${p}`).toEqual([...expected, 255]);
        }
      }
    }
  });

  it('validates per-frame strengths and passes them to the light table runtime', async () => {
    expect(() => validateBundle(bundle([0, 100], 50))).not.toThrow();
    for (const invalid of [-1, 101, Number.NaN]) expect(() => validateBundle(bundle([invalid, 50]))).toThrow(/film effect strength/);
    expect(() => validateBundle(bundle([50], 120))).toThrow(/film effect strength/);
    const repository = new RollRepository(new IDBFactory(), 'film-strength-editor');
    await repository.save(bundle([20, undefined, 90], 65));
    const saved = await repository.read('roll');
    expect(saved.roll.filmStrength).toBe(65);
    expect(saved.frames.map(frame => frame.filmStrength)).toEqual([20, undefined, 90]);
    globalThis.URL.createObjectURL ??= () => 'blob:test';
    globalThis.URL.revokeObjectURL ??= () => {};
    const runtime = createRuntimeRoll(saved);
    expect(runtime.definition.frames.map(frame => frame.filmStrength)).toEqual([20, undefined, 90]);
    runtime.dispose();
  });

  it('keeps the starting strength per browser library separately and ignores invalid stored values', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
    try {
      const guest = new RollRepository(new IDBFactory(), 'darkroom-guest-rolls'), local = new RollRepository(new IDBFactory());
      expect(await guest.preferences()).toEqual({});
      await guest.savePreferences({ filmStrength: 30 });
      expect(await guest.preferences()).toEqual({ filmStrength: 30 });
      expect(values.get('darkroom-guest-rolls-preferences')).toBe('{"filmStrength":30}');
      expect(await local.preferences()).toEqual({});
      await expect(guest.savePreferences({ filmStrength: 101 })).rejects.toThrow(/film effect strength/);
      expect(await guest.preferences()).toEqual({ filmStrength: 30 });
      values.set('darkroom-guest-rolls-preferences', '{"filmStrength":"strong"}');
      expect(await guest.preferences()).toEqual({});
    } finally { vi.unstubAllGlobals(); }
  });
});
