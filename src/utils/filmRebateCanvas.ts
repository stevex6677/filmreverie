import { draw120Rebate } from "./film120Rebate";
import * as THREE from "three";
import { DEFAULT_LAYOUT, FilmStripLayout, getFrameCenter, getStripDimensions } from "./loupeMapping";
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
    const left = (center.x + stripWidth / 2 - layout.frameWidth / 2) * scaleX;
    const frameWidth = layout.frameWidth * scaleX;
    const midpoint = left + frameWidth / 2;
    ctx.clearRect(left, py, frameWidth, ph);
    // No artificial dark stroke around the image gate.
    if (layout.perforated === false) continue;

    // The developed 135 references put stock lettering and a full-frame number
    // on one outer rail, and full/half-frame numbers on the opposite outer rail.
    // Both rails read in the same direction. No cartridge DX or KEYKODE artwork.
    ctx.fillStyle = colors.rebateText;
    ctx.fillText(String(i + 1 + (layout.frameNumberOffset ?? 0)), left + 12, 13);
    ctx.fillText(stock.rebate.label, left + 95, 13);
    ctx.fillText(String(i + 1 + (layout.frameNumberOffset ?? 0)), left + 12, height - 13);
    if (stock.rebate.halfFrameNumbers) {
      ctx.fillText(`${i + 1 + (layout.frameNumberOffset ?? 0)}A`, midpoint + 12, height - 13);
      if (stock.type === "negative") {
        ctx.beginPath();
        ctx.moveTo(midpoint + 52, height - 19);
        ctx.lineTo(midpoint + 65, height - 13);
        ctx.lineTo(midpoint + 52, height - 7);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Optical edge codes are visible on the source negatives but their exact
    // bit patterns/registration are unverified. Omit instead of inventing bars.
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
