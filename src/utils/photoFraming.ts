// Center-crop in the oriented image's coordinates. Every gate pixel samples
// inside the original image; dimensions remain proportional, with no padding.
export function photoCropScale(aspect: number, gateAspect: number, rotation = 0) {
  const oriented = rotation % 180 ? 1 / aspect : aspect;
  return { x: Math.min(1, gateAspect / oriented), y: Math.min(1, oriented / gateAspect) };
}

export function photoCropPreview(aspect: number, gateAspect: number, rotation = 0) {
  const crop = photoCropScale(aspect, gateAspect, rotation);
  return {
    left: '50%', top: '50%',
    width: `${100 * (rotation % 180 ? 1 / crop.y / gateAspect : 1 / crop.x)}%`,
    height: `${100 * (rotation % 180 ? gateAspect / crop.x : 1 / crop.y)}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
}
