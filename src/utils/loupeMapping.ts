export interface FilmStripLayout {
  frameCount: number;
  perforated?: boolean;
  frameNumberOffset?: number;
  frameWidth: number;
  frameWidths?: readonly number[];
  filmLengthOffset?: number;
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
  marginY: 0.084028, // (35mm - 24mm) / 2 = 5.5mm margin: 5.5 * (0.55 / 36)
};

export const LOUPE_MAGNIFICATION = 2.5;

// Standard 35mm film perforation specifications (KS-1870 / ISO 1007: 8 perforations per frame along each edge)
export const PERFORATIONS_PER_FRAME = 8;
export const TOTAL_PERFORATIONS_PER_EDGE = DEFAULT_LAYOUT.frameCount * PERFORATIONS_PER_FRAME; // 40
// Longitudinal width along film length: 1.981 mm (0.0780 in)
export const SPROCKET_WIDTH = 0.030265; // 1.981 * (0.55 / 36)
// Transverse height across film width: 2.794 mm (0.1100 in)
export const SPROCKET_HEIGHT = 0.042686; // 2.794 * (0.55 / 36)
// Perforation corner radius: 0.508 mm (0.020 in)
export const SPROCKET_CORNER_RADIUS = 0.007761; // 0.508 * (0.55 / 36)

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

export function getFrameWidth(index: number, layout: FilmStripLayout) {
  return layout.frameWidths?.[index] ?? layout.frameWidth;
}

export function getStripDimensions(layout: FilmStripLayout = DEFAULT_LAYOUT) {
  const width =
    Array.from({ length: layout.frameCount }, (_, i) => getFrameWidth(i, layout)).reduce((a, b) => a + b, 0) +
    (layout.frameCount - 1) * layout.gap +
    2 * layout.marginX;
  const height = layout.frameHeight + 2 * layout.marginY;
  return { width, height };
}

export function getPerforationPositions(layout: FilmStripLayout = DEFAULT_LAYOUT): {
  top: PerforationPosition[];
  bottom: PerforationPosition[];
} {
  if (layout.perforated === false) return { top: [], bottom: [] };
  const { height } = getStripDimensions(layout);
  const top: PerforationPosition[] = [];
  const bottom: PerforationPosition[] = [];

  // Authentic KS-1870 / ISO 1007: perforation centers sit 3.4155mm from the film edge (±14.0845mm from centerline)
  const unit = 0.55 / 36;
  const topY = height / 2 - 3.4155 * unit;
  const bottomY = -height / 2 + 3.4155 * unit;

  if (layout.frameWidths) {
    const { width } = getStripDimensions(layout);
    const step = (DEFAULT_LAYOUT.frameWidth + DEFAULT_LAYOUT.gap) / PERFORATIONS_PER_FRAME;
    for (let x = -width / 2 + step / 2, k = 0; x < width / 2 - SPROCKET_WIDTH / 2; x += step, k++) {
      top.push({ x, y: topY, frameIndex: 0, perforationIndex: k });
      bottom.push({ x, y: bottomY, frameIndex: 0, perforationIndex: k });
    }
    return { top, bottom };
  }
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
  const before = Array.from({ length: clampedIndex }, (_, i) => getFrameWidth(i, layout) + layout.gap).reduce((a, b) => a + b, 0);
  return { x: -width / 2 + layout.marginX + before + getFrameWidth(clampedIndex, layout) / 2, y: 0 };
}

export function getFrameBounds(frameIndex: number, layout: FilmStripLayout = DEFAULT_LAYOUT) {
  const center = getFrameCenter(frameIndex, layout);
  const halfW = getFrameWidth(frameIndex, layout) / 2;
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
    const dist = Math.max(0, Math.abs(point.x - center.x) - getFrameWidth(i, layout) / 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  const bounds = getFrameBounds(bestIndex, layout);
  const localU = (point.x - bounds.minX) / getFrameWidth(bestIndex, layout);
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
