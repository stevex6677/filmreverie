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
  // Photochemically exposed dark latent dye imprint
  rebateText: "rgba(42, 18, 8, 0.92)",
  rebateSecondary: "rgba(70, 32, 14, 0.80)",
  frameShadow: "rgba(60, 24, 8, 0.50)",
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

  // Subtle organic celluloid density & microscopic dye cloud grain
  try {
    const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const d = imgData.data;
    let seed = 1337;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const grain = ((seed - 1) / 2147483646 - 0.5) * 6;
      d[i] = Math.min(255, Math.max(0, d[i] + grain));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + grain * 0.7));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + grain * 0.4));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Graceful fallback if getImageData is unavailable in mock environment
  }

  // Latent colored guide stripe along upper and lower perforation rails (characteristic of Kodak & Fuji stocks)
  ctx.save();
  ctx.strokeStyle = isPositive ? "rgba(25, 20, 16, 0.35)" : "rgba(140, 45, 15, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.lineTo(canvasWidth, 24);
  ctx.moveTo(0, canvasHeight - 24);
  ctx.lineTo(canvasWidth, canvasHeight - 24);
  ctx.stroke();
  ctx.restore();

  // 2. Punch transparent apertures for the photo frames with optical camera gate penumbra
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

    // Soft camera gate optical penumbra (simulates focal plane aperture distance blur)
    ctx.strokeStyle = colors.frameShadow;
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);

    ctx.strokeStyle = isPositive ? "rgba(0, 0, 0, 0.20)" : "rgba(50, 20, 6, 0.25)";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
  }
  ctx.restore();

  // 3. Render Top Margin Rebate Print (Film Brand, Batch, Timing Clock Track)
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
  const batchCodes = ["509", "509-1", "509-2", "509-3", "509-4"];

  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const frameLeftPx = Math.round((center.x + stripWidth / 2 - layout.frameWidth / 2) * scaleX);
    const frameCenterPx = Math.round((center.x + stripWidth / 2) * scaleX);
    const frameRightPx = Math.round((center.x + stripWidth / 2 + layout.frameWidth / 2) * scaleX);

    // Stock brand label above left half of frame (above sprocket holes)
    ctx.fillStyle = colors.rebateText;
    ctx.fillText(topLabels[i] || "KODAK 400", frameLeftPx + 16, 11);

    // Emulsion batch code
    ctx.fillStyle = colors.rebateSecondary;
    ctx.fillText(batchCodes[i] || "509", frameRightPx - 50, 11);

    // Continuous DX timing clock track: regular ticks synchronized to sprocket holes
    const sproketPitchPx = (frameRightPx - frameLeftPx) / 8;
    for (let s = 0; s < 8; s++) {
      const sx = frameLeftPx + s * sproketPitchPx + sproketPitchPx / 2;
      ctx.fillStyle = colors.rebateSecondary;
      ctx.fillRect(sx - 1, 37, 2, 8);
      ctx.fillRect(sx + 8, 39, 1.5, 4);
    }

    // Machine-readable optical barcode track above center/right half of frame
    ctx.fillStyle = colors.rebateText;
    const barcodeStartX = frameCenterPx - 20;
    const barWidths = [2, 4, 1.5, 5, 2, 3, 5, 1.5, 4, 2, 5, 3, 2, 5, 1.5, 4];
    let currBarX = barcodeStartX;
    for (let b = 0; b < barWidths.length && currBarX < frameRightPx - 60; b++) {
      const bw = barWidths[b];
      ctx.fillRect(currBarX, 36, bw, 10);
      currBarX += bw + 2.5;
    }

    // Frame divider tick at gap center
    if (i < layout.frameCount - 1) {
      const gapCenterPx = Math.round(
        (center.x + layout.frameWidth / 2 + layout.gap / 2 + stripWidth / 2) * scaleX
      );
      ctx.fillStyle = colors.rebateSecondary;
      ctx.fillRect(gapCenterPx - 1, 4, 2, 40);
    }
  }

  // 4. Render Bottom Margin Rebate Print (DX Edge Code, Frame Numbers, Optical Sync Notches)
  ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  for (let i = 0; i < layout.frameCount; i++) {
    const center = getFrameCenter(i, layout);
    const frameLeftPx = Math.round((center.x + stripWidth / 2 - layout.frameWidth / 2) * scaleX);
    const frameCenterPx = Math.round((center.x + stripWidth / 2) * scaleX);
    const frameRightPx = Math.round((center.x + stripWidth / 2 + layout.frameWidth / 2) * scaleX);

    const frameNum = i + 1;

    // Optical frame centering marker (above bottom sprocket holes)
    ctx.fillStyle = colors.rebateSecondary;
    ctx.fillText("▲", frameCenterPx - 5, 424);

    // Primary frame number with advance chevron below sprocket holes: "▶ 1"
    ctx.fillStyle = colors.rebateText;
    ctx.fillText(`▶ ${frameNum}`, frameLeftPx + 16, 456);

    // Half-frame index number: "1A"
    ctx.fillStyle = colors.rebateSecondary;
    ctx.fillText(`${frameNum}A`, frameRightPx - 42, 456);

    // Machine-readable DX barcode along bottom rail (specifies frame ID for lab mini-labs)
    const bottomBarcodeX = frameLeftPx + 65;
    const bottomBars = [3, 2, 4, 1.5, 5, 2, 4, 3, 2, 5, 1.5, 4, 2, 3];
    let bbx = bottomBarcodeX;
    ctx.fillStyle = colors.rebateText;
    for (let b = 0; b < bottomBars.length && bbx < frameCenterPx - 20; b++) {
      const bw = bottomBars[b];
      ctx.fillRect(bbx, 448, bw, 12);
      bbx += bw + 3;
    }

    // Minilab optical cutter sync notch (circular/semicircular cutout notch under sprockets)
    ctx.fillStyle = colors.rebateSecondary;
    ctx.beginPath();
    ctx.arc(frameRightPx - 15, 436, 4, 0, Math.PI * 2);
    ctx.fill();

    // Inter-frame gap markers
    if (i < layout.frameCount - 1) {
      const gapCenterPx = Math.round(
        (center.x + layout.frameWidth / 2 + layout.gap / 2 + stripWidth / 2) * scaleX
      );
      ctx.fillStyle = colors.rebateSecondary;
      ctx.fillRect(gapCenterPx - 1, 424, 2, 40);
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
