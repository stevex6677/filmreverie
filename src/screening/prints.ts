import { createRollLayout, locateFrame, type RollDefinition } from '../utils/rollLayout';
import { ROOM_ENVELOPE } from '../utils/cameraBounds';
import { photoCropOffset, photoCropScale } from '../utils/photoFraming';
import { uprightPlacement } from '../utils/frameOrientation';

// Darkroom Prints: each film strip becomes a line of prints hung along the left
// wall above the printing station. Positions are world coordinates, shared by
// the timeline (camera) and the scene (prints), and are pure for tests.

/** Prints hang 10 cm in front of the left wall, clear of the printing bench. */
export const PRINT_WALL_X = -ROOM_ENVELOPE.width / 2 + .1;
const LONG_SIDE = .46;                 // ≈ 5 inch print, long side, in world units
const BORDER = .028;                   // white paper border
const ROWS_PER_PANEL = 6;
const ROW_GAP = .07;                   // clear wall between a row's prints and the next line
const TOP_LINE = 2.2, LOWEST_EDGE = -.68; // highest line; paper stays above the printing bench (−.76)
const WALL_FROM = 5.9, WALL_TO = .5;   // prints run toward the light table (−z)
const CLIP_DROP = .03;

export interface PrintPlacement {
  index: number; line: number;
  /** Paper center, and the clip point on the line above it. */
  center: [number, number, number]; hang: [number, number, number];
  paper: { width: number; height: number }; photo: { width: number; height: number };
  /** The photograph printed upright: its crop on the paper and clockwise image rotation (radians). */
  crop: { x: number; y: number }; offset: { x: number; y: number }; rotation: number;
}
export interface PrintLine { y: number; zFrom: number; zTo: number }

/**
 * Each line hangs below the tallest print on the line above it, so rows never
 * overlap. When a panel's rows would not fit between the top line and the
 * bench, every print shrinks by the same factor; the stack is centred in that
 * space.
 */
export function printLayout(roll: RollDefinition): { prints: PrintPlacement[]; lines: PrintLine[] } {
  const strips = createRollLayout(roll);
  const panels = Math.ceil(strips.length / ROWS_PER_PANEL);
  const panelLength = (WALL_FROM - WALL_TO) / panels;
  // Upright photograph sizes, fitted to each line's pitch along the wall.
  const rows = strips.map(strip => {
    const pitch = Math.min(.58, (panelLength - .2) / strip.frames.length);
    return { strip, pitch, photos: strip.frames.map((photo, local) => {
      const frame = locateFrame(roll, strip.offset + local);
      const gateWidth = frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth;
      const gate = gateWidth / frame.strip.layout.frameHeight;
      // Printed upright: a vertical shot makes an upright print; the image turns on the paper, not the camera.
      const placement = uprightPlacement(photo, gate), upright = placement.gate;
      const size = upright >= 1 ? { width: LONG_SIDE, height: LONG_SIDE / upright } : { width: LONG_SIDE * upright, height: LONG_SIDE };
      const fit = Math.min(1, (pitch - .08) / (size.width + 2 * BORDER));
      return { photo, placement, upright, width: size.width * fit, height: size.height * fit };
    }) };
  });
  const panelRows = Array.from({ length: panels }, (_, panel) => rows.slice(panel * ROWS_PER_PANEL, (panel + 1) * ROWS_PER_PANEL));
  // The tallest panel sets one scale for every print (paper borders and clips keep their size).
  const room = TOP_LINE - LOWEST_EDGE;
  const scale = Math.min(1, ...panelRows.map(group => {
    const fixed = group.length * (CLIP_DROP + 2 * BORDER) + (group.length - 1) * ROW_GAP;
    const photos = group.reduce((sum, row) => sum + Math.max(...row.photos.map(photo => photo.height)), 0);
    return (room - fixed) / photos;
  }));
  const lines: PrintLine[] = [], prints: PrintPlacement[] = [];
  panelRows.forEach((group, panel) => {
    const drops = group.map(row => CLIP_DROP + 2 * BORDER + scale * Math.max(...row.photos.map(photo => photo.height)));
    const stack = drops.reduce((sum, drop) => sum + drop, 0) + (group.length - 1) * ROW_GAP;
    let y = TOP_LINE - (room - stack) / 2;
    const zFrom = WALL_FROM - panel * panelLength, zTo = zFrom - panelLength;
    group.forEach((row, r) => {
      const index = panel * ROWS_PER_PANEL + r;
      lines.push({ y, zFrom, zTo });
      row.photos.forEach(({ photo, placement, upright, width, height }, local) => {
        const photoSize = { width: width * scale, height: height * scale };
        const paper = { width: photoSize.width + 2 * BORDER, height: photoSize.height + 2 * BORDER };
        const z = zFrom - .1 - row.pitch * (local + .5);
        const hang: [number, number, number] = [PRINT_WALL_X, y, z];
        // The print shows the photograph upright, cropped to the paper as on the film.
        const crop = photoCropScale(photo.aspectRatio, upright, placement.rotation);
        const offset = photoCropOffset(photo.aspectRatio, upright, placement.rotation, placement.cropPosition);
        prints.push({ index: row.strip.offset + local, line: index, hang, center: [PRINT_WALL_X, y - CLIP_DROP - paper.height / 2, z], paper, photo: photoSize, crop, offset, rotation: placement.rotation * Math.PI / 180 });
      });
      y -= drops[r] + ROW_GAP;
    });
  });
  return { prints, lines };
}
