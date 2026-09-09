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

// Physical identity is independent of the photo's negative/positive preview.
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
    ctx.strokeStyle = colors.frameShadow;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, py, frameWidth, ph);

    // The developed 135 references put stock lettering and a full-frame number
    // on one outer rail, and full/half-frame numbers on the opposite outer rail.
    // Both rails read in the same direction. No cartridge DX or KEYKODE artwork.
    ctx.fillStyle = colors.rebateText;
    ctx.fillText(String(i + 1), left + 12, 13);
    ctx.fillText(stock.rebate.label, left + 95, 13);
    ctx.fillText(String(i + 1), left + 12, height - 13);
    if (stock.rebate.halfFrameNumbers) {
      ctx.fillText(`${i + 1}A`, midpoint + 12, height - 13);
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
  return canvas;
}

export function createFilmRebateTexture(
  stock: FilmStockProfile = getFilmStock(DEFAULT_FILM_STOCK_ID),
  layout: FilmStripLayout = DEFAULT_LAYOUT
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(createFilmRebateCanvas(stock, layout));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
