import { PNG } from "pngjs";

export interface PixelRegionStats {
  meanR: number;
  meanG: number;
  meanB: number;
  meanLum: number;
  variance: number;
  stdDev: number;
  count: number;
}

export function parsePng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

export function getRegionStats(
  png: PNG,
  cx: number,
  cy: number,
  size: number = 30
): PixelRegionStats {
  const half = Math.floor(size / 2);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  const lums: number[] = [];

  for (let y = Math.max(0, cy - half); y <= Math.min(png.height - 1, cy + half); y++) {
    for (let x = Math.max(0, cx - half); x <= Math.min(png.width - 1, cx + half); x++) {
      const idx = (y * png.width + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lums.push(lum);
      count++;
    }
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const meanLum = lums.reduce((a, b) => a + b, 0) / count;
  const variance = lums.reduce((acc, v) => acc + Math.pow(v - meanLum, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  return { meanR, meanG, meanB, meanLum, variance, stdDev, count };
}

export function getRegionMeanDifference(
  pngA: PNG,
  pngB: PNG,
  cx: number,
  cy: number,
  size: number = 30
): number {
  const half = Math.floor(size / 2);
  let totalDiff = 0;
  let count = 0;

  for (let y = Math.max(0, cy - half); y <= Math.min(pngA.height - 1, cy + half); y++) {
    for (let x = Math.max(0, cx - half); x <= Math.min(pngA.width - 1, cx + half); x++) {
      const idx = (y * pngA.width + x) * 4;
      const dr = Math.abs(pngA.data[idx] - pngB.data[idx]);
      const dg = Math.abs(pngA.data[idx + 1] - pngB.data[idx + 1]);
      const db = Math.abs(pngA.data[idx + 2] - pngB.data[idx + 2]);
      totalDiff += (dr + dg + db) / 3;
      count++;
    }
  }

  return totalDiff / count;
}
