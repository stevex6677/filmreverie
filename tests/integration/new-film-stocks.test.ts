import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FILM_FORMATS, type FilmFormat } from '../../src/data/filmFormats';
import { supportsFilmFormat, type FilmStockId } from '../../src/data/filmStocks';
import { FILM_LOOKS } from '../../src/data/filmLooks';
import { applyFilmLookPerceptualPixel } from '../../src/shaders/filmLook';
import { RollRepository, type RollBundle, validateBundle } from '../../src/storage/rollRepository';
import { validateGalleryRoll } from '../../src/cloud/galleryClient';

function bundle(stockId: FilmStockId, format: FilmFormat): RollBundle {
  return { roll: { id: 'r', name: 'New stock', stockId, format, frameIds: ['f'], coverId: 'f', filmStrength: 65, createdAt: 1, updatedAt: 1, trashedAt: null },
    frames: [{ id: 'f', rollId: 'r', filename: 'photo.jpg', mime: 'image/jpeg', width: 600, height: 400, rotation: 0, hash: 'photo', originalKey: 'o', viewingKey: 'v', thumbnailKey: 't' }],
    blobs: ['o', 'v', 't'].map(key => ({ key, blob: new Blob(['unchanged photo'], { type: 'image/jpeg' }) })) };
}

describe('Fuji 200, Pro Image 100 and Gold 200', () => {
  for (const stockId of ['fuji-200', 'pro-image-100', 'gold-200'] as const) {
    it(`${stockId} validates its real formats and preserves stock, strength and photo bytes`, async () => {
      const repository = new RollRepository(new IDBFactory());
      for (const format of Object.keys(FILM_FORMATS) as FilmFormat[]) {
        const data = bundle(stockId, format), supported = stockId === 'gold-200' || format === '135';
        expect(supportsFilmFormat(stockId, format)).toBe(supported);
        for (const sizing of ['fixed', 'free'] as const) {
          data.roll.sizing = sizing;
          if (supported) {
            expect(() => validateBundle(data)).not.toThrow();
            await repository.save(data);
            const saved = await repository.read('r');
            expect(saved.roll).toMatchObject({ stockId, format, sizing, filmStrength: 65 });
            expect(await (await repository.original('f')).text()).toBe('unchanged photo');
          } else {
            expect(() => validateBundle(data)).toThrow(/only available in 35mm/);
            await expect(repository.save(data)).rejects.toThrow(/only available in 35mm/);
          }
        }
        const image = { url: 'https://photos.example/rolls/revision/photo.jpg', bytes: 12, sha256: 'a'.repeat(64) };
        const publicRoll = { id: 'r', revision: 'revision', name: 'Film', stockId, format, coverId: 'f', publishedAt: 1,
          frames: [{ id: 'f', width: 600, height: 400, rotation: 0, viewing: image, thumbnail: image }] };
        if (supported) expect(() => validateGalleryRoll(publicRoll)).not.toThrow();
        else expect(() => validateGalleryRoll(publicRoll)).toThrow(/invalid roll metadata/);
      }
    });
  }
  it('produces distinct looks, keeps zero exact, and makes Gold warmer than Pro Image and Fuji', () => {
    const pixel = [0.55, 0.45, 0.35] as const;
    const render = (id: FilmStockId, strength: number) => applyFilmLookPerceptualPixel(...pixel, .5, .5, FILM_LOOKS[id], strength, 36, 24, 1, 0);
    const ids = ['fuji-200', 'pro-image-100', 'gold-200'] as const;
    const warmth = ids.map(id => { const c = render(id, 50); return c[0] - c[2]; });
    expect(warmth[2]).toBeGreaterThan(warmth[1]); expect(warmth[1]).toBeGreaterThan(warmth[0]);
    expect(new Set(ids.map(id => JSON.stringify(render(id, 50)))).size).toBe(3);
    for (const id of ids) {
      expect(render(id, 0)).toEqual(pixel);
      const distance = (strength: number) => render(id, strength).reduce((total, value, i) => total + Math.abs(value - pixel[i]), 0);
      expect(distance(100)).toBeGreaterThan(distance(50));
    }
  });
});
