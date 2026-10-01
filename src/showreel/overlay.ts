import * as THREE from 'three';
import { applyScreeningPose } from '../screening/camera';
import { SHOWREEL_GITHUB, SHOWREEL_SITE, type ShowreelSample, type ShowreelTimeline } from './timeline';
import { DEFAULT_SETTINGS, type ShowreelLook } from './settings';

// Everything here is drawn into a 2D canvas from the timeline alone, so the
// live page and an exported video show the same frame. Only normal alpha
// compositing is used: the live overlay is a separate canvas over WebGL.

const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const CREAM = '#f1e9d6', AMBER = '#e9b867', MUTED = 'rgba(241,233,214,.74)';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const u = clamp(value); return u * u * (3 - 2 * u); };
const outCubic = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
/** Opacity of something shown from `start` to `end`, fading in and out. */
const shown = (time: number, start: number, end: number, fadeIn = .45, fadeOut = .35) => Math.min(smooth((time - start) / fadeIn), smooth((end - time) / fadeOut));

function hash(n: number) { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); }

function font(ctx: CanvasRenderingContext2D, weight: string, size: number, family: string, spacing = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
}
/** Sets a font; texts are written for the 16:9 frame, so `width` is only a guide. */
function fit(ctx: CanvasRenderingContext2D, weight: string, size: number, family: string, _width: number, spacing = 0) {
  font(ctx, weight, size, family, spacing);
}

// Film grain: a few noise tiles, cycled and offset at 24 fps.
let grainTiles: HTMLCanvasElement[] | null = null;
function grain() {
  if (grainTiles) return grainTiles;
  grainTiles = Array.from({ length: 4 }, (_, tile) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!, image = ctx.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const value = hash(i * 1.37 + tile * 9973.1), light = value > .5;
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = light ? 255 : 0;
      image.data[i * 4 + 3] = Math.round(Math.abs(value - .5) * 2 * 26);
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  });
  return grainTiles;
}

function drawGrain(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, amount: number) {
  if (amount <= 0) return;
  const tick = Math.floor(time * 24), scale = Math.max(1, height / 720), size = 256 * scale;
  // 0.5 is the reviewed look; strong grain stacks a second tile up to ~1.5×.
  const strength = 1.1 * amount * (1 + amount) / 1.5;
  ctx.save();
  for (const [layer, alpha] of [[0, Math.min(1, strength)], [1, strength - 1]] as const) {
    if (alpha <= 0) continue;
    const tile = grain()[(tick + layer * 2) % 4], ox = Math.floor(hash(tick + layer * .25) * 256), oy = Math.floor(hash(tick + .5 + layer * .25) * 256);
    ctx.globalAlpha = alpha;
    for (let y = -oy * scale; y < height; y += size) for (let x = -ox * scale; x < width; x += size) ctx.drawImage(tile, x, y, size, size);
  }
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const gradient = ctx.createRadialGradient(width / 2, height / 2, height * .42, width / 2, height / 2, Math.hypot(width, height) * .58);
  gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, `rgba(0,0,0,${(.7 * amount).toFixed(3)})`);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
}

/** A warm light leak washing across the cut at `peak`. */
function drawFlash(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, peak: number, index: number, amount: number) {
  const local = (time - peak) / .42;
  if (Math.abs(local) >= 1 || amount <= 0) return;
  const strength = amount * Math.pow(1 - Math.abs(local), 1.6), side = index % 2 ? -1 : 1;
  const cx = width * (.5 + side * (.55 - .5 * (local + 1) / 2)), cy = height * (.35 + .2 * hash(index));
  ctx.save();
  for (const [radius, color, alpha] of [[1.1, '255,120,40', .55], [.7, '255,190,90', .7], [.35, '255,244,214', .85]] as const) {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * radius * (1.2 + .6 * strength));
    gradient.addColorStop(0, `rgba(${color},${(alpha * strength).toFixed(3)})`); gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

/** A soft dark field behind text, for legibility over any shot. */
function scrim(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(6,5,4,${alpha.toFixed(3)})`); gradient.addColorStop(1, 'rgba(6,5,4,0)');
  ctx.fillStyle = gradient; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
}

function rise(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, progress: number, u: number) {
  ctx.save(); ctx.globalAlpha *= smooth(progress * 1.4);
  ctx.fillText(text, x, y + (1 - outCubic(progress)) * 18 * u); ctx.restore();
}

function drawHook(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, moment: Extract<ShowreelTimeline['moments'][number], { kind: 'hook' }>) {
  const u = height / 720, x = width * .075, alpha = shown(time, moment.start, moment.end, .5, .45);
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  scrim(ctx, x + 260 * u, height * .72, 520 * u, 170 * u, .5);
  ctx.fillStyle = CREAM; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  moment.lines.forEach((line, index) => {
    const start = moment.start + index * 1.35;
    if (time < start) return;
    fit(ctx, index ? 'italic 400' : '400', 62 * u, SERIF, width * .6);
    if (index) ctx.fillStyle = AMBER;
    rise(ctx, line, x, height * (.7 + index * .11), (time - start) / .8, u);
  });
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, moment: { start: number; end: number }) {
  const u = height / 720, alpha = shown(time, moment.start, moment.end, .7, .5), p = (time - moment.start) / 1.1;
  if (alpha <= 0) return;
  const cx = width / 2, cy = height * .47;
  ctx.save(); ctx.globalAlpha = alpha;
  scrim(ctx, cx, cy, 560 * u, 210 * u, .62);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = AMBER; fit(ctx, '600', 14 * u, SANS, width * .8, 5 * u);
  rise(ctx, 'AN IMMERSIVE 3D DARKROOM', cx, cy - 74 * u, p, u);
  ctx.fillStyle = CREAM; fit(ctx, '400', 104 * u, SERIF, width * .86, 1 * u);
  rise(ctx, 'Film Reverie', cx, cy + 20 * u, p - .12, u);
  const line = 180 * u * outCubic(p - .3);
  ctx.fillStyle = 'rgba(233,184,103,.85)'; ctx.fillRect(cx - line, cy + 46 * u, line * 2, Math.max(1, 1.4 * u));
  ctx.fillStyle = MUTED; fit(ctx, '400', 21 * u, SANS, width * .8);
  rise(ctx, 'Your photographs on real film, right in your browser.', cx, cy + 88 * u, p - .35, u);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, caption: ShowreelTimeline['captions'][number]) {
  const alpha = shown(time, caption.start, caption.end, .5, .4);
  if (alpha <= 0) return;
  const u = height / 720, x = width * .06, base = caption.top ? height * .2 : height * .86, p = (time - caption.start) / .9;
  ctx.save(); ctx.globalAlpha = alpha;
  const shade = caption.top ? ctx.createLinearGradient(0, 0, width * .55, height * .55) : ctx.createLinearGradient(0, height, width * .55, height * .45);
  shade.addColorStop(0, 'rgba(5,4,3,.62)'); shade.addColorStop(1, 'rgba(5,4,3,0)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (caption.chapter) {
    const rule = 34 * u * outCubic(p);
    ctx.fillStyle = AMBER; ctx.fillRect(x, base - 92 * u, rule, Math.max(1, 1.5 * u));
    fit(ctx, '600', 13 * u, SANS, width * .5, 3.6 * u);
    rise(ctx, caption.chapter.toUpperCase(), x + 46 * u, base - 87 * u, p, u);
  }
  ctx.fillStyle = CREAM; fit(ctx, '400', 46 * u, SERIF, width * .6);
  rise(ctx, caption.title, x, base - 32 * u, p - .1, u);
  if (caption.line) { ctx.fillStyle = MUTED; fit(ctx, '400', 19 * u, SANS, width * .6); rise(ctx, caption.line, x, base, p - .22, u); }
  ctx.restore();
}

function drawSlate(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, slate: ShowreelTimeline['slates'][number], timeline: ShowreelTimeline) {
  const alpha = shown(time, slate.start, slate.end, .5, .35);
  if (alpha <= 0) return;
  const roll = timeline.rolls[slate.roll], u = height / 720, right = width * .945, base = height * .86;
  const detail = `${roll.stockName}  ·  ${roll.formatLabel}  ·  ${roll.definition.frames.length} frames`.toUpperCase();
  ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  scrim(ctx, right - 120 * u, base - 14 * u, 260 * u, 60 * u, .45);
  ctx.fillStyle = CREAM; fit(ctx, 'italic 400', 26 * u, SERIF, width * .35);
  ctx.fillText(roll.name, right, base - 24 * u);
  ctx.fillStyle = AMBER; fit(ctx, '600', 11.5 * u, SANS, width * .35, 2.6 * u);
  ctx.fillText(detail, right, base);
  ctx.restore();
}

const projector = new THREE.PerspectiveCamera();
const point = new THREE.Vector3();
function drawExhibits(ctx: CanvasRenderingContext2D, width: number, height: number, sample: ShowreelSample, timeline: ShowreelTimeline) {
  const visible = timeline.exhibits.filter(item => sample.time > item.start && sample.time < item.end);
  if (!visible.length) return;
  const u = height / 720;
  projector.aspect = width / height;
  applyScreeningPose(projector, sample.camera);
  for (const item of visible) {
    point.set(...item.position).project(projector);
    if (point.z > 1 || Math.abs(point.x) > 1.1) continue;
    const x = (point.x + 1) / 2 * width, y = (1 - point.y) / 2 * height;
    const alpha = shown(sample.time, item.start, item.end, .45, .35) * smooth((1.08 - Math.abs(point.x)) / .25);
    if (alpha <= 0) continue;
    const p = (sample.time - item.start) / .7, top = y + 16 * u + (1 - outCubic(p)) * 8 * u;
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    fit(ctx, '400', 17 * u, SERIF, 220 * u);
    const nameWidth = ctx.measureText(item.name).width, cardWidth = Math.max(nameWidth, 70 * u) + 26 * u, cardHeight = 44 * u;
    ctx.fillStyle = 'rgba(233,184,103,.75)'; ctx.fillRect(x - .5 * u, y, Math.max(1, u), (top - y) * outCubic(p));
    ctx.fillStyle = 'rgba(14,12,10,.74)'; ctx.strokeStyle = 'rgba(233,184,103,.5)'; ctx.lineWidth = Math.max(1, u);
    ctx.beginPath(); ctx.roundRect(x - cardWidth / 2, top, cardWidth, cardHeight, 4 * u); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CREAM; ctx.fillText(item.name, x, top + 20 * u);
    ctx.fillStyle = AMBER; fit(ctx, '600', 10.5 * u, SANS, 200 * u, 2.4 * u); ctx.fillText(item.year, x, top + 35 * u);
    ctx.restore();
  }
}

function githubMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  // A simplified Octocat mark: a circle with the cat silhouette cut out.
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 16, size / 16);
  ctx.beginPath(); ctx.arc(8, 8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(5.2, 14.6); ctx.lineTo(5.2, 12.3); ctx.bezierCurveTo(3.4, 12.6, 3, 11.4, 2.7, 10.9);
  ctx.bezierCurveTo(3.4, 10.9, 3.8, 11.8, 5.2, 11.6); ctx.bezierCurveTo(5.2, 11, 5.4, 10.6, 5.6, 10.4);
  ctx.bezierCurveTo(4, 10.2, 3, 9.4, 3, 7.4); ctx.bezierCurveTo(3, 6.7, 3.3, 6.1, 3.7, 5.6);
  ctx.bezierCurveTo(3.6, 5.2, 3.5, 4.5, 3.8, 3.7); ctx.bezierCurveTo(4.5, 3.7, 5.2, 4.1, 5.8, 4.6);
  ctx.bezierCurveTo(7.2, 4.2, 8.8, 4.2, 10.2, 4.6); ctx.bezierCurveTo(10.8, 4.1, 11.5, 3.7, 12.2, 3.7);
  ctx.bezierCurveTo(12.5, 4.5, 12.4, 5.2, 12.3, 5.6); ctx.bezierCurveTo(12.7, 6.1, 13, 6.7, 13, 7.4);
  ctx.bezierCurveTo(13, 9.4, 12, 10.2, 10.4, 10.4); ctx.bezierCurveTo(10.7, 10.7, 10.8, 11.2, 10.8, 11.8);
  ctx.lineTo(10.8, 14.6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawEnd(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, moment: { start: number; end: number }) {
  const local = time - moment.start;
  if (local <= 0) return;
  const u = height / 720, cx = width / 2, cy = height * .44;
  ctx.save();
  ctx.fillStyle = `rgba(6,5,4,${(.8 * smooth(local / 1.1)).toFixed(3)})`; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const step = (delay: number) => (local - delay) / .8;
  ctx.fillStyle = CREAM; fit(ctx, '400', 92 * u, SERIF, width * .86, 1 * u);
  rise(ctx, 'Film Reverie', cx, cy - 34 * u, step(.25), u);
  ctx.fillStyle = MUTED; fit(ctx, 'italic 400', 30 * u, SERIF, width * .8);
  rise(ctx, 'Make your own darkroom.', cx, cy + 16 * u, step(.55), u);
  // The address in an outlined pill.
  const p = step(.85);
  if (p > 0) {
    ctx.save(); ctx.globalAlpha *= smooth(p * 1.4);
    fit(ctx, '600', 26 * u, SANS, width * .6, 1.2 * u);
    const pill = ctx.measureText(SHOWREEL_SITE).width + 54 * u, top = cy + 50 * u + (1 - outCubic(p)) * 14 * u;
    ctx.fillStyle = 'rgba(233,184,103,.14)'; ctx.strokeStyle = AMBER; ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.beginPath(); ctx.roundRect(cx - pill / 2, top, pill, 52 * u, 26 * u); ctx.fill(); ctx.stroke();
    ctx.fillStyle = AMBER; ctx.fillText(SHOWREEL_SITE, cx, top + 35 * u);
    ctx.restore();
  }
  const g = step(1.1);
  if (g > 0) {
    ctx.save(); ctx.globalAlpha *= smooth(g * 1.4);
    fit(ctx, '400', 18 * u, SANS, width * .7);
    const text = SHOWREEL_GITHUB, textWidth = ctx.measureText(text).width, icon = 20 * u, gap = 10 * u;
    const left = cx - (textWidth + icon + gap) / 2, base = cy + 148 * u + (1 - outCubic(g)) * 12 * u;
    ctx.fillStyle = CREAM; githubMark(ctx, left, base - icon * .82, icon);
    ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.fillText(text, left + icon + gap, base);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(241,233,214,.66)'; fit(ctx, '600', 12.5 * u, SANS, width * .8, 3 * u);
  rise(ctx, 'FREE  ·  NO ACCOUNT  ·  YOUR PHOTOS STAY IN YOUR BROWSER', cx, height * .9, step(1.4), u);
  ctx.restore();
}

/** The showreel's titles and effects for one sample (see ScreeningSession.decorate). */
export function drawShowreelOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, sample: ShowreelSample, timeline: ShowreelTimeline, look: ShowreelLook = DEFAULT_SETTINGS) {
  const time = sample.time;
  ctx.save();
  drawVignette(ctx, width, height, look.vignette);
  if (look.titles) {
    drawExhibits(ctx, width, height, sample, timeline);
    for (const caption of timeline.captions) if (time > caption.start - .05 && time < caption.end + .05) drawCaption(ctx, width, height, time, caption);
    for (const slate of timeline.slates) if (time > slate.start && time < slate.end) drawSlate(ctx, width, height, time, slate, timeline);
  }
  for (const moment of timeline.moments) {
    if (time < moment.start || time > moment.end) continue;
    // The end card stays: it carries the address.
    if (moment.kind === 'end') drawEnd(ctx, width, height, time, moment);
    else if (!look.titles) continue;
    else if (moment.kind === 'hook') drawHook(ctx, width, height, time, moment);
    else drawTitle(ctx, width, height, time, moment);
  }
  timeline.flashes.forEach((peak, index) => drawFlash(ctx, width, height, time, peak, index, look.leaks));
  drawGrain(ctx, width, height, time, look.grain);
  ctx.restore();
}
