import type { ScreeningSample } from './timeline';
import type { ScreeningCredits } from './session';

const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, size: number, width: number) {
  ctx.font = font(size);
  const measured = ctx.measureText(text).width;
  if (measured > width) { size *= width / measured; ctx.font = font(size); }
  return size;
}

/**
 * Gate, dips to dark and title/end cards. DOM overlays are not captured by
 * export, so the same drawing is composited into every rendered video frame.
 */
export function drawScreeningOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, sample: ScreeningSample, credits: ScreeningCredits) {
  const short = Math.min(width, height);
  if (sample.gate > 0 && sample.aperture) {
    // A fixed projector aperture, slightly larger than the frame, with soft edges.
    const visible = 2 * sample.camera.zoom * Math.tan(Math.PI / 8);
    const w = Math.min(width, sample.aperture.width * 1.035 / (visible * width / height) * width), h = Math.min(height, sample.aperture.height * 1.05 / visible * height);
    const x = (width - w) / 2, y = (height - h) / 2, soft = short * .012;
    ctx.save();
    ctx.fillStyle = `rgba(3,3,3,${(.94 * sample.gate).toFixed(3)})`;
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.roundRect(x, y, w, h, soft); ctx.fill('evenodd');
    for (let i = 1; i <= 4; i++) {
      ctx.strokeStyle = `rgba(3,3,3,${(.94 * sample.gate * (1 - i / 5) * .5).toFixed(3)})`; ctx.lineWidth = soft * i / 2;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, soft); ctx.stroke();
    }
    ctx.restore();
  }
  if (sample.gate > 0) {
    // A projector gate: darkened corners with a faint, flickering falloff.
    const gradient = ctx.createRadialGradient(width / 2, height / 2, short * .42, width / 2, height / 2, Math.hypot(width, height) * .56);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${(.62 * sample.gate * (2 - Math.min(1, sample.light))).toFixed(3)})`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }
  if (sample.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${sample.fade.toFixed(3)})`; ctx.fillRect(0, 0, width, height); }
  const card = sample.card;
  if (!card || card.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = card.opacity;
  ctx.fillStyle = 'rgba(8,8,7,.55)'; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const limit = width * .84, center = height / 2;
  const subtitle = [credits.stock, credits.format, `${credits.frames} ${credits.frames === 1 ? 'frame' : 'frames'}`].filter(Boolean).join('  ·  ');
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = short * .02;
  if (card.kind === 'title') {
    ctx.fillStyle = '#efe7d3';
    fitText(ctx, credits.title, size => `400 ${size}px ${SERIF}`, short * .085, limit);
    ctx.fillText(credits.title, width / 2, center - short * .03);
    ctx.fillStyle = '#c9bd9c';
    fitText(ctx, subtitle.toUpperCase(), size => `500 ${size}px ${SANS}`, short * .026, limit);
    ctx.fillText(subtitle.toUpperCase(), width / 2, center + short * .06);
  } else {
    ctx.fillStyle = '#c9bd9c';
    fitText(ctx, 'END OF ROLL', size => `500 ${size}px ${SANS}`, short * .024, limit);
    ctx.fillText('END OF ROLL', width / 2, center - short * .075);
    ctx.fillStyle = '#efe7d3';
    fitText(ctx, credits.title, size => `400 ${size}px ${SERIF}`, short * .06, limit);
    ctx.fillText(credits.title, width / 2, center);
  }
  ctx.fillStyle = 'rgba(239,231,211,.62)';
  fitText(ctx, 'filmreverie.app', size => `400 ${size}px ${SANS}`, short * .022, limit);
  ctx.fillText('filmreverie.app', width / 2, height - short * .07);
  ctx.restore();
}

/** Readable, filesystem-safe name from the roll label only. */
export function screeningFileName(label: string, reel: string) {
  const slug = label.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return `${slug || 'roll'}-${reel}.mp4`;
}
