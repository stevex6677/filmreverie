import { ROOM_ENVELOPE } from '../utils/cameraBounds';

// Shared world scale for negatives, cartridges, cartons and framed prints.
// Camera fitting changes the view; it must never change an object's dimensions.
export const WORLD_UNITS_PER_MM = .0036;
export const mm = (millimeters: number) => millimeters * WORLD_UNITS_PER_MM;
export const FILM_MODEL_UNIT = .55 / 36;
export const FILM_RENDER_SCALE = WORLD_UNITS_PER_MM / FILM_MODEL_UNIT;

// The photo opening is one-third taller than the 79 mm 120 carton.
// Preserve the opening's proportions and the existing slim wood/mat borders.
const COVER_OPENING_HEIGHT = 79 * 4 / 3;
const COVER_OPENING_WIDTH = COVER_OPENING_HEIGHT * (137 * 2 / 3 - 10) / (111.6 * 2 / 3 - 10);
export const COVER_FRAME_MM = { width: COVER_OPENING_WIDTH + 10, height: COVER_OPENING_HEIGHT + 10, depth: 6, woodBorder: 9, matBorder: 6.5,
  openingWidth: COVER_OPENING_WIDTH, openingHeight: COVER_OPENING_HEIGHT };
export const CARTRIDGE_MM = { diameter: 25, capDiameter: 26.5, bodyHeight: 41, height: 47 };
export const SHELF_CELL_MM = { width: 310, height: 135, depth: 85 };
export const SHELF_OBJECT_GAP_MM = 12;
export const SHELF_FILM_YAW = -Math.PI / 18; // 10°: show the carton side and curved label.
export const SHELF_FRAME_YAW = SHELF_FILM_YAW; // All shelf objects face the same direction.
export const rotatedWidth = (width: number, depth: number, yaw: number) => width * Math.cos(yaw) + depth * Math.abs(Math.sin(yaw));
export const SHELF_WIDTH = mm(SHELF_CELL_MM.width * 4 + 18);
export const SHELF_HEIGHT = mm(SHELF_CELL_MM.height * 4 + 18);
export const SHELF_FLOOR = mm(-SHELF_CELL_MM.height / 2 + 5);
export const SHELF_ORIGIN: [number, number, number] = [0, -.69 + SHELF_HEIGHT / 2, -1.18];
export const SHELF_CAMERA_DISTANCE = 3.8;
export const SHELF_CAMERA: [number, number, number] = [0, SHELF_ORIGIN[1], SHELF_ORIGIN[2] + SHELF_CAMERA_DISTANCE];
export function shelfFov(aspect: number) {
  return 2 * Math.atan(Math.max(SHELF_HEIGHT * 1.4, SHELF_WIDTH * 1.10 / aspect) / (2 * SHELF_CAMERA_DISTANCE)) * 180 / Math.PI;
}

// Right wall, replacing the chemistry rail; wet bench now sits by the door.
// Local +Z faces into the room (-X).
export const CAMERA_SHELF_MM = { width: 900, depth: 240, height: SHELF_CELL_MM.height * 4 + 18, tiers: 2 };
export const CAMERA_PRESENTATION_YAW = -.04;
// Leave a clear corner for the developing bench along the rear wall.
export const CAMERA_SHELF_ORIGIN: [number, number, number] = [ROOM_ENVELOPE.width / 2 - mm(7), SHELF_ORIGIN[1] - SHELF_HEIGHT / 2, 2.9];
export const CAMERA_SHELF_YAW = -Math.PI / 2;
export const CAMERA_SHELF_TARGET: [number, number, number] = [CAMERA_SHELF_ORIGIN[0] - mm(CAMERA_SHELF_MM.depth / 2), SHELF_ORIGIN[1], CAMERA_SHELF_ORIGIN[2]];
export const CAMERA_SHELF_EYE: [number, number, number] = [CAMERA_SHELF_TARGET[0] - SHELF_CAMERA_DISTANCE, SHELF_ORIGIN[1], CAMERA_SHELF_ORIGIN[2]];
export function cameraShelfFov(aspect: number, visibleHeight = .65, visibleWidth = .94) {
  // Fit the closest cabinet corners, leaving only a narrow horizontal margin.
  const frontDistance = SHELF_CAMERA_DISTANCE - mm(CAMERA_SHELF_MM.depth / 2);
  return 2 * Math.atan(Math.max(mm(CAMERA_SHELF_MM.height) / visibleHeight,
    mm(CAMERA_SHELF_MM.width) / (visibleWidth * aspect)) / (2 * frontDistance)) * 180 / Math.PI;
}
// Five positions per tier, with extra clearance for the wide Mamiya at left.
// Keep the camera collection above the film props at its physical scale.
const CAMERA_SHELF_COLUMNS_MM = [-320, -145, -15, 140, 315];
export const CAMERA_SHELF_SLOTS = Array.from({ length: 10 }, (_, index) => ({
  x: mm(CAMERA_SHELF_COLUMNS_MM[index % 5]), y: mm(Math.floor(index / 5) * (CAMERA_SHELF_MM.height / CAMERA_SHELF_MM.tiers - 10)), z: mm(CAMERA_SHELF_MM.depth / 2),
}));
// Fill the eye-level tier first, then the lower tier. Catalog order alone is
// enough to place a new camera; furniture coordinates stay out of model data.
const CAMERA_SHELF_SLOT_ORDER = [5, 6, 7, 8, 9, 0, 1, 2, 3, 4];
export const cameraShelfSlot = (index: number) => CAMERA_SHELF_SLOTS[CAMERA_SHELF_SLOT_ORDER[index]];
export const PRIMARY_CAMERA_SLOT = cameraShelfSlot(0);

// Objects are arranged side by side without changing either one's scale.
export function shelfArrangement(boxWidthMm: number, small: boolean, owned: boolean, boxDepthMm = 38) {
  const boxWidth = rotatedWidth(boxWidthMm, boxDepthMm, SHELF_FILM_YAW);
  const frameWidth = owned ? rotatedWidth(COVER_FRAME_MM.width, COVER_FRAME_MM.depth + .6, SHELF_FRAME_YAW) : 0;
  const cartridgeSpan = small ? CARTRIDGE_MM.capDiameter + SHELF_OBJECT_GAP_MM : 0;
  const span = cartridgeSpan + boxWidth + (owned ? SHELF_OBJECT_GAP_MM + frameWidth : 0);
  const boxX = -span / 2 + cartridgeSpan + boxWidth / 2;
  return {
    filmX: mm(small ? -span / 2 + CARTRIDGE_MM.capDiameter / 2 : boxX),
    boxX: mm(boxX),
    companionX: mm(owned ? span / 2 - frameWidth / 2 : boxX),
    span: mm(span),
  };
}
