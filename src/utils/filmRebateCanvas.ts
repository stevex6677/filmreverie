import { draw120Rebate } from "./film120Rebate";
import { FILM_MODEL_UNIT } from '../data/physicalScale';
import { edgePrintProfile, FILM_135_NUMBER_PITCH_MM, FILM_135_HALF_NUMBER_PITCH_MM, FILM_135_PERFORATION_PITCH_MM } from '../data/filmEdgePrinting';
import { filmEdgeRepeats } from './filmEdgeMarks';
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
  // Keep design units proportional to physical film length. A fixed width
  // squeezed lettering on the shorter final strip (and stretched full strips).
  const height = 468;
  const width = height * stripWidth / stripHeight;
  ctx.scale(canvasWidth / width, canvasHeight / height);
  const scaleX = width / stripWidth;
  const scaleY = height / stripHeight;
  // Alpha here is aperture coverage, not film density (the shader supplies
  // transmission). Translucent canvas paint loses RGB precision through
  // premultiplication, which inversion amplifies into tinted rails on Safari.
  const channels = colors.substrateBase.match(/[\d.]+/g)!.slice(0, 3);
  ctx.fillStyle = `rgb(${channels.join(',')})`;
  ctx.fillRect(0, 0, width, height);

  const py = layout.marginY * scaleY;
  const ph = layout.frameHeight * scaleY;
  ctx.font = `${stock.rebate.fontWeight} 19px ${stock.rebate.font}`;
  ctx.textBaseline = "middle";

  const profile = edgePrintProfile(stock.id);
  const fujiCode = profile.fujiCode;
  const mm = FILM_MODEL_UNIT * scaleX;

  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const left = (center.x + stripWidth / 2 - getFrameWidth(i, layout) / 2) * scaleX;
    const frameWidth = getFrameWidth(i, layout) * scaleX;
    ctx.clearRect(left, py, frameWidth, ph);
  }

  // Factory printing is independent of the image apertures and exposure count.
  if (layout.perforated !== false) {
    for (const repeat of filmEdgeRepeats(layout, profile.label135PitchMm, 7)) {
      ctx.fillStyle = colors.rebateText;
      ctx.fillText(stock.rebate.label, repeat.x * mm, 13);
    }
    for (const repeat of filmEdgeRepeats(layout, FILM_135_NUMBER_PITCH_MM)) {
      const left = repeat.x * mm;
      const frameWidth = FILM_135_NUMBER_PITCH_MM * mm;
      const midpoint = left + FILM_135_HALF_NUMBER_PITCH_MM * mm;
      const frameNum = repeat.index + 1;
      const step = FILM_135_PERFORATION_PITCH_MM * mm;

      // Latent registration marks between perforation holes in inner margins
      if (stock.type === "negative" && STOCK_DX_BITS[stock.id]) {
        ctx.fillStyle = colors.rebateText;
        for (let k = 0; k < 7; k++) {
          const dashX = left + (k + 1.0) * step;
          ctx.fillRect(dashX - 3.5, py - 6, 7, 2.5);
          ctx.fillRect(dashX - 3.5, py + ph + 3.5, 7, 2.5);
        }
      } else if (fujiCode) {
        // Authentic Fuji slide latent registration dots in inner margins
        ctx.fillStyle = colors.rebateText;
        for (let k = 0; k < 7; k++) {
          const dotX = left + (k + 1.0) * step;
          ctx.beginPath();
          ctx.arc(dotX, py - 5, 2.0, 0, Math.PI * 2);
          ctx.arc(dotX, py + ph + 5, 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Bottom outer rail: frame numbers, advance arrow, and authentic DX edge code barcode track
      ctx.fillStyle = colors.rebateText;
      ctx.fillText(String(frameNum), left + 12, height - 13);

      if (stock.type === "negative" && STOCK_DX_BITS[stock.id]) {
        // DX Barcode segment 1 (Manufacturer / Stock ID) under holes 1, 2, 3
        const b1Start = left + 0.9 * step;
        const b1End = midpoint - 0.25 * step;
        const stockBits = STOCK_DX_BITS[stock.id] ?? STOCK_DX_BITS["portra-400"];
        drawDXBarcodeBlock(ctx, b1Start, b1End, stockBits, height, colors.rebateText);

        // Half-frame number with solid advance arrow
        if (stock.rebate.halfFrameNumbers) {
          ctx.fillStyle = colors.rebateText;
          ctx.beginPath();
          ctx.moveTo(midpoint + 2, height - 17);
          ctx.lineTo(midpoint + 8, height - 13);
          ctx.lineTo(midpoint + 2, height - 9);
          ctx.closePath();
          ctx.fill();
          ctx.fillText(`${frameNum}A`, midpoint + 12, height - 13);
        }

        // DX Barcode segment 2 (Frame number / parity / stop) under holes 5, 6, 7
        const b2Start = midpoint + 0.9 * step;
        const b2End = left + frameWidth - 0.25 * step;
        const frameBits = getFrameDXBits(frameNum);
        drawDXBarcodeBlock(ctx, b2Start, b2End, frameBits, height, colors.rebateText);
      } else {
        // Reversal / E-6 slide film: clean human-readable numbering, no barcode track
        if (stock.rebate.halfFrameNumbers) {
          ctx.fillStyle = colors.rebateText;
          if (fujiCode) {
            // Authentic right-pointing triangle advance arrow for Fujifilm slide films
            ctx.beginPath();
            ctx.moveTo(midpoint + 2, height - 17);
            ctx.lineTo(midpoint + 8, height - 13);
            ctx.lineTo(midpoint + 2, height - 9);
            ctx.closePath();
            ctx.fill();
            ctx.fillText(`${frameNum}A`, midpoint + 12, height - 13);
            ctx.fillText(fujiCode, midpoint + 68, height - 13);
          } else {
            ctx.fillText(`${frameNum}A`, midpoint + 12, height - 13);
          }
        }
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
    // Coverage only: reconstruct stock colors from uniforms in the shader.
    // This avoids amplifying GPU sRGB/alpha rounding into a blue positive base.
    paintRebate(ctx, { ...stock, base: { ...stock.base, substrateBase: 'rgb(255,255,255)', rebateText: '#000000', rebateSecondary: '#000000' } }, layout, canvas.width, virtualHeight);
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
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}
