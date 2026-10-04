import { uprightPlacement, type Orientation } from './frameOrientation';

// Center-crop in the oriented image's coordinates. Every gate pixel samples
// inside the original image; dimensions remain proportional, with no padding.
export function photoCropScale(aspect: number, gateAspect: number, rotation = 0) {
  const oriented = rotation % 180 ? 1 / aspect : aspect;
  return { x: Math.min(1, gateAspect / oriented), y: Math.min(1, oriented / gateAspect) };
}

export interface CropPosition { x: number; y: number }
export function photoCropOffset(aspect: number, gateAspect: number, rotation = 0, position?: CropPosition) {
  const crop = photoCropScale(aspect, gateAspect, rotation);
  const clamp = (n = 0) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  return { x: clamp(position?.x) * (1 - crop.x) / 2, y: clamp(position?.y) * (1 - crop.y) / 2 };
}

export function photoCropPreview(aspect: number, gateAspect: number, rotation = 0, position?: CropPosition) {
  const crop = photoCropScale(aspect, gateAspect, rotation);
  const offset = photoCropOffset(aspect, gateAspect, rotation, position);
  return {
    left: `${50 - offset.x / crop.x * 100}%`, top: `${50 - offset.y / crop.y * 100}%`,
    width: `${100 * (rotation % 180 ? 1 / crop.y / gateAspect : 1 / crop.x)}%`,
    height: `${100 * (rotation % 180 ? gateAspect / crop.x : 1 / crop.y)}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
}

// Required long-edge pixels of the full oriented source for a displayed gate.
export function photoSourceDemand(gatePixels: number, aspect: number, gateAspect: number, rotation = 0) {
  const crop=photoCropScale(aspect,gateAspect,rotation);
  return Math.max(gatePixels/crop.x,gatePixels/gateAspect/crop.y);
}

/**
 * An upright thumbnail of a film frame for a grid of frames: the box (as tall
 * as the film's frames, narrower for a vertical shot) and the image within it.
 */
export function uprightThumbnail(photo: Orientation & { aspectRatio: number }, filmGate: number) {
  const { gate, rotation, cropPosition } = uprightPlacement(photo, filmGate);
  return {
    box: { aspectRatio: gate, width: `${Math.min(100, 100 * gate / filmGate)}%`, marginInline: 'auto' },
    image: photoCropPreview(photo.aspectRatio, gate, rotation, cropPosition),
  };
}
