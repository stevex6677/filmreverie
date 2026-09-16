import * as THREE from 'three';
import { clampFilmStrength, FILM_LOOKS } from '../data/filmLooks';
import type { FilmStockId } from '../data/filmStocks';

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
    float colorful = smoothstep(.025, .22, max(c.r, max(c.g,c.b)) - min(c.r,min(c.g,c.b)));
    // Reduce saturation changes near the orange/skin region without face detection.
    float skin = smoothstep(0.0, .08, c.r-c.g) * smoothstep(0.0, .08, c.g-c.b);
    float saturation = 1.0 + (uFilmTone.y - 1.0) * amount * (1.0 - .45 * skin);
    c = vec3(luma) + chroma * saturation + uFilmColor * chroma * colorful * amount;
    vec2 p = filmUV * uFilmSizeMm * uFilmGrain.y;
    // Fade frequencies below the pixel footprint to prevent shimmering in Overview.
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    float resolved = 1.0 - smoothstep(.45, 1.6, footprint);
    float grain = filmNoise(p) * resolved * uFilmGrain.x * pow(amount, .8);
    c += grain * (.30 + .70 * sin(clamp(luma, 0.0, 1.0) * 3.14159265));
    return filmToLinear(clamp(c, 0.0, 1.0));
  }
`;
