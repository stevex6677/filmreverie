import { describe, it, expect } from 'vitest';
import { frameAspect, FilmFormat } from '../../src/data/filmFormats';
import { photoCropScale } from '../../src/utils/photoFraming';
import { StoredRoll, validateBundle } from '../../src/storage/rollRepository';
import {
  cameraTurn, filmCropPosition, followsAutomatic, isVertical, placeAutomatically, prefersTurned, reorientForFrameSize,
  setCameraTurn, turnImage, uprightCropPosition, uprightRotation, type FrameSize,
} from '../../src/utils/frameOrientation';

const portrait = { width: 2000, height: 3000, rotation: 0 }, landscape = { width: 3000, height: 2000, rotation: 0 };
const fixed = (format: FilmFormat): FrameSize => ({ format, sizing: 'fixed' });
const kept = (frame: typeof portrait, format: FilmFormat) => {
  const crop = photoCropScale(frame.width / frame.height, frameAspect(format), frame.rotation);
  return crop.x * crop.y;
};

describe('Automatic frame orientation', () => {
  it('turns whichever way keeps more of the photograph in a fixed gate', () => {
    expect(placeAutomatically(portrait, fixed('135')).rotation).toBe(90);
    expect(placeAutomatically(landscape, fixed('135')).rotation).toBe(0);
    // 6×4.5 is taller than wide, so landscapes lie across it.
    expect(placeAutomatically(landscape, fixed('645')).rotation).toBe(90);
    expect(placeAutomatically(portrait, fixed('645')).rotation).toBe(0);
    // A square gate keeps the same share either way and leaves the photograph upright.
    expect(placeAutomatically(portrait, fixed('66')).rotation).toBe(0);
    // A 4:5 portrait loses less on 35mm when turned.
    expect(prefersTurned({ width: 4, height: 5 }, fixed('135'))).toBe(true);
    for (const format of ['135', '645', '66', '67', '69'] as const) for (const frame of [portrait, landscape, { width: 4, height: 5, rotation: 0 }])
      expect(kept(placeAutomatically(frame, fixed(format)), format)).toBeCloseTo(Math.max(kept(frame, format), kept({ ...frame, rotation: 90 }, format)));
  });
  it('runs the long edge along free-size film', () => {
    const free: FrameSize = { format: '135', sizing: 'free' }, placed = placeAutomatically(portrait, free);
    expect(placed.rotation).toBe(90);
    expect(frameAspect('135', 'free', placed)).toBeCloseTo(1.5);
    expect(placeAutomatically(landscape, free).rotation).toBe(0);
    expect(placeAutomatically({ width: 10, height: 10, rotation: 0 }, free).rotation).toBe(0);
  });
  it('moves automatic frames with the frame size and leaves chosen placements alone', () => {
    const auto = placeAutomatically(portrait, fixed('135'));
    expect(reorientForFrameSize(auto, fixed('135'), fixed('66')).rotation).toBe(0);
    expect(reorientForFrameSize(auto, fixed('135'), { format: '66', sizing: 'free' }).rotation).toBe(90);
    // The user kept this portrait upright on 35mm, against the automatic choice.
    const chosen = setCameraTurn(auto, 0);
    expect(followsAutomatic(chosen, fixed('135'))).toBe(false);
    expect(reorientForFrameSize(chosen, fixed('135'), fixed('645'))).toBe(chosen);
    // A vertical frame with its top edge to the left keeps that direction while it stays vertical.
    const left = setCameraTurn(auto, 270);
    expect(reorientForFrameSize(left, fixed('135'), fixed('67')).rotation).toBe(270);
    expect(reorientForFrameSize(left, fixed('135'), fixed('66')).rotation).toBe(0);
  });
  it('turns the image without moving it on the film unless it would stand on its head', () => {
    // A 35mm scan of a vertical shot: landscape pixels with the picture lying on its side.
    const scan = placeAutomatically(landscape, fixed('135'));
    const once = turnImage(scan);
    expect(once).toMatchObject({ rotation: 0, uprightRotation: 90 });
    expect(isVertical(once)).toBe(true);
    expect(cameraTurn(once)).toBe(270);
    expect(followsAutomatic(once, fixed('135'))).toBe(true);
    const twice = turnImage(once);
    expect(twice).toMatchObject({ rotation: 180, uprightRotation: 180 });
    expect(cameraTurn(twice)).toBe(0);
    const all = [once, twice, turnImage(twice), turnImage(turnImage(twice))];
    expect(all.map(frame => cameraTurn(frame))).toEqual([270, 0, 270, 0]);
    expect(all[3]).toMatchObject({ rotation: 0, uprightRotation: 0 });
  });
  it('reads earlier frames as upright scans placed on the film', () => {
    expect(uprightRotation({ ...portrait, rotation: 90 })).toBe(0);
    expect(cameraTurn({ ...portrait, rotation: 90 })).toBe(90);
    expect(uprightRotation({ ...landscape, rotation: 180 })).toBe(180);
    expect(isVertical({ ...landscape, rotation: 180 })).toBe(false);
  });
  it('keeps the selected part of the photograph when the frame turns', () => {
    const frame = { ...portrait, rotation: 0, cropPosition: { x: 0, y: -1 } };
    const vertical = setCameraTurn(frame, 90);
    expect(vertical.cropPosition).toEqual({ x: 1, y: 0 });
    expect(uprightCropPosition(vertical)).toEqual({ x: 0, y: -1 });
    for (const turn of [0, 90, 270] as const) {
      const turned = setCameraTurn(frame, turn), position = { x: .3, y: -.7 };
      expect(filmCropPosition(turned, uprightCropPosition(turned, position))).toEqual(position);
    }
  });
  it('validates stored upright rotations', () => {
    const frame = { id: 'f', rollId: 'r', width: 2, height: 3, rotation: 90, uprightRotation: 0 };
    const roll: StoredRoll = { id: 'r', name: 'Roll', stockId: 'portra-400', format: '135', frameIds: ['f'], coverId: 'f', createdAt: 1, updatedAt: 1, trashedAt: null };
    expect(() => validateBundle({ roll, frames: [frame] })).not.toThrow();
    expect(() => validateBundle({ roll, frames: [{ ...frame, uprightRotation: 45 }] })).toThrow('Invalid frame metadata.');
  });
});
