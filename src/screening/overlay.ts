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

/** Deterministic pseudo-random values for dust, stable per projected frame. */
function random(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * The lit projector gate: warm lamp light and a soft bloom, the shutter
 * darkening during pull-down, dust and a hair in the gate, and a fixed
 * aperture slightly larger than the frame.
 */
function drawDust(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sample: ScreeningSample, short: number) {
  const tick = Math.floor(sample.time * 24);
  ctx.fillStyle = `rgba(12,10,8,${(.55 * sample.dust).toFixed(3)})`;
  for (let i = 0; i < 3; i++) {
    if (random(tick * 7 + i) > .28) continue;
    const r = short * (.0015 + .003 * random(tick * 13 + i));
    ctx.beginPath(); ctx.ellipse(x + w * random(tick * 3 + i * 5), y + h * random(tick * 11 + i * 3), r, r * (.6 + .6 * random(tick + i)), random(tick * 5 + i) * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  // A hair caught at the lower-left edge of the gate, trembling slightly.
  const tremble = Math.sin(sample.time * 9) * short * .002;
  ctx.strokeStyle = `rgba(10,8,6,${(.45 * sample.dust).toFixed(3)})`; ctx.lineWidth = Math.max(1, short * .0016);
  ctx.beginPath(); ctx.moveTo(x - 2, y + h * .78);
  ctx.bezierCurveTo(x + w * .05, y + h * .74 + tremble, x + w * .03, y + h * .9, x + w * .09 + tremble, y + h * .95); ctx.stroke();
}

/**
 * The empty gate before and after the film: black surroundings and the lamp's
 * soft, warm light warming up in the aperture. The countdown leader is
 * projected inside it. Nothing of the table shows through.
 */
function drawLamp(ctx: CanvasRenderingContext2D, width: number, height: number, rect: { x: number; y: number; w: number; h: number }, sample: ScreeningSample) {
  const { x, y, w, h } = rect, short = Math.min(width, height), lamp = Math.max(0, Math.min(1, sample.lamp ?? 0)), soft = short * .014;
  ctx.save();
  ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, width, height);
  if (lamp > 0) {
    for (let i = 3; i >= 1; i--) {
      ctx.strokeStyle = `rgba(255,196,130,${(.06 * lamp / i).toFixed(3)})`; ctx.lineWidth = soft * i * 2.4;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, soft); ctx.stroke();
    }
    ctx.beginPath(); ctx.roundRect(x, y, w, h, soft); ctx.clip();
    const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(w, h) * .55);
    glow.addColorStop(0, 'rgb(255,246,228)'); glow.addColorStop(1, 'rgb(214,192,160)');
    ctx.globalAlpha = lamp; ctx.fillStyle = glow; ctx.fillRect(x, y, w, h);
    const card = sample.card;
    if (card?.kind === 'countdown') drawCountdown(ctx, x, y, w, h, card.elapsed, card.duration, sample.reducedMotion);
    ctx.globalAlpha = 1;
    if (sample.dust > 0) drawDust(ctx, x, y, w, h, { ...sample, dust: sample.dust * lamp }, short);
  }
  ctx.restore();
}

function drawProjection(ctx: CanvasRenderingContext2D, width: number, height: number, sample: ScreeningSample) {
  const short = Math.min(width, height), gate = sample.gate, aperture = sample.aperture!;
  const visible = 2 * sample.camera.zoom * Math.tan(Math.PI / 8);
  const w = Math.min(width, aperture.width * 1.035 / (visible * width / height) * width), h = Math.min(height, aperture.height * 1.05 / visible * height);
  const x = (width - w) / 2, y = (height - h) / 2, soft = short * .014;
  if (sample.lamp !== null) { drawLamp(ctx, width, height, { x, y, w, h }, sample); return; }
  ctx.save();
  // Warm tungsten light with slightly lifted blacks, as on a projection screen.
  ctx.fillStyle = `rgba(255,176,96,${(.08 * gate).toFixed(3)})`;
  ctx.fillRect(x, y, w, h);
  if (sample.shutter > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, sample.shutter * gate).toFixed(3)})`; ctx.fillRect(x, y, w, h); }
  if (sample.dust > 0 && sample.shutter < .5) drawDust(ctx, x, y, w, h, sample, short);
  // Light spilling onto the gate plate, then the plate itself.
  for (let i = 1; i <= 3; i++) {
    ctx.strokeStyle = `rgba(255,196,130,${(.05 * gate / i).toFixed(3)})`; ctx.lineWidth = soft * i * 2.2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, soft); ctx.stroke();
  }
  ctx.fillStyle = `rgba(3,3,3,${(.94 * gate).toFixed(3)})`;
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.roundRect(x - soft * .5, y - soft * .5, w + soft, h + soft, soft); ctx.fill('evenodd');
  for (let i = 1; i <= 4; i++) {
    ctx.strokeStyle = `rgba(3,3,3,${(.94 * gate * (1 - i / 5) * .5).toFixed(3)})`; ctx.lineWidth = soft * i / 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, soft); ctx.stroke();
  }
  // Lamp falloff toward the corners, flickering with the shutter.
  const falloff = ctx.createRadialGradient(width / 2, height / 2, short * .42, width / 2, height / 2, Math.hypot(width, height) * .56);
  falloff.addColorStop(0, 'rgba(0,0,0,0)');
  falloff.addColorStop(1, `rgba(0,0,0,${(.62 * gate * (2 - Math.min(1, sample.light))).toFixed(3)})`);
  ctx.fillStyle = falloff; ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Black bars around a photograph shown whole, placed from the camera pose. */
function drawMatte(ctx: CanvasRenderingContext2D, width: number, height: number, sample: ScreeningSample) {
  const matte = sample.matte!, camera = sample.camera, fov = (camera.fov ?? 45) * Math.PI / 180;
  const visibleHeight = 2 * camera.zoom * Math.tan(fov / 2), visibleWidth = visibleHeight * width / height;
  const dx = matte.x - camera.pan.x, dz = matte.z - camera.pan.z, c = Math.cos(camera.yaw), s = Math.sin(camera.yaw);
  // Screen right is (cos yaw, −sin yaw) and screen up (−sin yaw, −cos yaw) on the table plane.
  const right = dx * c - dz * s, up = -dx * s - dz * c;
  const w = matte.width / visibleWidth * width, h = matte.height / visibleHeight * height;
  const x = width / 2 + right / visibleWidth * width - w / 2, y = height / 2 - up / visibleHeight * height - h / 2;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${matte.alpha.toFixed(3)})`;
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.rect(x, y, w, h); ctx.fill('evenodd');
  ctx.restore();
}

/** An Academy-style leader counting 5 to 2 with a sweeping hand, projected into the gate. */
function drawCountdown(ctx: CanvasRenderingContext2D, left: number, top: number, width: number, height: number, elapsed: number, duration: number, reducedMotion: boolean) {
  const count = 4, step = duration / count, index = Math.min(count - 1, Math.floor(elapsed / step));
  const number = 5 - index, progress = reducedMotion ? 0 : (elapsed - index * step) / step;
  const cx = left + width / 2, cy = top + height / 2, short = Math.min(width, height), radius = short * .38;
  const flick = reducedMotion ? 0 : random(Math.floor(elapsed * 24)) * .05;
  ctx.save();
  ctx.fillStyle = `rgb(${Math.round(176 - flick * 200)},${Math.round(168 - flick * 200)},${Math.round(152 - flick * 200)})`;
  ctx.fillRect(left, top, width, height);
  if (progress > 0) {
    ctx.fillStyle = 'rgba(40,38,34,.3)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Math.hypot(width, height), -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(250,246,236,.9)'; ctx.lineWidth = Math.max(2, short * .008);
  for (const r of [radius, radius * .84]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(25,24,22,.7)'; ctx.lineWidth = Math.max(1, short * .004);
  ctx.beginPath(); ctx.moveTo(left, cy); ctx.lineTo(left + width, cy); ctx.moveTo(cx, top); ctx.lineTo(cx, top + height); ctx.stroke();
  ctx.fillStyle = '#141311'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(radius * 1.25)}px ${SANS}`;
  ctx.fillText(String(number), cx, cy + radius * .05);
  ctx.restore();
}

/**
 * Gate, dips to dark and title/end cards. DOM overlays are not captured by
 * export, so the same drawing is composited into every rendered video frame.
 */
/** True when drawScreeningOverlay would draw nothing for this sample. */
export function overlayIsEmpty(sample: ScreeningSample) {
  const card = sample.card;
  return !((sample.gate > 0 || sample.lamp !== null) && sample.aperture) && !(sample.matte && sample.matte.alpha > 0) && !(sample.fade > 0)
    && !(card && card.opacity > 0 && card.kind !== 'countdown');
}

export function drawScreeningOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, sample: ScreeningSample, credits: ScreeningCredits) {
  const short = Math.min(width, height);
  if ((sample.gate > 0 || sample.lamp !== null) && sample.aperture) drawProjection(ctx, width, height, sample);
  if (sample.matte && sample.matte.alpha > 0) drawMatte(ctx, width, height, sample);
  if (sample.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${sample.fade.toFixed(3)})`; ctx.fillRect(0, 0, width, height); }
  const card = sample.card;
  if (!card || card.opacity <= 0) return;
  // The countdown is part of the projection, drawn inside the lamp-lit gate.
  if (card.kind === 'countdown') return;
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
