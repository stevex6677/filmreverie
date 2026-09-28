import { createRollLayout, locateFrame, type RollDefinition } from '../utils/rollLayout';
import { ROOM_ENVELOPE } from '../utils/cameraBounds';
import { photoCropOffset, photoCropScale } from '../utils/photoFraming';

// Drying Line: each film strip becomes a line of prints hung along the left
// wall above the printing station. Positions are world coordinates, shared by
// the timeline (camera) and the scene (prints), and are pure for tests.

/** Prints hang 10 cm in front of the left wall, clear of the printing bench. */
export const PRINT_WALL_X = -ROOM_ENVELOPE.width / 2 + .1;
const LONG_SIDE = .46;                 // ≈ 5 inch print, long side, in world units
const BORDER = .028;                   // white paper border
const LINE_SPACING = .44, LINE_CENTER = .78, ROWS_PER_PANEL = 6;
const WALL_FROM = 5.9, WALL_TO = .5;   // prints run toward the light table (−z)
const CLIP_DROP = .03;

export interface PrintPlacement {
  index: number; line: number;
  /** Paper center, and the clip point on the line above it. */
  center: [number, number, number]; hang: [number, number, number];
  paper: { width: number; height: number }; photo: { width: number; height: number };
  /** Upright crop of the photograph on the paper. */
  crop: { x: number; y: number }; offset: { x: number; y: number };
}
export interface PrintLine { y: number; zFrom: number; zTo: number }

export function printLayout(roll: RollDefinition): { prints: PrintPlacement[]; lines: PrintLine[] } {
  const strips = createRollLayout(roll);
  const panels = Math.ceil(strips.length / ROWS_PER_PANEL);
  const panelLength = (WALL_FROM - WALL_TO) / panels;
  const lines: PrintLine[] = [], prints: PrintPlacement[] = [];
  strips.forEach((strip, index) => {
    const panel = Math.floor(index / ROWS_PER_PANEL), row = index % ROWS_PER_PANEL;
    const rows = Math.min(ROWS_PER_PANEL, strips.length - panel * ROWS_PER_PANEL);
    const y = LINE_CENTER + ((rows - 1) / 2 - row) * LINE_SPACING;
    const zFrom = WALL_FROM - panel * panelLength, zTo = zFrom - panelLength;
    lines.push({ y, zFrom, zTo });
    const pitch = Math.min(.58, (panelLength - .2) / strip.frames.length);
    strip.frames.forEach((photo, local) => {
      const globalIndex = strip.offset + local, frame = locateFrame(roll, globalIndex);
      const gateWidth = frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth;
      const gate = gateWidth / frame.strip.layout.frameHeight;
      const rotation = photo.rotation ?? 0, upright = rotation % 180 ? 1 / gate : gate;
      const photoSize = upright >= 1 ? { width: LONG_SIDE, height: LONG_SIDE / upright } : { width: LONG_SIDE * upright, height: LONG_SIDE };
      const scale = Math.min(1, (pitch - .08) / (photoSize.width + 2 * BORDER));
      photoSize.width *= scale; photoSize.height *= scale;
      const paper = { width: photoSize.width + 2 * BORDER, height: photoSize.height + 2 * BORDER };
      const z = zFrom - .1 - pitch * (local + .5);
      const hang: [number, number, number] = [PRINT_WALL_X, y, z];
      // The print shows the photograph upright, cropped to the paper as on the film.
      const crop = photoCropScale(photo.aspectRatio, upright, 0);
      const offset = rotation ? { x: 0, y: 0 } : photoCropOffset(photo.aspectRatio, upright, 0, photo.cropPosition);
      prints.push({ index: globalIndex, line: index, hang, center: [PRINT_WALL_X, y - CLIP_DROP - paper.height / 2, z], paper, photo: photoSize, crop, offset });
    });
  });
  return { prints, lines };
}
