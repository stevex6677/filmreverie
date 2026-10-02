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
  rise(ctx, 'A simulation of the traditional film-viewing experience.', cx, cy + 88 * u, p - .35, u);
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

// The New roll editor, after the app's own (RollEditor and roll-editor.css),
// simplified and drawn in a 1000 × 700 space beside the chapter text.
const EDITOR = { ink: '#252820', text: '#3d4137', muted: '#686c5f', line: '#cfc8ba', panel: '#f4f1ea', well: '#e7e2d8', paper: '#eeeae2',
  field: '#faf8f3', fieldLine: '#afa999', accent: '#394b3b', brass: '#71623e', stage: '#262723' };
const EDITOR_SIZE = { width: 1000, height: 700 };

// Photographs drawn into the editor; loaded before the pre-roll so every frame, and the export, has them.
const photos = new Map<string, HTMLImageElement>();
const editorPhotos = (timeline: ShowreelTimeline) => {
  const frames = timeline.rolls[0].definition.frames;
  return { thumbs: frames.map(frame => frame.thumbnailSrc ?? frame.src), stage: frames[0].src, frames };
};
export function loadShowreelPhotos(timeline: ShowreelTimeline) {
  const { thumbs, stage } = editorPhotos(timeline);
  return Promise.all([...thumbs, stage].map(url => {
    let image = photos.get(url);
    if (!image) { image = new Image(); image.src = url; photos.set(url, image); }
    return image.decode().catch(() => { /* Drawn without the photograph. */ });
  })).then(() => {});
}
let layerCanvas: HTMLCanvasElement | null = null;
function editorLayer(width: number, height: number) {
  layerCanvas ??= document.createElement('canvas');
  if (layerCanvas.width !== width || layerCanvas.height !== height) { layerCanvas.width = width; layerCanvas.height = height; }
  return layerCanvas;
}
const photo = (url: string) => { const image = photos.get(url); return image?.complete && image.naturalWidth ? image : null; };

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[], fill?: string, stroke?: string, line = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, weight: string, size: number, family = SANS, align: CanvasTextAlign = 'left', spacing = 0) {
  font(ctx, weight, size, family, spacing); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
}
/** Words wrapped to `width`, in the current font. */
function wrap(ctx: CanvasRenderingContext2D, value: string, width: number) {
  const lines: string[] = [];
  for (const word of value.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}
function lock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 16, size / 16);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.7;
  ctx.beginPath(); ctx.moveTo(4.5, 7); ctx.lineTo(4.5, 5); ctx.arc(8, 5, 3.5, Math.PI, 0); ctx.lineTo(11.5, 7); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(2.5, 7, 11, 8.5, 1.6); ctx.fill();
  ctx.restore();
}
function pointer(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 20, size / 20);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.2, 13.2); ctx.lineTo(7, 19.5); ctx.lineTo(9.8, 18.3); ctx.lineTo(7.1, 12.2); ctx.lineTo(12.6, 12.2); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
  ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke(); ctx.restore();
}
/** A photograph fitted into a box, centred; nothing if it has not loaded. */
function picture(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, w: number, h: number) {
  const image = photo(url);
  if (image) ctx.drawImage(image, x, y, w, h); else { ctx.fillStyle = '#8d8a80'; ctx.fillRect(x, y, w, h); }
}

/**
 * The editor at `t` seconds into its shot: photographs dragged in and
 * processed onto the frame strip, the roll named, then Save and open.
 */
function drawEditor(ctx: CanvasRenderingContext2D, t: number, timeline: ShowreelTimeline) {
  const { thumbs, stage, frames } = editorPhotos(timeline);
  const roll = timeline.rolls[0], name = roll.name, count = frames.length;
  const step = (start: number, length: number) => smooth((t - start) / length);
  const DROP = 1.8, EACH = .13, TYPE = 2.3;
  const arrived = Math.max(0, Math.min(count, Math.floor((t - DROP - .15) / EACH) + 1));
  const typed = name.slice(0, Math.max(0, Math.min(name.length, Math.floor((t - TYPE) / .07))));
  const named = typed.length === name.length, pressed = t > 5 && t < 5.18, saving = t >= 5;
  ctx.textBaseline = 'alphabetic';

  // The dialog, header and details column.
  box(ctx, 0, 0, EDITOR_SIZE.width, EDITOR_SIZE.height, 12, EDITOR.paper, '#bdb6a8');
  text(ctx, 'YOUR DARKROOM', 28, 42, EDITOR.brass, '500', 11, SANS, 'left', 2);
  text(ctx, 'New roll', 28, 82, EDITOR.ink, '400', 34, SERIF);
  text(ctx, `${typed || 'Untitled roll'}  ·  35mm  ·  ${roll.stockName}  ·  ${arrived} ${arrived === 1 ? 'photograph' : 'photographs'}`, 28, 107, EDITOR.muted, '400', 14);
  box(ctx, 906, 56, 66, 36, 6, undefined, '#bfb7a7'); text(ctx, 'Close', 939, 79, EDITOR.text, '500', 14, SANS, 'center');
  ctx.fillStyle = EDITOR.line; ctx.fillRect(28, 124, 944, 1); ctx.fillRect(288, 140, 1, 470);

  text(ctx, 'ROLL DETAILS', 28, 156, EDITOR.brass, '600', 11, SANS, 'left', 2);
  text(ctx, 'Roll name', 28, 186, EDITOR.text, '600', 13);
  const typing = t > TYPE - .3 && t < 4.3;
  box(ctx, 28, 195, 240, 40, 6, EDITOR.field, typing ? '#69572f' : EDITOR.fieldLine, typing ? 2 : 1);
  if (typed) text(ctx, typed, 40, 221, EDITOR.ink, '400', 16);
  else text(ctx, 'e.g. Summer on the coast', 40, 221, '#9b9a90', '400', 15);
  if (typing && Math.floor(t * 2.4) % 2 === 0) { font(ctx, '400', 16, SANS); ctx.fillStyle = EDITOR.ink; ctx.fillRect(41 + (typed ? ctx.measureText(typed).width : 0), 206, 1.5, 19); }

  text(ctx, 'Film type', 28, 264, EDITOR.text, '600', 13);
  box(ctx, 28, 273, 120, 36, [7, 0, 0, 7], EDITOR.accent);
  box(ctx, 148, 273, 120, 36, [0, 7, 7, 0], EDITOR.field, '#c3bcad');
  text(ctx, '35mm', 88, 296, '#fffaf0', '600', 14, SANS, 'center'); text(ctx, '120', 208, 296, EDITOR.text, '500', 14, SANS, 'center');

  text(ctx, 'Film stock', 28, 338, EDITOR.text, '600', 13);
  box(ctx, 28, 347, 240, 40, 6, EDITOR.field, EDITOR.fieldLine);
  text(ctx, roll.stockName, 40, 373, EDITOR.ink, '400', 15);
  ctx.strokeStyle = EDITOR.text; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(246, 364); ctx.lineTo(251, 369); ctx.lineTo(256, 364); ctx.stroke();

  // The privacy note, lit up once the photographs are in.
  const glow = shown(t, 3.5, 4.9, .3, .5);
  box(ctx, 28, 410, 240, 132, 9, '#e6ebda', glow > .02 ? `rgba(57,75,59,${(.25 + .75 * glow).toFixed(3)})` : '#cfd8c0', 1 + 1.5 * glow);
  lock(ctx, 44, 428, 16, EDITOR.accent);
  text(ctx, 'Stays on this device', 70, 442, EDITOR.ink, '700', 14);
  font(ctx, '400', 13, SANS);
  wrap(ctx, 'Your photographs stay in this browser. They are never uploaded or synced.', 196).forEach((line, i) => text(ctx, line, 44, 472 + i * 19, EDITOR.text, '400', 13));

  // Footer: the hint explains what is missing until Save and open is ready.
  ctx.fillStyle = EDITOR.line; ctx.fillRect(28, 624, 944, 1);
  box(ctx, 28, 642, 118, 38, 6, undefined, '#bfb7a7'); text(ctx, 'Cancel draft', 87, 666, EDITOR.text, '500', 14, SANS, 'center');
  const hint = saving ? 'Saving roll…' : arrived === 0 ? 'Add photographs to begin this roll.' : !named ? 'Name this roll to save it.' : '';
  if (hint) text(ctx, hint, 826, 666, EDITOR.muted, '400', 13, SANS, 'right');
  ctx.save();
  if (pressed) { ctx.translate(906, 661); ctx.scale(.96, .96); ctx.translate(-906, -661); }
  box(ctx, 840, 642, 132, 38, 6, named ? (pressed ? '#26392a' : EDITOR.accent) : '#a7ad9f');
  text(ctx, 'Save and open', 906, 666, '#fffaf0', '600', 14, SANS, 'center');
  ctx.restore();

  // The workbench: an empty drop area until the photographs land, then the frame strip.
  // The drop area clears first, then the workbench comes in, so the two never mix.
  const empty = 1 - step(DROP - .02, .14), filled = step(DROP + .1, .22), hover = shown(t, 1.15, DROP + .1, .2, .15);
  if (empty > 0) {
    ctx.save(); ctx.globalAlpha *= empty;
    // The drop area takes the accent tint while photographs are held over it.
    box(ctx, 308, 140, 664, 470, 10, `rgb(${244 - 14 * hover},${241 - 9 * hover},${234 - 14 * hover})`);
    ctx.setLineDash([5, 4]); box(ctx, 308, 140, 664, 470, 10, undefined, hover > .5 ? EDITOR.accent : '#b9b09c', 1.5 + hover); ctx.setLineDash([]);
    // The film icon from the drop area.
    box(ctx, 574, 254, 132, 60, 4, '#4a4538');
    for (let i = 0; i < 11; i++) { box(ctx, 579 + i * 11.6, 258, 6, 5, 1, EDITOR.panel); box(ctx, 579 + i * 11.6, 305, 6, 5, 1, EDITOR.panel); }
    for (let i = 0; i < 3; i++) box(ctx, 579 + i * 41.3, 268, 39, 32, 1.5, '#ebe7dd');
    text(ctx, hover > .5 ? 'Drop to add 12 photographs' : 'Bring your scans into the darkroom', 640, 356, EDITOR.ink, '400', 25, SERIF, 'center');
    text(ctx, 'Drop JPEG or PNG scans here, or choose them from this device.', 640, 386, EDITOR.muted, '400', 14.5, SANS, 'center');
    box(ctx, 556, 408, 168, 42, 7, EDITOR.accent); text(ctx, 'Choose photographs', 640, 434, '#fffaf0', '600', 14.5, SANS, 'center');
    ctx.restore();
  }
  if (filled > 0) {
    ctx.save(); ctx.globalAlpha *= filled;
    text(ctx, 'FRAMES', 310, 156, EDITOR.brass, '600', 11, SANS, 'left', 2);
    text(ctx, String(arrived), 380, 156, EDITOR.muted, '600', 11);
    box(ctx, 846, 138, 126, 28, 6, '#faf8f3', '#bfb7a7'); text(ctx, '+ Add photographs', 909, 157, EDITOR.ink, '600', 12, SANS, 'center');
    text(ctx, `Processed ${arrived} / ${count}`, 834, 157, EDITOR.muted, '400', 12, SANS, 'right');
    // Each tile pops in as it is processed; the strip scrolls to keep the newest in view.
    const widths = frames.map(frame => 58 * Math.min(1.8, frame.aspectRatio) + 12);
    const lefts = widths.map((_, i) => widths.slice(0, i).reduce((sum, w) => sum + w + 6, 0));
    const progress = Math.max(0, Math.min(count - 1, (t - DROP - .15) / EACH));
    const index = Math.floor(progress), next = Math.min(count - 1, index + 1);
    const rightEdge = lefts[index] + widths[index] + (lefts[next] + widths[next] - lefts[index] - widths[index]) * (progress - index);
    // Once every frame is in, the strip returns to the cover.
    const scroll = Math.max(0, rightEdge - 662) * (1 - step(DROP + .15 + count * EACH + .3, .6));
    ctx.save(); ctx.beginPath(); ctx.rect(308, 166, 664, 108); ctx.clip();
    frames.forEach((frame, i) => {
      const pop = step(DROP + .15 + i * EACH, .25);
      if (pop <= 0) return;
      const x = 310 + lefts[i] - scroll, w = widths[i];
      ctx.save(); ctx.globalAlpha *= pop; ctx.translate(x + w / 2, 222); ctx.scale(.85 + .15 * pop, .85 + .15 * pop); ctx.translate(-(x + w / 2), -222);
      if (i === 0) box(ctx, x, 170, w, 98, 8, '#e3dbc9', '#8b7448');
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      picture(ctx, thumbs[i], x + 6, 177, w - 12, 58); ctx.restore();
      if (i === 0) { box(ctx, x + 9, 180, 18, 16, 8, 'rgba(29,31,27,.82)'); text(ctx, '★', x + 18, 193, '#e9c46f', '600', 10, SANS, 'center'); }
      text(ctx, i === 0 ? '1 · Cover' : String(i + 1), x + w / 2, 249, EDITOR.ink, '700', 11, SANS, 'center');
      font(ctx, '400', 10, SANS);
      const file = `${frame.id}.jpg`, label = ctx.measureText(file).width > w - 4 ? `${file.slice(0, Math.max(6, Math.floor(file.length * (w - 14) / ctx.measureText(file).width)))}…` : file;
      text(ctx, label, x + w / 2, 262, EDITOR.muted, '400', 10, SANS, 'center');
      ctx.restore();
    });
    ctx.restore();

    // Crop and Film effect tabs over the stage; the film look comes in on the selected frame.
    const film = step(3.35, .4);
    box(ctx, 308, 282, 664, 328, 10, EDITOR.panel, EDITOR.line);
    box(ctx, 318, 291, 192, 34, 8, EDITOR.well);
    const tab = 321 + 92 * film;
    box(ctx, tab, 294, film > .5 ? 106 : 84, 28, 6, '#fffdf8');
    text(ctx, 'Crop', 363, 313, film > .5 ? EDITOR.muted : EDITOR.ink, '600', 13, SANS, 'center');
    text(ctx, 'Film effect', 466, 313, film > .5 ? EDITOR.ink : EDITOR.muted, '600', 13, SANS, 'center');
    text(ctx, 'Frame 1', 920, 313, EDITOR.ink, '600', 13, SANS, 'right'); text(ctx, `of ${count}`, 958, 313, EDITOR.muted, '400', 13, SANS, 'right');
    ctx.save(); ctx.beginPath(); ctx.roundRect(309, 334, 662, 275, [0, 0, 9, 9]); ctx.clip();
    ctx.fillStyle = EDITOR.stage; ctx.fillRect(309, 334, 662, 275);
    const shown1 = step(DROP + .2, .4), ph = 196, pw = ph * frames[0].aspectRatio, px = 640 - pw / 2, py = 352;
    ctx.globalAlpha *= shown1;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; picture(ctx, stage, px, py, pw, ph); ctx.restore();
    if (film > 0) {
      ctx.save(); ctx.globalAlpha *= film; ctx.filter = 'sepia(.22) saturate(1.18) contrast(1.06) brightness(1.03)';
      picture(ctx, stage, px, py, pw, ph); ctx.restore();
      ctx.save(); ctx.globalAlpha *= film;
      box(ctx, 556, 562, 168, 30, 8, 'rgba(20,21,18,.85)');
      box(ctx, 640, 565, 81, 24, 6, '#f4ecd8');
      text(ctx, 'Original', 598, 582, '#e9e2d0', '500', 12, SANS, 'center'); text(ctx, 'Film', 680, 582, '#22241f', '600', 12, SANS, 'center');
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
  }

}

/** The pointer drags a stack of photographs in from outside the dialog, then saves (editor space). */
function drawPointer(ctx: CanvasRenderingContext2D, t: number, timeline: ShowreelTimeline) {
  const { thumbs, frames } = editorPhotos(timeline);
  const count = frames.length, DROP = 1.8, pressed = t > 5 && t < 5.18;
  const step = (start: number, length: number) => smooth((t - start) / length);
  const drag = step(.7, .9), drop = step(DROP - .05, .2);
  if (t > .55 && t < DROP + .45) {
    const x = 1110 + (630 - 1110) * drag, y = 770 + (380 - 770) * drag;
    ctx.save(); ctx.globalAlpha *= smooth((t - .55) / .2);
    ctx.save(); ctx.globalAlpha *= 1 - drop;
    ctx.translate(x, y); ctx.scale(1 - .4 * drop, 1 - .4 * drop);
    [[-9, 2], [5, 1], [-1, 0]].forEach(([angle, i]) => {
      ctx.save(); ctx.rotate(angle * Math.PI / 180); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      box(ctx, -66, -46, 132, 92, 3, '#fbf8f1'); ctx.shadowColor = 'transparent';
      picture(ctx, thumbs[i], -60, -40, 120, 80); ctx.restore();
    });
    box(ctx, 52, -58, 30, 24, 12, EDITOR.accent); text(ctx, String(count), 67, -41, '#fffaf0', '700', 13, SANS, 'center');
    ctx.restore();
    // The pointer stays a moment after letting go.
    ctx.globalAlpha *= 1 - step(DROP + .1, .3);
    pointer(ctx, x + 10, y + 8, 24);
    ctx.restore();
  }
  const save = step(4.2, .75);
  if (t > 4.05 && t < 5.6) {
    ctx.save(); ctx.globalAlpha *= smooth((t - 4.05) / .2) * (1 - smooth((t - 5.3) / .25));
    pointer(ctx, 760 + (912 - 760) * save, 560 + (664 - 560) * save, pressed ? 22 : 24);
    ctx.restore();
  }
}

/** The New roll shot: the editor beside its chapter text, over the dimmed room. */
function drawNewRoll(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, moment: { start: number; end: number }, timeline: ShowreelTimeline, titles: boolean) {
  const t = time - moment.start, u = height / 720;
  const enter = smooth(t / .55), exit = smooth((t - 5.45) / .65);
  ctx.save();
  // The room dims behind the dialog, as it does in the app, and returns as it closes.
  ctx.fillStyle = `rgba(8,11,12,${(.78 * Math.min(smooth(t / .4), 1 - smooth((t - 5.6) / .9))).toFixed(3)})`;
  ctx.fillRect(0, 0, width, height);
  const scale = 800 * u / EDITOR_SIZE.width, left = width - 860 * u, top = 80 * u;
  if (enter * (1 - exit) > 0) {
    // Drawn whole into its own layer, so it fades as one sheet rather than showing its parts through each other.
    const layer = editorLayer(Math.ceil(EDITOR_SIZE.width * scale), Math.ceil(EDITOR_SIZE.height * scale));
    const lctx = layer.getContext('2d')!;
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.scale(scale, scale); drawEditor(lctx, t, timeline);
    ctx.save(); ctx.globalAlpha = enter * (1 - exit);
    const grow = (.965 + .035 * enter - .05 * exit) * (1 + .012 * t / 6.8);
    const cx = left + 400 * u, cy = top + 280 * u + (1 - outCubic(t / .7)) * 26 * u;
    ctx.translate(cx, cy); ctx.scale(grow, grow); ctx.translate(-layer.width / 2, -layer.height / 2);
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 50 * u; ctx.shadowOffsetY = 22 * u;
    ctx.drawImage(layer, 0, 0);
    ctx.shadowColor = 'transparent';
    ctx.scale(scale, scale); drawPointer(ctx, t, timeline);
    ctx.restore();
  }
  if (titles) {
    const alpha = shown(time, moment.start + .3, moment.end - .7, .5, .45);
    const x = 70 * u, p = (t - .3) / .9;
    ctx.globalAlpha = alpha; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = AMBER; ctx.fillRect(x, 246 * u, 34 * u * outCubic(p), Math.max(1, 1.5 * u));
    fit(ctx, '600', 13 * u, SANS, 300 * u, 3.6 * u); rise(ctx, '02  ·  YOUR PHOTOGRAPHS', x + 46 * u, 251 * u, p, u);
    ctx.fillStyle = CREAM; fit(ctx, '400', 46 * u, SERIF, 320 * u);
    rise(ctx, 'Bring your own', x, 312 * u, p - .1, u); rise(ctx, 'photographs.', x, 364 * u, p - .16, u);
    ctx.fillStyle = MUTED; fit(ctx, '400', 19 * u, SANS, 320 * u);
    rise(ctx, 'Drop in your scans, name the roll', x, 406 * u, p - .24, u); rise(ctx, 'and choose a film stock.', x, 432 * u, p - .28, u);
    // The promise that matters most: nothing leaves the device.
    const q = (t - 2.6) / .8;
    if (q > 0) {
      ctx.save(); ctx.globalAlpha *= smooth(q * 1.4); ctx.translate(0, (1 - outCubic(q)) * 14 * u);
      box(ctx, x, 470 * u, 300 * u, 98 * u, 10 * u, 'rgba(233,184,103,.13)', 'rgba(233,184,103,.8)', Math.max(1, 1.2 * u));
      lock(ctx, x + 18 * u, 488 * u, 20 * u, AMBER);
      text(ctx, 'Completely local.', x + 50 * u, 504 * u, CREAM, '600', 18 * u);
      text(ctx, 'Everything runs in your browser.', x + 50 * u, 530 * u, MUTED, '400', 14.5 * u);
      text(ctx, 'Your photos are never uploaded.', x + 50 * u, 551 * u, MUTED, '400', 14.5 * u);
      ctx.restore();
    }
  }
  ctx.restore();
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
    // The editor is part of the picture; only its chapter text follows the titles setting.
    else if (moment.kind === 'new-roll') drawNewRoll(ctx, width, height, time, moment, timeline, look.titles);
    else if (!look.titles) continue;
    else if (moment.kind === 'hook') drawHook(ctx, width, height, time, moment);
    else drawTitle(ctx, width, height, time, moment);
  }
  timeline.flashes.forEach((peak, index) => drawFlash(ctx, width, height, time, peak, index, look.leaks));
  drawGrain(ctx, width, height, time, look.grain);
  ctx.restore();
}
