export interface FilmStripLayout {
  frameCount: number;
  frameNumberOffset?: number;
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

// Standard 35mm film perforation specifications (8 perforations per frame along each edge)
export const PERFORATIONS_PER_FRAME = 8;
export const TOTAL_PERFORATIONS_PER_EDGE = DEFAULT_LAYOUT.frameCount * PERFORATIONS_PER_FRAME; // 40
export const SPROCKET_WIDTH = 0.024;
export const SPROCKET_HEIGHT = 0.016;
export const SPROCKET_CORNER_RADIUS = 0.004;

// Authentic 35mm film transverse curl: outer edges lift ~1.8mm while center rests on table
export const FILM_CURL_HEIGHT = 0.0018;

export function getFilmCurlZ(y: number, stripHeight: number = DEFAULT_LAYOUT.frameHeight + 2 * DEFAULT_LAYOUT.marginY): number {
  const normY = (2 * y) / stripHeight; // in [-1, 1]
  return FILM_CURL_HEIGHT * normY * normY;
}

export interface PerforationPosition {
  x: number;
  y: number;
  frameIndex: number;
  perforationIndex: number;
}

export function getStripDimensions(layout: FilmStripLayout = DEFAULT_LAYOUT) {
  const width =
    layout.frameCount * layout.frameWidth +
    (layout.frameCount - 1) * layout.gap +
    2 * layout.marginX;
  const height = layout.frameHeight + 2 * layout.marginY;
  return { width, height };
}

export function getPerforationPositions(layout: FilmStripLayout = DEFAULT_LAYOUT): {
  top: PerforationPosition[];
  bottom: PerforationPosition[];
} {
  const { height } = getStripDimensions(layout);
  const top: PerforationPosition[] = [];
  const bottom: PerforationPosition[] = [];

  const topY = height / 2 - layout.marginY / 2;
  const bottomY = -height / 2 + layout.marginY / 2;
  const frameSpan = layout.frameWidth + layout.gap;
  const step = frameSpan / PERFORATIONS_PER_FRAME;

  for (let f = 0; f < layout.frameCount; f++) {
    const center = getFrameCenter(f, layout);
    const frameLeft = center.x - layout.frameWidth / 2;

    for (let k = 0; k < PERFORATIONS_PER_FRAME; k++) {
      const x = frameLeft + (k + 0.5) * step;
      top.push({ x, y: topY, frameIndex: f, perforationIndex: k });
      bottom.push({ x, y: bottomY, frameIndex: f, perforationIndex: k });
    }
  }

  return { top, bottom };
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

export function isPointOverStrip(
  point: { x: number; y: number },
  layout: FilmStripLayout = DEFAULT_LAYOUT
): boolean {
  const { width, height } = getStripDimensions(layout);
  return (
    point.x >= -width / 2 &&
    point.x <= width / 2 &&
    point.y >= -height / 2 &&
    point.y <= height / 2
  );
}

export function mapWorldPointToFrame(
  point: { x: number; y: number },
  layout: FilmStripLayout = DEFAULT_LAYOUT
) {
  const isWithinStrip = isPointOverStrip(point, layout);

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
