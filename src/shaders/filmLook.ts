import * as THREE from 'three';
import { clampFilmStrength, FILM_LOOKS, type FilmLook } from '../data/filmLooks.ts';
import type { FilmStockId } from '../data/filmStocks.ts';

export function filmLookUniforms() {
  return {
    uFilmStrength: { value: 0 },
    uFilmTone: { value: new THREE.Vector4(1, 1, 0, 0) },
    uFilmColor: { value: new THREE.Vector3() },
    uFilmGrain: { value: new THREE.Vector2(0, 50) },
    uFilmSizeMm: { value: new THREE.Vector2(36, 24) },
    uFilmSeed: { value: 0 },
  };
}

export function updateFilmLook(material: THREE.ShaderMaterial, stock: FilmStockId, strength: number, widthMm = 36, heightMm = 24, seed = 0) {
  const look = FILM_LOOKS[stock];
  const u = material.uniforms;
  u.uFilmStrength.value = clampFilmStrength(strength) / 50;
  u.uFilmTone.value.set(look.contrast, look.saturation, look.shadows, look.highlights);
  u.uFilmColor.value.fromArray(look.color);
  u.uFilmGrain.value.set(look.grain, look.grainPerMm);
  u.uFilmSizeMm.value.set(widthMm, heightMm);
  u.uFilmSeed.value = seed;
}

export const FILM_LOOK_GLSL = `
  uniform float uFilmStrength;
  uniform vec4 uFilmTone;
  uniform vec3 uFilmColor;
  uniform vec2 uFilmGrain;
  uniform vec2 uFilmSizeMm;
  uniform float uFilmSeed;

  vec3 filmToPerceptual(vec3 c) {
    return mix(12.92 * c, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - .055, step(vec3(.0031308), c));
  }
  vec3 filmToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(vec3(.04045), c));
  }
  float filmHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031 + uFilmSeed * .001);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float filmNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(filmHash(i), filmHash(i + vec2(1,0)), f.x),
      mix(filmHash(i + vec2(0,1)), filmHash(i + vec2(1,1)), f.x), f.y) * 2.0 - 1.0;
  }
  vec3 applyFilmLook(vec3 source, vec2 filmUV) {
    // Exact bypass preserves the pre-M19 transmission pipeline.
    if (uFilmStrength <= 0.0) return source;
    float amount = uFilmStrength;
    vec3 c = filmToPerceptual(clamp(source, 0.0, 1.0));
    float contrast = 1.0 + (uFilmTone.x - 1.0) * amount;
    vec3 a = pow(c, vec3(contrast));
    vec3 b = pow(1.0 - c, vec3(contrast));
    c = a / max(a + b, vec3(.00001));
    c += amount * (uFilmTone.z * pow(1.0 - c, vec3(3.0))
      + uFilmTone.w * c * c * (1.0 - c));
    float luma = dot(c, vec3(.2126, .7152, .0722));
    // Hue-dependent response leaves neutral grays neutral.
    vec3 chroma = c - vec3(luma);
    float colorful = smoothstep(.015, .18, max(c.r, max(c.g,c.b)) - min(c.r,min(c.g,c.b)));
    // Reduce saturation changes near the orange/skin region without face detection.
    float skin = smoothstep(0.0, .08, c.r-c.g) * smoothstep(0.0, .08, c.g-c.b);
    float saturation = 1.0 + (uFilmTone.y - 1.0) * amount * (1.0 - .35 * skin);
    c = vec3(luma) + chroma * saturation + uFilmColor * colorful * amount;
    vec2 p = filmUV * uFilmSizeMm * uFilmGrain.y;
    // Fade frequencies below the pixel footprint to prevent shimmering in Overview.
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    float resolved = 1.0 - smoothstep(.8, 2.8, footprint);
    float grain = filmNoise(p) * resolved * uFilmGrain.x * pow(amount, .8);
    c += grain * (.30 + .70 * sin(clamp(luma, 0.0, 1.0) * 3.14159265));
    return filmToLinear(clamp(c, 0.0, 1.0));
  }
`;

// CPU counterparts for optical integration checks and CLI tooling.
// Exactly mirrors the perceptual tone/color/grain math in FILM_LOOK_GLSL.

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

export function filmHash(px: number, py: number, seed: number): number {
  let p3x = ((px * 0.1031 + seed * 0.001) % 1.0 + 1.0) % 1.0;
  let p3y = ((py * 0.1031 + seed * 0.001) % 1.0 + 1.0) % 1.0;
  let p3z = ((px * 0.1031 + seed * 0.001) % 1.0 + 1.0) % 1.0;

  const dotVal = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += dotVal;
  p3y += dotVal;
  p3z += dotVal;

  return (((p3x + p3y) * p3z) % 1.0 + 1.0) % 1.0;
}

export function filmNoise(px: number, py: number, seed: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const sx = fx * fx * (3.0 - 2.0 * fx);
  const sy = fy * fy * (3.0 - 2.0 * fy);

  const h00 = filmHash(ix, iy, seed);
  const h10 = filmHash(ix + 1, iy, seed);
  const h01 = filmHash(ix, iy + 1, seed);
  const h11 = filmHash(ix + 1, iy + 1, seed);

  const m0 = h00 + (h10 - h00) * sx;
  const m1 = h01 + (h11 - h01) * sx;
  return (m0 + (m1 - m0) * sy) * 2.0 - 1.0;
}

export function applyFilmLookPerceptualPixel(
  r: number,
  g: number,
  b: number,
  u: number,
  v: number,
  look: FilmLook,
  strength = 50,
  widthMm = 36,
  heightMm = 24,
  seed = 0,
  resolvedGrain = 1.0
): [number, number, number] {
  const amount = clampFilmStrength(strength) / 50;
  if (amount <= 0) return [r, g, b];

  const contrast = 1.0 + (look.contrast - 1.0) * amount;

  // 1. Contrast S-curve
  const a_r = Math.pow(Math.max(r, 0), contrast);
  const b_r = Math.pow(Math.max(1.0 - r, 0), contrast);
  r = a_r / Math.max(a_r + b_r, 0.00001);

  const a_g = Math.pow(Math.max(g, 0), contrast);
  const b_g = Math.pow(Math.max(1.0 - g, 0), contrast);
  g = a_g / Math.max(a_g + b_g, 0.00001);

  const a_b = Math.pow(Math.max(b, 0), contrast);
  const b_b = Math.pow(Math.max(1.0 - b, 0), contrast);
  b = a_b / Math.max(a_b + b_b, 0.00001);

  // 2. Shadows and highlights shaping
  r += amount * (look.shadows * Math.pow(1.0 - r, 3.0) + look.highlights * r * r * (1.0 - r));
  g += amount * (look.shadows * Math.pow(1.0 - g, 3.0) + look.highlights * g * g * (1.0 - g));
  b += amount * (look.shadows * Math.pow(1.0 - b, 3.0) + look.highlights * b * b * (1.0 - b));

  // 3. Luminance & Chroma
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const chroma_r = r - luma;
  const chroma_g = g - luma;
  const chroma_b = b - luma;

  // 4. Colorfulness & skin preservation
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const colorful = smoothstep(0.015, 0.18, maxC - minC);
  const skin = smoothstep(0.0, 0.08, r - g) * smoothstep(0.0, 0.08, g - b);
  const saturation = 1.0 + (look.saturation - 1.0) * amount * (1.0 - 0.35 * skin);

  // 5. Film color tint
  r = luma + chroma_r * saturation + look.color[0] * colorful * amount;
  g = luma + chroma_g * saturation + look.color[1] * colorful * amount;
  b = luma + chroma_b * saturation + look.color[2] * colorful * amount;

  // 6. Surface grain
  const px = u * widthMm * look.grainPerMm;
  const py = v * heightMm * look.grainPerMm;
  const noise = filmNoise(px, py, seed);
  const grainAmp = look.grain * Math.pow(amount, 0.8) * resolvedGrain;
  const grainWeight = 0.30 + 0.70 * Math.sin(Math.max(0.0, Math.min(1.0, luma)) * Math.PI);
  const grain = noise * grainAmp * grainWeight;

  r += grain;
  g += grain;
  b += grain;

  return [
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, b))
  ];
}

export function applyFilmLookToBuffer(
  imageData: { data: Uint8ClampedArray | Uint8Array },
  width: number,
  height: number,
  look: FilmLook,
  strength = 50,
  seed = 0,
  widthMm = 36,
  heightMm = 24
) {
  const data = imageData.data;
  const amount = clampFilmStrength(strength) / 50;
  if (amount <= 0) return;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const u = x / width;
      const [r, g, b] = applyFilmLookPerceptualPixel(
        data[idx] / 255.0,
        data[idx + 1] / 255.0,
        data[idx + 2] / 255.0,
        u,
        v,
        look,
        strength,
        widthMm,
        heightMm,
        seed
      );
      data[idx] = Math.max(0, Math.min(255, Math.round(r * 255.0)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * 255.0)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * 255.0)));
    }
  }
}


/**
 * Interactive editor preview. Produces the same values as
 * applyFilmLookPerceptualPixel, but caches the position-only grain field and
 * builds a per-strength tone table so slider changes re-render quickly.
 */
export function createFilmLookPreview(
  source: { data: Uint8ClampedArray | Uint8Array },
  width: number,
  height: number,
  look: FilmLook,
  widthMm = 36,
  heightMm = 24,
  seed = 0,
) {
  const base = source.data, noise = new Float32Array(width * height);
  // Mirrors the shader's footprint fade for grain finer than a preview pixel.
  const footprint = Math.max(widthMm * look.grainPerMm / width, heightMm * look.grainPerMm / height);
  const resolved = 1.0 - smoothstep(0.8, 2.8, footprint);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    noise[y * width + x] = filmNoise(x / width * widthMm * look.grainPerMm, y / height * heightMm * look.grainPerMm, seed);
  const tone = new Float64Array(256);
  return (strength: number, target: Uint8ClampedArray) => {
    const amount = clampFilmStrength(strength) / 50;
    if (amount <= 0) { target.set(base); return; }
    const contrast = 1.0 + (look.contrast - 1.0) * amount;
    for (let i = 0; i < 256; i++) {
      const c = i / 255.0, a = Math.pow(c, contrast), b = Math.pow(Math.max(1.0 - c, 0), contrast);
      const s = a / Math.max(a + b, 0.00001);
      tone[i] = s + amount * (look.shadows * Math.pow(1.0 - s, 3.0) + look.highlights * s * s * (1.0 - s));
    }
    const grainAmp = look.grain * Math.pow(amount, 0.8) * resolved;
    const [tr, tg, tb] = look.color;
    for (let p = 0, i = 0; p < noise.length; p++, i += 4) {
      const r = tone[base[i]], g = tone[base[i + 1]], b = tone[base[i + 2]];
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const colorful = smoothstep(0.015, 0.18, Math.max(r, g, b) - Math.min(r, g, b));
      const skin = smoothstep(0.0, 0.08, r - g) * smoothstep(0.0, 0.08, g - b);
      const saturation = 1.0 + (look.saturation - 1.0) * amount * (1.0 - 0.35 * skin);
      const tint = colorful * amount;
      const grain = noise[p] * grainAmp * (0.30 + 0.70 * Math.sin(Math.max(0.0, Math.min(1.0, luma)) * Math.PI));
      target[i] = Math.round(Math.max(0, Math.min(1, luma + (r - luma) * saturation + tr * tint + grain)) * 255.0);
      target[i + 1] = Math.round(Math.max(0, Math.min(1, luma + (g - luma) * saturation + tg * tint + grain)) * 255.0);
      target[i + 2] = Math.round(Math.max(0, Math.min(1, luma + (b - luma) * saturation + tb * tint + grain)) * 255.0);
      target[i + 3] = base[i + 3];
    }
  };
}
