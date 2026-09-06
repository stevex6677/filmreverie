export interface FilmStripLayout {
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  gap: number;
  marginX: number;
  marginY: number;
}

export const DEFAULT_LAYOUT: FilmStripLayout = {
  frameCount: 5,
  frameWidth: 0.55,
  frameHeight: 0.366667, // 0.55 / 1.5
  gap: 0.04,
  marginX: 0.08,
  marginY: 0.05,
};

export const LOUPE_MAGNIFICATION = 2.5;

export function getStripDimensions(layout: FilmStripLayout = DEFAULT_LAYOUT) {
  const width =
    layout.frameCount * layout.frameWidth +
    (layout.frameCount - 1) * layout.gap +
    2 * layout.marginX;
  const height = layout.frameHeight + 2 * layout.marginY;
  return { width, height };
}

export function getFrameCenter(frameIndex: number, layout: FilmStripLayout = DEFAULT_LAYOUT) {
  const clampedIndex = Math.max(0, Math.min(layout.frameCount - 1, Math.floor(frameIndex)));
  const { width } = getStripDimensions(layout);
  const startX = -width / 2 + layout.marginX + layout.frameWidth / 2;
  const stepX = layout.frameWidth + layout.gap;
  return {
    x: startX + clampedIndex * stepX,
    y: 0,
  };
}

export function getFrameBounds(frameIndex: number, layout: FilmStripLayout = DEFAULT_LAYOUT) {
  const center = getFrameCenter(frameIndex, layout);
  const halfW = layout.frameWidth / 2;
  const halfH = layout.frameHeight / 2;
  return {
    minX: center.x - halfW,
    maxX: center.x + halfW,
    minY: center.y - halfH,
    maxY: center.y + halfH,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mapWorldPointToFrame(
  point: { x: number; y: number },
  layout: FilmStripLayout = DEFAULT_LAYOUT
) {
  const { width, height } = getStripDimensions(layout);
  const isWithinStrip =
    point.x >= -width / 2 &&
    point.x <= width / 2 &&
    point.y >= -height / 2 &&
    point.y <= height / 2;

  // Find closest frame
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const dist = Math.abs(point.x - center.x);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  const bounds = getFrameBounds(bestIndex, layout);
  const localU = (point.x - bounds.minX) / layout.frameWidth;
  const localV = (point.y - bounds.minY) / layout.frameHeight;

  const isWithinFrame =
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY;

  const clampedU = clamp(localU, 0, 1);
  const clampedV = clamp(localV, 0, 1);

  return {
    frameIndex: bestIndex,
    localU,
    localV,
    clampedU,
    clampedV,
    isWithinFrame,
    isWithinStrip,
  };
}

export function getLoupeSampleWindow(
  u: number,
  v: number,
  magnification: number = LOUPE_MAGNIFICATION
) {
  const halfWindow = 0.5 / magnification;
  const safeU = clamp(u, 0, 1);
  const safeV = clamp(v, 0, 1);

  return {
    minU: clamp(safeU - halfWindow, 0, 1),
    maxU: clamp(safeU + halfWindow, 0, 1),
    minV: clamp(safeV - halfWindow, 0, 1),
    maxV: clamp(safeV + halfWindow, 0, 1),
    halfWindow,
  };
}

export function clampLoupeCenterUV(
  u: number,
  v: number,
  magnification: number = LOUPE_MAGNIFICATION
) {
  const halfWindow = 0.5 / magnification;
  // If we want the sampled window to stay strictly within [0, 1]:
  const minLimit = halfWindow;
  const maxLimit = 1.0 - halfWindow;
  return {
    u: clamp(u, minLimit, maxLimit),
    v: clamp(v, minLimit, maxLimit),
  };
}
