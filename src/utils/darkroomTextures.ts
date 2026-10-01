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
function canvasTexture(w: number, h: number, paint: Paint, { repeat = [1, 1] as [number, number], color = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  paint(canvas.getContext("2d")!, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
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
  }, { repeat });
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
    for (let i = 0; i < 9000; i++) {
      const v = 160 + random() * 95;
      ctx.fillStyle = `rgba(${v},${v},${v},.35)`; ctx.fillRect(random() * w, random() * h, 1 + random() * 1.5, 1 + random() * 1.5);
    }
  }, { repeat });
}

/** Wood grain running along the canvas width (rotate the texture for vertical boards). */
export function woodTexture(base: string, seed: number, vertical = false) {
  return canvasTexture(vertical ? 256 : 1024, vertical ? 1024 : 256, (ctx, w, h) => {
    const random = seeded(seed), long = vertical ? h : w, across = vertical ? w : h;
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    if (vertical) { ctx.translate(w, 0); ctx.rotate(Math.PI / 2); }
    for (let i = 0; i < 8; i++) {
      const y = random() * across, band = 10 + random() * 40;
      ctx.fillStyle = random() > .5 ? "rgba(30,16,6,.07)" : "rgba(255,225,180,.05)"; ctx.fillRect(0, y, long, band);
    }
    for (let i = 0; i < 320; i++) {
      const y0 = random() * across, amplitude = 1 + random() * 3, frequency = 1 + random() * 2, phase = random() * 6;
      const dark = random() > .3;
      ctx.strokeStyle = dark ? `rgba(40,22,10,${.03 + random() * .08})` : `rgba(255,220,170,${.02 + random() * .05})`;
      ctx.lineWidth = .5 + random() * 1.4;
      ctx.beginPath();
      for (let x = 0; x <= long; x += 8) {
        const y = y0 + Math.sin(x / long * Math.PI * frequency + phase) * amplitude + Math.sin(x / 37 + i) * .8;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
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
  });
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
  }, { repeat });
}

export function signTexture() {
  return canvasTexture(512, 144, (ctx, w, h) => {
    ctx.fillStyle = "#1a0605"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ff3b24"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 46px Helvetica, Arial, sans-serif"; ctx.fillText("DARKROOM", w / 2, 50);
    ctx.font = "bold 34px Helvetica, Arial, sans-serif"; ctx.fillText("IN USE — DO NOT ENTER", w / 2, 104, w - 30);
  });
}
