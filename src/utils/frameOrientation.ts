import { FILM_FORMATS, FilmFormat, FrameSizing } from '../data/filmFormats';
import type { CropPosition } from './photoFraming';

// Rotations are clockwise quarter turns of the decoded image. `rotation` places
// it on the film; `uprightRotation` stands it upright. Their difference is how
// the camera was held: 0 for a horizontal shot, 90 or 270 for a vertical one
// whose top edge faces the end (90) or the start (270) of the film.
export interface OrientedFrame { width: number; height: number; rotation: number; uprightRotation?: number; cropPosition?: CropPosition }
export interface FrameSize { format: FilmFormat; sizing: FrameSizing }

const quarter = (degrees: number) => ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
/** A crop position after its frame turns clockwise by `degrees`. */
export function turnCropPosition(position: CropPosition, degrees: number): CropPosition {
  let turned = position;
  for (let i = 0; i < quarter(degrees) / 90; i++) turned = { x: -turned.y, y: turned.x };
  return turned;
}
const withRotation = <T extends OrientedFrame>(frame: T, rotation: number, uprightRotation: number): T => ({
  ...frame, rotation, uprightRotation,
  cropPosition: frame.cropPosition && turnCropPosition(frame.cropPosition, rotation - frame.rotation),
});

/** Earlier frames recorded only placement; one turned upside down was an upside-down scan. */
export const uprightRotation = (frame: OrientedFrame) => quarter(frame.uprightRotation ?? (frame.rotation === 180 ? 180 : 0));
export const cameraTurn = (frame: OrientedFrame) => quarter(frame.rotation - uprightRotation(frame));
export const isVertical = (frame: OrientedFrame) => cameraTurn(frame) % 180 !== 0;

/** Whether the image fits this frame size better turned across the film. */
export function prefersTurned(frame: Pick<OrientedFrame, 'width' | 'height'>, { format, sizing }: FrameSize) {
  const aspect = frame.width / frame.height;
  // Free frames run the long edge along the film.
  if (sizing === 'free') return aspect < 1;
  // Fixed gates keep the larger share of the picture; ties stay unturned.
  const gate = FILM_FORMATS[format].width / FILM_FORMATS[format].height;
  const kept = (a: number) => Math.min(a / gate, gate / a);
  return kept(1 / aspect) > kept(aspect) + 1e-9;
}
export const followsAutomatic = (frame: OrientedFrame, size: FrameSize) => (frame.rotation % 180 !== 0) === prefersTurned(frame, size);

export function setCameraTurn<T extends OrientedFrame>(frame: T, turn: 0 | 90 | 270): T {
  const upright = uprightRotation(frame);
  return withRotation(frame, quarter(upright + turn), upright);
}
/** The automatic placement; a vertical frame that stays vertical keeps its direction. */
export function placeAutomatically<T extends OrientedFrame>(frame: T, size: FrameSize): T {
  return followsAutomatic(frame, size) ? frame : setCameraTurn(frame, isVertical(frame) ? 0 : 90);
}
/** Frames following the automatic choice move with the frame size; chosen placements stay. */
export function reorientForFrameSize<T extends OrientedFrame>(frame: T, from: FrameSize, to: FrameSize): T {
  return followsAutomatic(frame, from) ? placeAutomatically(frame, to) : frame;
}
/** Corrects which way is up. The film keeps the image as placed unless it would then stand on its head. */
export function turnImage<T extends OrientedFrame>(frame: T): T {
  const upright = quarter(uprightRotation(frame) + 90);
  return withRotation(frame, quarter(frame.rotation - upright) === 180 ? upright : frame.rotation, upright);
}

/** Crop positions in the upright view, whose axes turn with the camera. */
export const uprightCropPosition = (frame: OrientedFrame, position = frame.cropPosition ?? { x: 0, y: 0 }) => turnCropPosition(position, -cameraTurn(frame));
export const filmCropPosition = (frame: OrientedFrame, position: CropPosition) => turnCropPosition(position, cameraTurn(frame));
