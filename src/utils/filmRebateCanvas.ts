import * as THREE from "three";
import { DEFAULT_LAYOUT, FilmStripLayout, getFrameCenter, getStripDimensions } from "./loupeMapping";

export interface RebateColors {
  substrateBase: string;
  rebateText: string;
  rebateSecondary: string;
  frameShadow: string;
}

export const NEGATIVE_REBATE_COLORS: RebateColors = {
  // Rich translucent Kodak orange mask base
  substrateBase: "rgba(217, 119, 36, 0.82)",
  // Latent unexposed golden text
  rebateText: "rgba(255, 235, 185, 0.95)",
  rebateSecondary: "rgba(255, 210, 140, 0.80)",
  frameShadow: "rgba(90, 40, 10, 0.50)",
};

export const POSITIVE_REBATE_COLORS: RebateColors = {
  // Deep translucent celluloid bronze base
  substrateBase: "rgba(35, 27, 20, 0.85)",
  // Developed dark silver/black imprint
  rebateText: "rgba(16, 14, 12, 0.95)",
  rebateSecondary: "rgba(30, 24, 20, 0.85)",
  frameShadow: "rgba(0, 0, 0, 0.50)",
};

export function createFilmRebateCanvas(
  isPositive: boolean,
  layout: FilmStripLayout = DEFAULT_LAYOUT,
  canvasWidth = 3072,
  canvasHeight = 468
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const colors = isPositive ? POSITIVE_REBATE_COLORS : NEGATIVE_REBATE_COLORS;
  const { width: stripWidth, height: stripHeight } = getStripDimensions(layout);

  const scaleX = canvasWidth / stripWidth;
  const scaleY = canvasHeight / stripHeight;

  // 1. Fill entire substrate base with authentic translucent film base
  ctx.fillStyle = colors.substrateBase;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Punch transparent apertures for the photo frames
  // Distance from top/bottom edge to photo frame edge is marginY (0.05m)
  const py = Math.round(layout.marginY * scaleY);
  const ph = Math.round(layout.frameHeight * scaleY);

  ctx.save();
  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const xMeters = center.x + stripWidth / 2 - layout.frameWidth / 2;
    const px = Math.round(xMeters * scaleX);
    const pw = Math.round(layout.frameWidth * scaleX);

    // Clear frame rectangle so photo is fully visible underneath
    ctx.clearRect(px, py, pw, ph);

    // Subtle soft camera gate border shadow
    ctx.strokeStyle = colors.frameShadow;
    ctx.lineWidth = 3;
    ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
  }
  ctx.restore();

  // 3. Render Top Margin Rebate Print (Film Brand, Batch, and DX Barcode)
  ctx.save();
  ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.textBaseline = "middle";

  const topLabels = [
    "KODAK 400",
    "SAFETY FILM",
    "KODAK 400-3",
    "SAFETY FILM",
    "KODAK 400-5",
  ];

  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const frameLeftPx = Math.round((center.x + stripWidth / 2 - layout.frameWidth / 2) * scaleX);
    const frameCenterPx = Math.round((center.x + stripWidth / 2) * scaleX);
    const frameRightPx = Math.round((center.x + stripWidth / 2 + layout.frameWidth / 2) * scaleX);

    // Stock brand label above left half of frame (above sprocket holes)
    ctx.fillStyle = colors.rebateText;
    ctx.fillText(topLabels[i] || "KODAK 400", frameLeftPx + 20, 11);

    // Latent barcode timing tracks above center/right half of frame (below sprocket holes)
    ctx.fillStyle = colors.rebateSecondary;
    const barcodeStartX = frameCenterPx + 10;
    const barWidths = [2, 4, 2, 5, 2, 3, 5, 2, 4, 2, 5, 3, 2, 5, 2];
    let currBarX = barcodeStartX;
    for (let b = 0; b < barWidths.length && currBarX < frameRightPx - 10; b++) {
      const bw = barWidths[b];
      ctx.fillRect(currBarX, 36, bw, 10);
      currBarX += bw + 3;
    }

    // Frame divider tick at gap center
    if (i < layout.frameCount - 1) {
      const gapCenterPx = Math.round(
        (center.x + layout.frameWidth / 2 + layout.gap / 2 + stripWidth / 2) * scaleX
      );
      ctx.fillStyle = colors.rebateSecondary;
      ctx.fillRect(gapCenterPx - 1, 4, 2, 42);
    }
  }

  // 4. Render Bottom Margin Rebate Print (Frame Numbers, Advance Arrows, and Index Dots)
  ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const frameLeftPx = Math.round((center.x + stripWidth / 2 - layout.frameWidth / 2) * scaleX);
    const frameCenterPx = Math.round((center.x + stripWidth / 2) * scaleX);
    const frameRightPx = Math.round((center.x + stripWidth / 2 + layout.frameWidth / 2) * scaleX);

    const frameNum = i + 1;

    // Optical frame centering marker (above bottom sprocket holes)
    ctx.fillStyle = colors.rebateSecondary;
    ctx.fillText("▲", frameCenterPx - 5, 426);

    // Primary frame number with advance arrow below sprocket holes: "▶ 1"
    ctx.fillStyle = colors.rebateText;
    ctx.fillText(`▶ ${frameNum}`, frameLeftPx + 20, 458);

    // Half-frame index number: "1A"
    ctx.fillStyle = colors.rebateSecondary;
    ctx.fillText(`${frameNum}A`, frameRightPx - 38, 458);

    // Inter-frame gap markers
    if (i < layout.frameCount - 1) {
      const gapCenterPx = Math.round(
        (center.x + layout.frameWidth / 2 + layout.gap / 2 + stripWidth / 2) * scaleX
      );
      ctx.fillStyle = colors.rebateSecondary;
      ctx.fillRect(gapCenterPx - 1, 422, 2, 42);
    }
  }

  ctx.restore();
  return canvas;
}

export function createFilmRebateTexture(
  isPositive: boolean,
  layout: FilmStripLayout = DEFAULT_LAYOUT
): THREE.CanvasTexture {
  const canvas = createFilmRebateCanvas(isPositive, layout);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
