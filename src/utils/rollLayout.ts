import localRoll from "../data/localRoll.json" with { type: "json" };
import { RollFrame, ROLL_FRAMES } from "../data/rollManifest";
import { DEFAULT_LAYOUT, FilmStripLayout, getFrameCenter, getStripDimensions, mapWorldPointToFrame } from "./loupeMapping";
import { TABLE_CENTER_Z } from "./cameraBounds";

export interface RollDefinition { retainResources?: () => () => void; format?: import("../data/filmFormats").FilmFormat; layout?: Omit<FilmStripLayout, "frameCount">; imported?: boolean; rollId: string; label: string; frames: readonly RollFrame[]; framesPerStrip: number; scale: number; fixture: boolean }
export const BASELINE_ROLL: RollDefinition = { rollId: "roll-01", label: "Roll 01 · five photographs", frames: ROLL_FRAMES, framesPerStrip: 5, scale: 1, fixture: false };
export const FULL_ROLL_FIXTURE: RollDefinition = {
  rollId: "development-36", label: "Development fixture · 36 slots / 5 repeated photographs",
  frames: Array.from({ length: 36 }, (_, i) => ({ ...ROLL_FRAMES[i % ROLL_FRAMES.length], id: `fixture-slot-${i + 1}`, order: i + 1 })),
  framesPerStrip: 6, scale: 0.42, fixture: true,
};
export const LOCAL_ROLL: RollDefinition = { ...localRoll, frames: localRoll.frames as RollFrame[], framesPerStrip: 6, scale: 0.42, fixture: false };

export interface PlacedStrip { index: number; offset: number; y: number; scale: number; layout: FilmStripLayout; frames: readonly RollFrame[] }
export function createRollLayout(roll: RollDefinition): PlacedStrip[] {
  const count = Math.ceil(roll.frames.length / roll.framesPerStrip);
  const base = { ...DEFAULT_LAYOUT, ...roll.layout };
  const pitch = (getStripDimensions(base).height + 0.10) * roll.scale;
  return Array.from({ length: count }, (_, index) => {
    const offset = index * roll.framesPerStrip;
    const frames = roll.frames.slice(offset, offset + roll.framesPerStrip);
    return { index, offset, y: ((count - 1) / 2 - index) * pitch, scale: roll.scale, frames, layout: { ...base, frameCount: frames.length, frameNumberOffset: offset } };
  });
}
export function locateFrame(roll: RollDefinition, index: number) {
  const globalIndex = Math.max(0, Math.min(roll.frames.length - 1, Math.floor(Number.isFinite(index) ? index : 0)));
  const strip = createRollLayout(roll)[Math.floor(globalIndex / roll.framesPerStrip)];
  const localIndex = globalIndex - strip.offset;
  const center = getFrameCenter(localIndex, strip.layout);
  return { globalIndex, strip, localIndex, x: center.x * strip.scale, y: strip.y + center.y * strip.scale };
}
export function mapRollPoint(roll: RollDefinition, point: { x: number; y: number }) {
  const strips = createRollLayout(roll);
  const strip = strips.reduce((a, b) => Math.abs(point.y - a.y) <= Math.abs(point.y - b.y) ? a : b);
  const mapped = mapWorldPointToFrame({ x: point.x / strip.scale, y: (point.y - strip.y) / strip.scale }, strip.layout);
  return { ...mapped, frameIndex: strip.offset + mapped.frameIndex, stripIndex: strip.index };
}
export type InspectionLevel = "roll" | "strip" | "frame";
// Framing envelope for the selected image and rebate. This only measures the
// camera view; Focus continues rendering the original strips and their neighbors.
export function focusFrameLayout(roll: RollDefinition, index: number): FilmStripLayout {
  const frame = locateFrame(roll, index);
  return { ...frame.strip.layout, frameCount: 1, frameNumberOffset: frame.globalIndex };
}
export function fitRollView(roll: RollDefinition, level: InspectionLevel, index: number, aspect = 1.5) {
  const frame = locateFrame(roll, index);
  const strips = createRollLayout(roll);
  const dimensions = getStripDimensions(frame.strip.layout);
  if (level === "frame") {
    const outer = getStripDimensions(focusFrameLayout(roll, index));
    // Reserve visible surround outside the film, as well as space for controls.
    // This is comfortable framing, not viewport-filling photographic fitting.
    // Frame the image with its surrounding rebate; strip-end margins must not
    // make a middle photograph unnecessarily small on a portrait screen.
    const height = Math.max(outer.height * 1.16, frame.strip.layout.frameWidth * 1.2 / Math.max(.2, aspect)) * roll.scale;
    return { zoom: height / (2 * Math.tan(Math.PI / 8)), pan: { x: frame.x, z: TABLE_CENTER_Z - frame.y } };
  }
  const width = (level === "roll" ? Math.max(...strips.map(s => getStripDimensions(s.layout).width)) : dimensions.width) * 1.12 * roll.scale;
  const height = level === "roll" ? strips[0].y - strips[strips.length - 1].y + dimensions.height * roll.scale * 1.2 : dimensions.height * 1.3 * roll.scale;
  return { zoom: Math.max(height, width / Math.max(0.2, aspect)) / (2 * Math.tan(Math.PI / 8)), pan: { x: 0, z: TABLE_CENTER_Z - (level === "roll" ? 0 : frame.y) } };
}
export function clampFocusPan(roll: RollDefinition, index: number, zoom: number, aspect: number, x: number, z: number) {
  const frame = locateFrame(roll, index), outer = getStripDimensions(focusFrameLayout(roll, index));
  const visibleHeight = 2 * zoom * Math.tan(Math.PI / 8);
  const dx = Math.max(0, (outer.width * roll.scale - visibleHeight * aspect) / 2);
  const dz = Math.max(0, (outer.height * roll.scale - visibleHeight) / 2);
  const centerZ = TABLE_CENTER_Z - frame.y;
  return { x: Math.max(frame.x - dx, Math.min(frame.x + dx, x)), z: Math.max(centerZ - dz, Math.min(centerZ + dz, z)) };
}
export function anchoredZoom(zoom: number, nextZoom: number, pan: { x: number; z: number }, anchor: { x: number; z: number }) {
  const ratio = nextZoom / zoom;
  return { x: anchor.x + (pan.x - anchor.x) * ratio, z: anchor.z + (pan.z - anchor.z) * ratio };
}
export function clampRollPan(roll: RollDefinition, x: number, z: number) {
  const strips = createRollLayout(roll);
  const halfWidth = Math.max(...strips.map(s => getStripDimensions(s.layout).width * s.scale / 2));
  const halfHeight = strips[0].y + getStripDimensions(strips[0].layout).height * roll.scale / 2;
  return { x: Math.max(-halfWidth, Math.min(halfWidth, x)), z: Math.max(TABLE_CENTER_Z - halfHeight, Math.min(TABLE_CENTER_Z + halfHeight, z)) };
}

export function validateRoll(roll: RollDefinition): string | null {
  if (!roll.frames.length) return "Add photographs to src/data/localRoll.json before opening this roll.";
  if (new Set(roll.frames.map(frame => frame.id)).size !== roll.frames.length) return "Each frame needs a unique stable ID.";
  if (roll.frames.some((frame, index) => frame.order !== index + 1 || !frame.src.startsWith("/") || frame.src.startsWith("//"))) return "Frame order must start at 1 and every image must use a local runtime path.";
  return null;
}
