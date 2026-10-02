import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Ray, Vector3 } from 'three';
import { roomRayTarget } from '../../src/utils/roomHitTarget';
import { ROOM_EYE, TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
import { FILM_FORMATS, FilmFormat } from '../../src/data/filmFormats';
import { FILM_PACKAGING } from '../../src/data/filmPackaging';
import { CARTRIDGE_MM, COVER_FRAME_MM, mm, SHELF_CELL_MM, SHELF_WIDTH, SHELF_HEIGHT, SHELF_ORIGIN, SHELF_CAMERA, SHELF_FILM_YAW, SHELF_FRAME_YAW, shelfFov, shelfArrangement } from '../../src/data/physicalScale';
import { createRuntimeRoll, rescaleSavedView } from '../../src/storage/rollRuntime';
import { RollBundle, SavedView } from '../../src/storage/rollRepository';
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, createRollLayout, lightTableSize } from '../../src/utils/rollLayout';
import { getStripDimensions } from '../../src/utils/loupeMapping';

function bundle(format: FilmFormat, count: number): RollBundle {
  const frames = Array.from({ length: count }, (_, i) => ({ id: `${i}`, rollId: 'r', filename: `${i}.jpg`, mime: 'image/jpeg', width: 600, height: 400, rotation: 0, hash: `${i}`, originalKey: `${i}:o`, viewingKey: `${i}:v`, thumbnailKey: `${i}:t` }));
  return { roll: { id: 'r', name: 'Scale', format, stockId: 'portra-400', coverId: '0', frameIds: frames.map(f => f.id), createdAt: 1, updatedAt: 1, trashedAt: null }, frames, blobs: frames.flatMap(f => [f.originalKey, f.viewingKey, f.thumbnailKey].map(key => ({ key, blob: new Blob([key]) }))) };
}
describe('Physical dimensions across the light table and shelf', () => {
  it('keeps 35mm and 120 film at the same millimeter scale for short and full rolls', () => {
    for (const format of Object.keys(FILM_FORMATS) as FilmFormat[]) for (const count of [1, FILM_FORMATS[format].typicalCount]) {
      const runtime = createRuntimeRoll(bundle(format, count));
      try {
        const roll = runtime.definition, table = lightTableSize(roll);
        for (const strip of createRollLayout(roll)) {
          const size = getStripDimensions(strip.layout);
          expect(strip.layout.frameWidth * strip.scale).toBeCloseTo(mm(FILM_FORMATS[format].width), 9);
          expect(size.height * strip.scale).toBeCloseTo(mm(FILM_FORMATS[format].filmWidth), 9);
          expect(size.width * strip.scale).toBeLessThan(table.width - .19);
          expect(Math.abs(strip.y) + size.height * strip.scale / 2).toBeLessThan(table.height / 2 - .09);
        }
      } finally { runtime.dispose(); }
    }
    for (const roll of [BASELINE_ROLL, FULL_ROLL_FIXTURE]) expect(getStripDimensions(createRollLayout(roll)[0].layout).height * roll.scale).toBeCloseTo(mm(35), 9);
    expect(mm(CARTRIDGE_MM.bodyHeight)).toBeGreaterThan(mm(35));
    expect(COVER_FRAME_MM.woodBorder).toBeGreaterThanOrEqual(8);
    expect(COVER_FRAME_MM.woodBorder).toBeLessThan(15);
  });
  it('fits full-size cartons and frames without overlap in every saved and placeholder arrangement', () => {
    for (const entry of FILM_PACKAGING) for (const owned of [false, true]) {
      const stacked = entry.cartridgePlacement === 'on-box';
      const layout = shelfArrangement(entry.sizeMm[0], entry.format === '135' && !stacked, owned, entry.sizeMm[2]);
      if (stacked) expect(entry.sizeMm[1] + CARTRIDGE_MM.height).toBeLessThan(SHELF_CELL_MM.height - 12);
      expect(layout.span).toBeLessThan(mm(SHELF_CELL_MM.width - 16));
      expect(mm(Math.max(entry.sizeMm[1], owned ? COVER_FRAME_MM.height : 0))).toBeLessThan(mm(SHELF_CELL_MM.height - 12));
      expect(mm(entry.sizeMm[2])).toBeLessThan(mm(SHELF_CELL_MM.depth));
      // Check rotated corners against the dividers and back, not unrotated sizes.
      const corners = (width: number, depth: number, yaw: number, x: number, z = 0) => [-1, 1].flatMap(a => [-1, 1].map(b =>
        new Vector3(mm(a * width / 2), 0, mm(b * depth / 2)).applyAxisAngle(new Vector3(0, 1, 0), yaw).add(new Vector3(x, 0, mm(z)))));
      const film = entry.format === '135'
        ? corners(CARTRIDGE_MM.capDiameter, CARTRIDGE_MM.capDiameter, 0, layout.filmX)
        : corners(entry.sizeMm[0], entry.sizeMm[2], SHELF_FILM_YAW, layout.filmX);
      const box = corners(entry.sizeMm[0], entry.sizeMm[2], SHELF_FILM_YAW, layout.boxX);
      const frame = owned ? corners(COVER_FRAME_MM.width, COVER_FRAME_MM.depth + .6, SHELF_FRAME_YAW, layout.companionX, 6) : [];
      for (const p of [...film, ...box, ...frame]) {
        expect(Math.abs(p.x)).toBeLessThan(mm(SHELF_CELL_MM.width / 2 - 4));
        expect(Math.abs(p.z)).toBeLessThan(mm(SHELF_CELL_MM.depth / 2 - 3));
      }
      if (entry.format === '135' && !stacked) expect(Math.min(...box.map(p => p.x)) - Math.max(...film.map(p => p.x))).toBeGreaterThanOrEqual(mm(11.9));
      if (frame.length) expect(Math.min(...frame.map(p => p.x)) - Math.max(...box.map(p => p.x))).toBeGreaterThanOrEqual(mm(11.9));
    }
    expect(SHELF_ORIGIN[2] + mm(SHELF_CELL_MM.depth / 2)).toBeLessThan(-.9);
  });
  it('fits the entire cabinet in portrait, landscape and desktop cameras', () => {
    for (const aspect of [390/844, 844/390, 1280/800, 820/1180]) {
      const camera = new PerspectiveCamera(shelfFov(aspect), aspect, .04, 100);
      camera.position.set(...SHELF_CAMERA); camera.lookAt(...SHELF_ORIGIN); camera.updateMatrixWorld();
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        const p = new Vector3(x * SHELF_WIDTH / 2, SHELF_ORIGIN[1] + y * SHELF_HEIGHT / 2, SHELF_ORIGIN[2] + mm(SHELF_CELL_MM.depth / 2)).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(.96); expect(Math.abs(p.y)).toBeLessThan(.8);
      }
    }
  });
  it('picks the nearest physical surface where shelf and table overlap in perspective', () => {
    const origin = new Vector3(...ROOM_EYE);
    const toward = (x: number, y: number, z: number) => new Ray(origin, new Vector3(x, y, z).sub(origin).normalize());
    const table = { width: 3.6, height: 1.8 };
    for (const x of [-1.5, 0, 1.5]) for (const z of [-.85, 0, .65]) {
      expect(roomRayTarget(toward(x, TABLE_SURFACE_Y, z), table)).toBe('table');
    }
    expect(roomRayTarget(toward(...SHELF_ORIGIN), table)).toBe('shelf');
    expect(roomRayTarget(toward(5, 3, -1), table)).toBeNull();
  });
  it('rescales old view coordinates once, retaining the photographed area and overview', () => {
    const runtime = createRuntimeRoll(bundle('135', 5));
    const view: SavedView = { frameId: '0', level: 'frame', mode: 'positive', brightness: 1, magnification: 4, zoom: 1.2, pan: { x: .3, z: .2 }, overview: { frameIndex: 0, zoom: 2, pan: { x: .1, z: -.1 } } };
    try {
      const updated = rescaleSavedView(view, runtime.definition)!;
      const ratio = runtime.definition.scale / .6;
      expect(updated.zoom).toBeCloseTo(view.zoom * ratio);
      expect(updated.pan.x).toBeCloseTo(view.pan.x * ratio);
      expect(updated.pan.z + .1).toBeCloseTo((view.pan.z + .1) * ratio);
      expect(updated.overview!.zoom).toBeCloseTo(2 * ratio);
      expect(rescaleSavedView(updated, runtime.definition)).toEqual(updated);
      expect(view.filmScale).toBeUndefined();
    } finally { runtime.dispose(); }
  });
});
