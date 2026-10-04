import { describe, it, expect } from 'vitest';
import { frameAspect, FilmFormat } from '../../src/data/filmFormats';
import { photoCropScale, uprightThumbnail } from '../../src/utils/photoFraming';
import { BASELINE_ROLL, clampFocusPan, fitRollView, focusFrameLayout, focusTableAngle, locateFrame, type RollDefinition } from '../../src/utils/rollLayout';
import { getStripDimensions } from '../../src/utils/loupeMapping';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
import { validateGalleryRoll } from '../../src/cloud/galleryClient';
import { screenToTable, tableInputCamera } from '../../src/utils/tableCamera';
import { Vector3 } from 'three';
import { StoredRoll, validateBundle } from '../../src/storage/rollRepository';
import {
  cameraTurn, filmCropPosition, followsAutomatic, isVertical, placeAutomatically, prefersTurned, reorientForFrameSize,
  setCameraTurn, turnImage, uprightCropPosition, uprightRotation, uprightYaw, type FrameSize,
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
    for (const format of ['135', '135-half', '645', '66', '67', '69'] as const) for (const frame of [portrait, landscape, { width: 4, height: 5, rotation: 0 }])
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

describe('Upright viewing of vertical shots', () => {
  const vertical: RollDefinition = { ...BASELINE_ROLL, rollId: 'vertical', frames: BASELINE_ROLL.frames.map((frame, i) => ({ ...frame, rotation: [0, 90, 180, 270, 90][i], uprightRotation: i === 4 ? 90 : undefined })) };

  it('turns Focus so a vertical shot stands upright, and only then', () => {
    expect([0, 1, 2, 3, 4].map(i => focusTableAngle(vertical, i))).toEqual([0, -Math.PI / 2, 0, Math.PI / 2, 0].map(yaw => ({ tilt: 0, yaw })));
    expect(uprightYaw({})).toBe(0);
  });

  it('fits a vertical frame in Focus with the film running up the screen', () => {
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      const frame = locateFrame(vertical, 1), outer = getStripDimensions(focusFrameLayout(vertical, 1));
      const visible = 2 * fitRollView(vertical, 'frame', 1, aspect).zoom * Math.tan(Math.PI / 8);
      expect(visible).toBeGreaterThanOrEqual(frame.strip.layout.frameWidth * vertical.scale * 1.2 - 1e-12);
      expect(visible * aspect).toBeGreaterThanOrEqual(outer.height * vertical.scale * 1.16 - 1e-12);
      // Horizontal frames keep their framing.
      expect(fitRollView(vertical, 'frame', 0, aspect)).toEqual(fitRollView(BASELINE_ROLL, 'frame', 0, aspect));
    }
  });

  it('lets Focus pan along the film by what overflows the screen height', () => {
    const aspect = 16 / 9, zoom = fitRollView(vertical, 'frame', 1, aspect).zoom * .3, frame = locateFrame(vertical, 1);
    const outer = getStripDimensions(focusFrameLayout(vertical, 1)), visible = 2 * zoom * Math.tan(Math.PI / 8);
    const far = clampFocusPan(vertical, 1, zoom, aspect, frame.x + 10, 10);
    expect(far.x - frame.x).toBeCloseTo((outer.width * vertical.scale - visible) / 2, 12);
    expect(far.z - (TABLE_CENTER_Z - frame.y)).toBeCloseTo(Math.max(0, (outer.height * vertical.scale - visible * aspect) / 2), 12);
  });

  it('moves the loupe across the turned screen, not the table', () => {
    for (const index of [0, 1, 3]) {
      const angle = focusTableAngle(vertical, index), frame = locateFrame(vertical, index);
      const camera = tableInputCamera(.3, { x: frame.x, z: TABLE_CENTER_Z - frame.y }, angle, 16 / 9);
      const screen = (right: number, up: number) => { const move = screenToTable(angle.yaw, right, up); return new Vector3(frame.x + move.x, TABLE_SURFACE_Y, TABLE_CENTER_Z - frame.y - move.y).project(camera); };
      const origin = screen(0, 0), right = screen(.01, 0), up = screen(0, .01);
      expect(right.x - origin.x, `${index}`).toBeGreaterThan(.01); expect(Math.abs(right.y - origin.y)).toBeLessThan(1e-6);
      expect(up.y - origin.y, `${index}`).toBeGreaterThan(.01); expect(Math.abs(up.x - origin.x)).toBeLessThan(1e-6);
    }
  });

  it('shows frame-picker thumbnails upright, as tall as the others', () => {
    const gate = 1.5;
    const upright = uprightThumbnail({ aspectRatio: 2 / 3, rotation: 90 }, gate), level = uprightThumbnail({ aspectRatio: 3 / 2, rotation: 0 }, gate);
    expect(level.box).toMatchObject({ aspectRatio: 1.5, width: '100%' });
    expect(upright.box.aspectRatio).toBeCloseTo(2 / 3, 12);
    expect(parseFloat(upright.box.width) / 100 / upright.box.aspectRatio).toBeCloseTo(1 / gate, 12);
    expect(upright.image.transform).toContain('rotate(0deg)');
    // A sideways scan turns upright, whichever way the camera was held.
    expect(uprightThumbnail({ aspectRatio: 3 / 2, rotation: 0, uprightRotation: 90 }, gate).image.transform).toContain('rotate(90deg)');
  });

  it('reads which way is up from published gallery frames', () => {
    const image = { url: 'https://photos.example.com/a.jpg', bytes: 1, sha256: 'a'.repeat(64) };
    const roll = { id: 'g', revision: 'r', name: 'Gallery', stockId: 'portra-400', format: '135', coverId: 'f', publishedAt: 1,
      frames: [{ id: 'f', width: 2000, height: 3000, rotation: 90, uprightRotation: 0, viewing: image, thumbnail: image }] };
    expect(() => validateGalleryRoll(roll)).not.toThrow();
    expect(() => validateGalleryRoll({ ...roll, frames: [{ ...roll.frames[0], uprightRotation: 45 }] })).toThrow('invalid image metadata');
  });
});
