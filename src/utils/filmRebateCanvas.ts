import { draw120Rebate } from "./film120Rebate";
import * as THREE from "three";
import { DEFAULT_LAYOUT, FilmStripLayout, getFrameWidth, getFrameCenter, getStripDimensions } from "./loupeMapping";
import { DEFAULT_FILM_STOCK_ID, FilmStockProfile, getFilmStock } from "../data/filmStocks";

export interface RebateColors {
  substrateBase: string;
  rebateText: string;
  rebateSecondary: string;
  frameShadow: string;
}

export const NEGATIVE_REBATE_COLORS: RebateColors = getFilmStock(DEFAULT_FILM_STOCK_ID).base;

// Base artwork represents developed film; positive inversion is applied by the shared rebate shader.
export function getRebateColors(stock: FilmStockProfile): RebateColors {
  return stock.base;
}

export function createFilmRebateCanvas(
  stock: FilmStockProfile = getFilmStock(DEFAULT_FILM_STOCK_ID),
  layout: FilmStripLayout = DEFAULT_LAYOUT,
  canvasWidth = 6144,
  canvasHeight = 936,
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")
): HTMLCanvasElement {
  const canvas = createCanvas();
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Film rebate requires a 2D canvas");

  paintRebate(ctx, stock, layout, canvasWidth, canvasHeight);
  return canvas;
}

const STOCK_DX_BITS: Record<string, readonly number[]> = {
  "portra-400": [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1],
  "ektar-100": [1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1],
  "portra-160": [1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0],
  "portra-800": [1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0],
};

function getFrameDXBits(frameNum: number): number[] {
  const binary: number[] = [];
  for (let b = 0; b < 7; b++) {
    binary.push((frameNum >> b) & 1);
  }
  const parity = binary.reduce((acc, v) => acc ^ v, 0);
  return [1, 0, 1, ...binary, parity, 1, 0, 1];
}

function drawDXBarcodeBlock(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  bits: readonly number[],
  canvasHeight: number,
  color: string
) {
  ctx.fillStyle = color;
  const yTop = canvasHeight - 26;
  const yMid = canvasHeight - 14;
  const yBot = canvasHeight - 2;

  // Continuous baseline along the bottom edge of the barcode
  ctx.fillRect(startX, yBot - 3, endX - startX, 3);

  // Start sync pattern: 3 vertical fingers
  ctx.fillRect(startX, yTop, 3.5, yBot - yTop);
  ctx.fillRect(startX + 6, yMid, 3, yBot - yMid);
  ctx.fillRect(startX + 12, yTop, 3.5, yBot - yTop);

  const bx = startX + 18;
  const ex = endX - 16;
  const availW = ex - bx;
  const numBits = bits.length;
  if (numBits > 0 && availW > 0) {
    const bitStep = availW / numBits;
    const barW = Math.max(2.5, bitStep * 0.45);
    for (let b = 0; b < numBits; b++) {
      const x = bx + b * bitStep;
      const isOne = bits[b] === 1;
      ctx.fillRect(x, isOne ? yTop : yMid, barW, isOne ? yBot - yTop : yBot - yMid);
    }
  }

  // Stop sync pattern: 3 vertical fingers
  ctx.fillRect(ex, yTop, 3.5, yBot - yTop);
  ctx.fillRect(ex + 6, yMid, 3, yBot - yMid);
  ctx.fillRect(ex + 12, yTop, 3.5, yBot - yTop);
}

function paintRebate(ctx: CanvasRenderingContext2D, stock: FilmStockProfile, layout: FilmStripLayout, canvasWidth: number, canvasHeight: number) {
  ctx.save();
  const colors = getRebateColors(stock);
  const { width: stripWidth, height: stripHeight } = getStripDimensions(layout);
  // Draw in a fixed design space so text and apertures scale together at macro resolution.
  const width = 3072;
  const height = 468;
  ctx.scale(canvasWidth / width, canvasHeight / height);
  const scaleX = width / stripWidth;
  const scaleY = height / stripHeight;
  ctx.fillStyle = colors.substrateBase;
  ctx.fillRect(0, 0, width, height);

  const py = layout.marginY * scaleY;
  const ph = layout.frameHeight * scaleY;
  ctx.font = `${stock.rebate.fontWeight} 19px ${stock.rebate.font}`;
  ctx.textBaseline = "middle";

  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const left = (center.x + stripWidth / 2 - getFrameWidth(i, layout) / 2) * scaleX;
    const frameWidth = getFrameWidth(i, layout) * scaleX;
    const midpoint = left + frameWidth / 2;
    ctx.clearRect(left, py, frameWidth, ph);
    // No artificial dark stroke around the image gate.
    if (layout.perforated === false) continue;

    const frameNum = i + 1 + (layout.frameNumberOffset ?? 0);
    const step = (frameWidth + layout.gap * scaleX) / 8;

    // Latent registration dashes between perforation holes in inner margins for negative film
    if (stock.type === "negative") {
      ctx.fillStyle = colors.rebateText;
      for (let k = 0; k < 7; k++) {
        const dashX = left + (k + 1.0) * step;
        ctx.fillRect(dashX - 3.5, py - 6, 7, 2.5);
        ctx.fillRect(dashX - 3.5, py + ph + 3.5, 7, 2.5);
      }
    }

    // Top outer rail: frame number and stock label
    ctx.fillStyle = colors.rebateText;
    ctx.fillText(String(frameNum), left + 12, 13);
    ctx.fillText(stock.rebate.label, left + 95, 13);

    // Bottom outer rail: frame numbers, advance arrow, and authentic DX edge code barcode track
    ctx.fillText(String(frameNum), left + 12, height - 13);

    if (stock.type === "negative") {
      // DX Barcode segment 1 (Manufacturer / Stock ID) under holes 1, 2, 3
      const b1Start = left + 0.9 * step;
      const b1End = midpoint - 0.25 * step;
      const stockBits = STOCK_DX_BITS[stock.id] ?? STOCK_DX_BITS["portra-400"];
      drawDXBarcodeBlock(ctx, b1Start, b1End, stockBits, height, colors.rebateText);

      // Half-frame number with solid advance arrow
      if (stock.rebate.halfFrameNumbers) {
        ctx.fillStyle = colors.rebateText;
        ctx.beginPath();
        ctx.moveTo(midpoint + 10, height - 17);
        ctx.lineTo(midpoint + 16, height - 13);
        ctx.lineTo(midpoint + 10, height - 9);
        ctx.closePath();
        ctx.fill();
        ctx.fillText(`${frameNum}A`, midpoint + 20, height - 13);
      }

      // DX Barcode segment 2 (Frame number / parity / stop) under holes 5, 6, 7
      const b2Start = midpoint + 0.9 * step;
      const b2End = left + frameWidth - 0.25 * step;
      const frameBits = getFrameDXBits(frameNum);
      drawDXBarcodeBlock(ctx, b2Start, b2End, frameBits, height, colors.rebateText);
    } else {
      // Reversal / E-6 slide film (Ektachrome E100): clean human-readable numbering, no barcode track
      if (stock.rebate.halfFrameNumbers) {
        ctx.fillText(`${frameNum}A`, midpoint + 12, height - 13);
      }
    }
  }
  if (layout.perforated === false) draw120Rebate(ctx, stock, layout, width, height);
  ctx.restore();
}

// Store only the two narrow rails. Their original vector drawing is rasterized
// directly at this density; no enlargement of a low-resolution source bitmap.
export function createFilmRebateAtlas(stock: FilmStockProfile, layout: FilmStripLayout, maxTextureSize = 8192, createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")) {
  const canvas = createCanvas();
  canvas.width = Math.min(8192, maxTextureSize);
  const railPixels = Math.min(256, Math.floor(maxTextureSize / 2));
  canvas.height = railPixels * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Film rebate requires a 2D canvas");
  const virtualHeight = railPixels * getStripDimensions(layout).height / layout.marginY;
  for (const bottom of [false, true]) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, bottom ? railPixels : 0, canvas.width, railPixels); ctx.clip();
    if (bottom) ctx.translate(0, canvas.height - virtualHeight);
    paintRebate(ctx, stock, layout, canvas.width, virtualHeight);
    ctx.restore();
  }
  return canvas;
}

export function createFilmRebateTexture(
  stock: FilmStockProfile = getFilmStock(DEFAULT_FILM_STOCK_ID),
  layout: FilmStripLayout = DEFAULT_LAYOUT,
  maxTextureSize = 8192,
  maxAnisotropy = 1
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(createFilmRebateAtlas(stock, layout, maxTextureSize));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}
