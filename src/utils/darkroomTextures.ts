import * as THREE from "three";

// Procedural surface detail for the wet side of the darkroom. Everything is
// painted once into small canvases; no authoring assets are required.

export function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
// Painted canvases are deterministic, so each is painted once per page and
// shared by every texture (and remount) that asks for the same pattern.
const painted = new Map<string, HTMLCanvasElement>();
function canvasTexture(w: number, h: number, paint: Paint, { repeat = [1, 1] as [number, number], color = true, key = "" } = {}) {
  let canvas = key ? painted.get(key) : undefined;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    paint(canvas.getContext("2d", { willReadFrequently: true })!, w, h);
    if (key) painted.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

/** Per-pixel grey noise, far cheaper than thousands of canvas calls: `shade` returns a target grey and its opacity. */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, shade: (x: number, y: number) => [number, number] | null) {
  const image = ctx.getImageData(0, 0, w, h), data = image.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sample = shade(x, y); if (!sample) continue;
    const [v, a] = sample, i = (y * w + x) * 4;
    data[i] += (v - data[i]) * a; data[i + 1] += (v - data[i + 1]) * a; data[i + 2] += (v - data[i + 2]) * a;
  }
  ctx.putImageData(image, 0, 0);
}

/** A deterministic hash of an integer cell, in [0, 1). */
function cellHash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

/** Glazed 10 cm splashback tiles; one canvas holds 4 × 4 tiles (40 cm). */
export function tileTexture(repeat: [number, number]) {
  return canvasTexture(512, 512, (ctx, w) => {
    const random = seeded(11), size = w / 4;
    ctx.fillStyle = "#8a867c"; ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const shade = 214 + Math.round((random() - .5) * 12), x = i * size + 3, y = j * size + 3, s = size - 6;
      const glaze = ctx.createRadialGradient(x + s * .45, y + s * .4, s * .1, x + s / 2, y + s / 2, s * .75);
      glaze.addColorStop(0, `rgb(${shade + 6},${shade + 4},${shade - 2})`);
      glaze.addColorStop(1, `rgb(${shade - 14},${shade - 15},${shade - 20})`);
      ctx.fillStyle = glaze; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
    }
  }, { repeat, key: "tile" });
}

/** Near-white mottling; the material colour sets the paint hue. */
export function plasterTexture(repeat: [number, number]) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const random = seeded(23);
    ctx.fillStyle = "#e8e8e8"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = random() * w, y = random() * h, r = 30 + random() * 90, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const v = random() > .5 ? 255 : 200;
      g.addColorStop(0, `rgba(${v},${v},${v},.18)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(ctx, w, h, () => random() < .07 ? [160 + random() * 95, .35] : null);
  }, { repeat, key: "plaster" });
}

/** Wood grain running along the canvas width (rotate the texture for vertical boards). */
export function woodTexture(base: string, seed: number, vertical = false) {
  // 512 × 128 keeps grain legible at room distance at a quarter of the raster cost.
  return canvasTexture(vertical ? 128 : 512, vertical ? 512 : 128, (ctx, w, h) => {
    const random = seeded(seed), long = vertical ? h : w, across = vertical ? w : h;
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    if (vertical) { ctx.translate(w, 0); ctx.rotate(Math.PI / 2); }
    for (let i = 0; i < 8; i++) {
      const y = random() * across, band = 5 + random() * 20;
      ctx.fillStyle = random() > .5 ? "rgba(30,16,6,.07)" : "rgba(255,225,180,.05)"; ctx.fillRect(0, y, long, band);
    }
    for (let i = 0; i < 160; i++) {
      const y0 = random() * across, amplitude = .5 + random() * 1.5, frequency = 1 + random() * 2, phase = random() * 6;
      const dark = random() > .3;
      ctx.strokeStyle = dark ? `rgba(40,22,10,${.04 + random() * .1})` : `rgba(255,220,170,${.03 + random() * .06})`;
      ctx.lineWidth = .4 + random() * .9;
      ctx.beginPath();
      for (let x = 0; x <= long; x += 8) {
        const y = y0 + Math.sin(x / long * Math.PI * frequency + phase) * amplitude + Math.sin(x / 18 + i) * .4;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, { key: `wood:${base}:${seed}:${vertical}` });
}

export function labelTexture(lines: string[], { paper = "#efe6cf", ink = "#2a2520", accent = "#8c2a1c" } = {}) {
  return canvasTexture(256, 192, (ctx, w, h) => {
    ctx.fillStyle = paper; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent; ctx.fillRect(0, 16, w, 14); ctx.fillRect(0, h - 26, w, 8);
    ctx.fillStyle = ink; ctx.textAlign = "center";
    lines.forEach((line, i) => {
      ctx.font = i === 0 ? "bold 34px Helvetica, Arial, sans-serif" : "22px Helvetica, Arial, sans-serif";
      ctx.fillText(line, w / 2, 76 + i * 38, w - 24);
    });
  });
}

/** GraLab-style 60-second dial with luminous markings. */
export function timerDialTexture() {
  return canvasTexture(256, 256, ctx => {
    ctx.fillStyle = "#121414"; ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    ctx.strokeStyle = "#d9ead2"; ctx.fillStyle = "#d9ead2";
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, long = i % 5 === 0;
      ctx.lineWidth = long ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(Math.sin(a) * (long ? 92 : 100), -Math.cos(a) * (long ? 92 : 100)); ctx.lineTo(Math.sin(a) * 110, -Math.cos(a) * 110); ctx.stroke();
      if (long) { ctx.font = "bold 20px Helvetica, Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i), Math.sin(a) * 72, -Math.cos(a) * 72); }
    }
    const hand = (a: number, length: number, width: number, color: string) => {
      ctx.save(); ctx.rotate(a); ctx.fillStyle = color; ctx.fillRect(-width / 2, -length, width, length + 14); ctx.restore();
    };
    hand(1.9, 98, 6, "#cfe8c4"); hand(4.1, 70, 8, "#e8573f");
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = "#3a3f40"; ctx.fill();
  }, { key: "timer-dial" });
}

/** A developed 35 mm strip with perforations cut out of the alpha channel. */
export function negativeStripTexture(seed: number, colour: boolean) {
  return canvasTexture(64, 1600, (ctx, w, h) => {
    const random = seeded(seed);
    ctx.fillStyle = colour ? "#c0692f" : "#b9bcb5"; ctx.fillRect(0, 0, w, h);
    const frame = 66, gap = 4;
    for (let y = 8; y + frame < h; y += frame + gap) {
      ctx.save(); ctx.beginPath(); ctx.rect(10, y, w - 20, frame); ctx.clip();
      ctx.fillStyle = colour ? "#8a4420" : "#6d706c"; ctx.fillRect(10, y, w - 20, frame);
      for (let i = 0; i < 5; i++) {
        const x = 10 + random() * (w - 20), cy = y + random() * frame, r = 10 + random() * 30, g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
        const tone = colour ? (random() > .5 ? "58,34,20" : "40,46,48") : "30,31,30";
        g.addColorStop(0, `rgba(${tone},${.4 + random() * .5})`); g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - r, cy - r, r * 2, r * 2);
      }
      if (random() > .4) { ctx.fillStyle = colour ? "rgba(60,30,14,.55)" : "rgba(28,28,28,.6)"; ctx.fillRect(10, y, w - 20, frame * (.25 + random() * .3)); }
      ctx.restore();
    }
    ctx.fillStyle = colour ? "rgba(255,190,90,.55)" : "rgba(40,40,40,.5)";
    for (let y = 30; y < h; y += 140) ctx.fillRect(2, y, 3, 18);
    for (let y = 2; y < h; y += 8.4) { ctx.clearRect(2, y, 5, 4.5); ctx.clearRect(w - 7, y, 5, 4.5); }
  });
}

/** An 8 × 10 print part-way through development. */
export function printTexture(seed: number, strength: number) {
  return canvasTexture(256, 205, (ctx, w, h) => {
    const random = seeded(seed);
    ctx.fillStyle = "#f2efe6"; ctx.fillRect(0, 0, w, h);
    const x0 = 16, y0 = 16, iw = w - 32, ih = h - 32;
    const sky = ctx.createLinearGradient(0, y0, 0, y0 + ih);
    sky.addColorStop(0, `rgba(30,30,30,${.25 * strength})`); sky.addColorStop(1, `rgba(30,30,30,${.55 * strength})`);
    ctx.fillStyle = sky; ctx.fillRect(x0, y0, iw, ih);
    ctx.fillStyle = `rgba(15,15,15,${.75 * strength})`; ctx.beginPath(); ctx.moveTo(x0, y0 + ih);
    for (let x = 0; x <= iw; x += 8) ctx.lineTo(x0 + x, y0 + ih * (.55 + Math.sin(x / 30 + seed) * .06 + random() * .03));
    ctx.lineTo(x0 + iw, y0 + ih); ctx.fill();
  });
}

/** Perforated rubber anti-fatigue mat; holes are transparent. */
export function matTexture(repeat: [number, number]) {
  return canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = "#1c1d1d"; ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.beginPath();
      ctx.arc(i * 64 + 32, j * 64 + 32, 17, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(i * 64 + 32, j * 64 + 32, 20, 0, Math.PI * 2); ctx.stroke();
    }
  }, { repeat, key: "mat" });
}

export function signTexture() {
  return canvasTexture(512, 144, (ctx, w, h) => {
    ctx.fillStyle = "#1a0605"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ff3b24"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 46px Helvetica, Arial, sans-serif"; ctx.fillText("DARKROOM", w / 2, 50);
    ctx.font = "bold 34px Helvetica, Arial, sans-serif"; ctx.fillText("IN USE — DO NOT ENTER", w / 2, 104, w - 30);
  }, { key: "sign" });
}

/** Pressed cork granules for the pin board. */
export function corkTexture(repeat: [number, number]) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#9c7448"; ctx.fillRect(0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h), data = image.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // Granules about 3 px across, each a dark or light fleck of cork.
      const g = cellHash(Math.floor((x + (y % 7)) / 3), Math.floor((y + (x % 5)) / 3), 41), i = (y * w + x) * 4;
      const [r, gr, b, a] = g > .55 ? [70, 42, 20, .2 + (g - .55) * .8] : [214, 170, 118, .15 + g * .5];
      data[i] += (r - data[i]) * a; data[i + 1] += (gr - data[i + 1]) * a; data[i + 2] += (b - data[i + 2]) * a;
    }
    ctx.putImageData(image, 0, 0);
  }, { repeat, key: "cork" });
}

/** A contact sheet: six strips of six frames printed through the negative sleeve. */
export function contactSheetTexture(seed: number) {
  return canvasTexture(320, 256, (ctx, w, h) => {
    const random = seeded(seed);
    ctx.fillStyle = "#f1eee6"; ctx.fillRect(0, 0, w, h);
    const rows = 6, columns = 6, top = 14, left = 12, stripH = (h - 2 * top) / rows, frameW = (w - 2 * left) / columns;
    for (let r = 0; r < rows; r++) {
      const y = top + r * stripH;
      ctx.fillStyle = "#1b1b1b"; ctx.fillRect(left - 4, y + 2, w - 2 * left + 8, stripH - 4);
      for (let c = 0; c < columns; c++) {
        const x = left + c * frameW + 2, fy = y + 7, fw = frameW - 4, fh = stripH - 14;
        const g = ctx.createLinearGradient(0, fy, 0, fy + fh), sky = 120 + random() * 110, ground = 30 + random() * 60;
        g.addColorStop(0, `rgb(${sky},${sky},${sky})`); g.addColorStop(1, `rgb(${ground},${ground},${ground})`);
        ctx.fillStyle = g; ctx.fillRect(x, fy, fw, fh);
        ctx.fillStyle = `rgba(10,10,10,${.3 + random() * .5})`;
        ctx.beginPath(); ctx.moveTo(x, fy + fh);
        for (let i = 0; i <= 6; i++) ctx.lineTo(x + fw * i / 6, fy + fh * (.45 + random() * .3));
        ctx.lineTo(x + fw, fy + fh); ctx.fill();
      }
      ctx.fillStyle = "rgba(230,200,120,.6)";
      for (let x = left; x < w - left; x += 9) { ctx.fillRect(x, y + 3, 4, 2); ctx.fillRect(x, y + stripH - 5, 4, 2); }
    }
  });
}

/** A test strip: one image exposed in bands of increasing time. */
export function testStripTexture(seed: number, steps = 5) {
  return canvasTexture(96, 384, (ctx, w, h) => {
    const random = seeded(seed);
    ctx.fillStyle = "#f2efe6"; ctx.fillRect(0, 0, w, h);
    const band = h / steps;
    for (let i = 0; i < steps; i++) {
      const y = i * band, exposure = .18 + i * (.7 / steps);
      ctx.fillStyle = `rgba(18,18,18,${exposure})`; ctx.fillRect(0, y, w, band);
      ctx.fillStyle = `rgba(8,8,8,${Math.min(.95, exposure + .25)})`;
      ctx.beginPath(); ctx.moveTo(0, y + band);
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y + band * (.5 + Math.sin(x / 17 + seed) * .12 + random() * .05));
      ctx.lineTo(w, y + band); ctx.fill();
      ctx.fillStyle = exposure > .5 ? "#d9d4c8" : "#1d1d1d"; ctx.font = "bold 20px Helvetica, Arial, sans-serif";
      ctx.fillText(`${(i + 1) * 4}s`, 8, y + 26);
    }
  });
}

/** A red seven-segment style readout; used as an emissive map. */
export function ledTexture(text: string) {
  return canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = "#050202"; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 64px 'Courier New', monospace";
    ctx.fillStyle = "#2a0703"; ctx.fillText("88.8", w / 2, h / 2 + 4);
    ctx.fillStyle = "#ff3a1c"; ctx.shadowColor = "#ff3a1c"; ctx.shadowBlur = 10; ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

/** Printed grid and ruler on a paper trimmer's cutting board. */
export function trimmerTexture() {
  return canvasTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = "#e3e0d6"; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { ctx.fillStyle = x % 80 ? "rgba(40,60,90,.18)" : "rgba(40,60,90,.4)"; ctx.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 16) { ctx.fillStyle = y % 80 ? "rgba(40,60,90,.18)" : "rgba(40,60,90,.4)"; ctx.fillRect(0, y, w, 1); }
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(0, h - 34, w, 34);
    ctx.fillStyle = "#e3e0d6"; ctx.font = "13px Helvetica, Arial, sans-serif";
    for (let x = 0, n = 0; x < w; x += 16, n++) { ctx.fillRect(x, h - 34, 1, n % 5 ? 6 : 12); if (n % 5 === 0) ctx.fillText(String(n), x + 3, h - 10); }
  }, { key: "trimmer" });
}

/** Suspended ceiling: 60 cm fissured mineral tiles in a light T-bar grid; one canvas is one tile. */
export function ceilingTileTexture(repeat: [number, number]) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const random = seeded(61);
    ctx.fillStyle = "#e4e2dc"; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, (x, y) => cellHash(x >> 1, y, 61) < .09 ? [150 + random() * 70, .3 + random() * .4] : null);
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(0,0,0,.08)"); shade.addColorStop(.1, "rgba(0,0,0,0)"); shade.addColorStop(.9, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,.08)");
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b9bab6"; ctx.fillRect(0, 0, w, 5); ctx.fillRect(0, 0, 5, h);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(0, 5, w, 1); ctx.fillRect(5, 0, 1, h);
  }, { repeat, key: "ceiling" });
}

/** Charcoal vinyl floor tiles, 50 cm, with fine chips and slightly varied shades; one canvas holds 2 × 2 tiles. */
export function floorTileTexture(repeat: [number, number]) {
  return canvasTexture(512, 512, (ctx, w) => {
    const random = seeded(73), size = w / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const base = 92 + Math.round((random() - .5) * 10);
      ctx.fillStyle = `rgb(${base},${base},${base - 2})`; ctx.fillRect(i * size, j * size, size, size);
    }
    speckle(ctx, w, w, (x, y) => {
      const chip = cellHash(x >> 1, y >> 1, 73);
      if (chip > .07) return null;
      return chip < .028 ? [150 + random() * 60, .25 + random() * .35] : [40 + random() * 30, .25 + random() * .35];
    });
    for (let i = 0; i < 30; i++) {
      const x = random() * w, y = random() * w, r = 40 + random() * 120, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${random() > .5 ? "255,255,255" : "0,0,0"},.05)`); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.fillStyle = "rgba(20,20,20,.65)";
    for (const p of [0, size]) { ctx.fillRect(p, 0, 2, w); ctx.fillRect(0, p, w, 2); }
  }, { repeat, key: "floor" });
}

/** Linoleum desktop: fine mottling with no pattern to read at a distance. */
export function linoleumTexture(repeat: [number, number]) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const random = seeded(83);
    ctx.fillStyle = "#e0e0e0"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = random() * w, y = random() * h, r = 20 + random() * 80, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const v = random() > .5 ? 255 : 170;
      g.addColorStop(0, `rgba(${v},${v},${v},.14)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(ctx, w, h, () => random() < .023 ? [180 + random() * 75, .3] : null);
  }, { repeat, key: "linoleum" });
}

/** Felt for display backs: soft fibre noise around white; the material colour sets the hue. */
export function feltTexture(repeat: [number, number]) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const random = seeded(97);
    ctx.fillStyle = "#d8d8d8"; ctx.fillRect(0, 0, w, h);
    // Short fibres: hashed runs of a few pixels in one of two directions.
    speckle(ctx, w, h, (x, y) => {
      const along = cellHash(x >> 2, y, 97) < .5 ? cellHash(x >> 2, y, 98) : cellHash(x, y >> 2, 99);
      return along < .3 ? [170 + random() * 85, .35] : null;
    });
  }, { repeat, key: "felt" });
}

/** Soft ambient-occlusion falloff for an alpha map: white at v = 0, black at v = 1. */
export function occlusionTexture() {
  return canvasTexture(4, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "#ffffff"); g.addColorStop(.3, "#6a6a6a"); g.addColorStop(.65, "#1c1c1c"); g.addColorStop(1, "#000000");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { color: false, key: "occlusion" });
}

/** A plain wall clock face; the hands are part of the dial. */
export function clockFaceTexture() {
  return canvasTexture(256, 256, ctx => {
    ctx.fillStyle = "#f1eee6"; ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    ctx.fillStyle = "#1d1d1d";
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, long = i % 5 === 0;
      ctx.save(); ctx.rotate(a); ctx.fillRect(long ? -3 : -1, -118, long ? 6 : 2, long ? 18 : 8); ctx.restore();
    }
    ctx.font = "bold 30px Helvetica, Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    [12, 3, 6, 9].forEach((n, i) => ctx.fillText(String(n), Math.sin(i * Math.PI / 2) * 78, -Math.cos(i * Math.PI / 2) * 78));
    const hand = (a: number, length: number, width: number, color: string) => {
      ctx.save(); ctx.rotate(a); ctx.fillStyle = color; ctx.fillRect(-width / 2, -length, width, length + 16); ctx.restore();
    };
    hand(-.95, 62, 8, "#1d1d1d"); hand(2.2, 96, 5, "#1d1d1d"); hand(4.4, 104, 2, "#b3261e");
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fillStyle = "#1d1d1d"; ctx.fill();
  }, { key: "clock" });
}

/** Spine labels for negative archive binders. */
export function binderSpineTexture(lines: string[], colour: string) {
  return canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = colour; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#efe9d8"; ctx.fillRect(8, 30, w - 16, 120);
    ctx.fillStyle = "#2a2520"; ctx.save(); ctx.translate(w / 2, 90); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    lines.forEach((line, i) => { ctx.font = `${i ? "" : "bold "}16px Helvetica, Arial, sans-serif`; ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * 20, 110); });
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w / 2, 205, 11, 0, Math.PI * 2); ctx.stroke();
  });
}
