import { expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FILM_UNIT, filmLengthUsage } from '../../src/data/filmFormats';
import { createGalleryRuntime } from '../../src/cloud/galleryClient';
import type { GalleryRoll } from '../../src/cloud/contracts';
import { RollRepository, validateBundle, type RollBundle } from '../../src/storage/rollRepository';
import { createRuntimeRoll } from '../../src/storage/rollRuntime';
import { createRollLayout, locateFrame, mapRollPoint } from '../../src/utils/rollLayout';
import { getPerforationPositions } from '../../src/utils/loupeMapping';
import { isMediumFormat } from '../../src/screening/reels';
import { placeAutomatically, reorientForFrameSize } from '../../src/utils/frameOrientation';

function bundle(count: number): RollBundle {
  const frames = Array.from({ length: count }, (_, i) => ({
    id: `f${i}`, rollId: 'half', filename: `${i}.jpg`, mime: 'image/jpeg', width: 180, height: 240, rotation: 0,
    hash: `${i}`, originalKey: `${i}:o`, viewingKey: `${i}:v`, thumbnailKey: `${i}:t`,
  }));
  return {
    roll: { id: 'half', name: 'Half frame', stockId: 'ultramax-400', format: '135-half', sizing: 'fixed', frameIds: frames.map(f => f.id), coverId: 'f0', createdAt: 1, updatedAt: 1, trashedAt: null },
    frames, blobs: frames.flatMap(f => [f.originalKey, f.viewingKey, f.thumbnailKey].map(key => ({ key, blob: new Blob([key]) }))),
  };
}

it('fits 72 exposures in nominal 35mm length, allows the existing 25% extra, and rejects overfull edits atomically', async () => {
  const repo = new RollRepository(new IDBFactory()), data = bundle(72);
  expect(filmLengthUsage('135-half', 'fixed', data.frames)).toMatchObject({ used: 1404, nominal: 1404, capacity: 1755, usingExtra: false, exceeded: false });
  await repo.save(data);
  const saved = await repo.read('half');
  expect(saved.roll.format).toBe('135-half');
  expect(saved.frames).toHaveLength(72);
  expect(filmLengthUsage('135-half', 'fixed', bundle(90).frames)).toMatchObject({ used: 1755, remaining: 0, usingExtra: true, exceeded: false });
  expect(() => validateBundle(bundle(90))).not.toThrow();
  await expect(repo.save(bundle(91))).rejects.toThrow('film length');
  expect((await repo.read('half')).frames).toHaveLength(72);
  expect(filmLengthUsage('135-half', 'free', data.frames)).toEqual(filmLengthUsage('135', 'free', data.frames));
});

it('renders local and published half frames with identical gates, strips and 35mm perforation pitch', () => {
  const data = bundle(72), local = createRuntimeRoll(data);
  const image = { url: 'https://photos.example/half.jpg', bytes: 1, sha256: 'a'.repeat(64) };
  const published: GalleryRoll = { ...data.roll, revision: 'rev', publishedAt: 1, frames: data.frames.map(frame => ({ ...frame, viewing: image, thumbnail: image })) };
  const gallery = createGalleryRuntime(published, data.frames.map(frame => ({ frameId: frame.id, kind: 'viewing', bytes: new ArrayBuffer(1), mime: 'image/jpeg' })));
  try {
    for (const { definition } of [local, gallery]) {
      expect(isMediumFormat(definition)).toBe(false);
      const strips = createRollLayout(definition);
      expect(strips).toHaveLength(6);
      for (const strip of strips) {
        expect(strip.frames).toHaveLength(12);
        expect(strip.layout.frameWidth / FILM_UNIT).toBeCloseTo(18);
        expect(strip.layout.frameHeight / FILM_UNIT).toBeCloseTo(24);
        expect(strip.layout.gap / FILM_UNIT).toBeCloseTo(1.5);
        const holes = getPerforationPositions(strip.layout);
        expect(holes.top).toHaveLength(48);
        expect(holes.bottom).toHaveLength(48);
        expect((holes.top[1].x - holes.top[0].x) / FILM_UNIT).toBeCloseTo(39 / 8);
      }
      definition.frames.forEach((_, i) => expect(mapRollPoint(definition, locateFrame(definition, i))).toMatchObject({ frameIndex: i, isWithinFrame: true }));
    }
  } finally { local.dispose(); gallery.dispose(); }
});

it('keeps portraits upright and reorients automatic full-frame placements when changing to half frame', () => {
  const full = { format: '135', sizing: 'fixed' } as const, half = { format: '135-half', sizing: 'fixed' } as const;
  const portrait = { width: 180, height: 240, rotation: 0 };
  expect(placeAutomatically(portrait, half).rotation).toBe(0);
  expect(placeAutomatically({ ...portrait, width: 240, height: 180 }, half).rotation).toBe(90);
  expect(reorientForFrameSize(placeAutomatically(portrait, full), full, half).rotation).toBe(0);
});
