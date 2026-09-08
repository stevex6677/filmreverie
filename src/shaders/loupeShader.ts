import * as THREE from "three";
import { FILM_EXPOSURE, FILM_ORANGE_MASK } from "./filmShader";

export const LoupeVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const LoupeFragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uCenterUv;
  uniform float uMagnification;
  uniform float uModeTransition;
  uniform float uActive;
  uniform vec3 uOrangeMask;
  uniform float uExposure;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);

    if (r > 1.0) {
      discard;
    }

    // Optical barrel distortion
    vec2 distP = p * (1.0 + 0.035 * r * r);

    // Subtle edge vignette
    float vignette = smoothstep(1.0, 0.86, r);

    // Subtle lens reflection arc (multi-coated optical glass)
    vec2 refLight = normalize(vec2(-0.7, 0.7));
    float highlight = pow(max(0.0, dot(p, refLight)), 6.0) * 0.10 * smoothstep(0.4, 0.9, r);

    // 1. Resting View: Clean illuminated light table surface transmitted through optical glass (no image)
    vec3 tableSurface = vec3(0.96, 0.97, 0.98);
    vec3 restingRgb = tableSurface * vignette + vec3(0.04) * (1.0 - vignette) + vec3(highlight * 1.5);

    // 2. Active View: Magnified photographic frame with authentic negative/positive response
    vec2 baseUv = uCenterUv + (distP * 0.5) / uMagnification;
    vec2 chromOffset = (distP * 0.0025 * r * r);
    float rChannel = texture2D(uTexture, clamp(baseUv + chromOffset, vec2(0.001), vec2(0.999))).r;
    float gChannel = texture2D(uTexture, clamp(baseUv, vec2(0.001), vec2(0.999))).g;
    float bChannel = texture2D(uTexture, clamp(baseUv - chromOffset, vec2(0.001), vec2(0.999))).b;
    vec3 sampledColor = vec3(rChannel, gChannel, bChannel);

    vec3 positiveRgb = clamp(sampledColor * uExposure, 0.0, 1.0);

    // Authentic C-41 tri-pack dye absorption matching film strip
    vec3 linearExposure = pow(positiveRgb, vec3(0.95));
    vec3 dyeAbsorption = vec3(
      linearExposure.r * 0.88 + linearExposure.g * 0.08,
      linearExposure.g * 0.75 + linearExposure.b * 0.10,
      linearExposure.b * 0.55 + linearExposure.g * 0.15
    );
    vec3 negRgb = clamp(uOrangeMask * (vec3(1.0) - dyeAbsorption * 0.96) + vec3(0.015, 0.008, 0.003), 0.0, 1.0);

    vec3 imgColor = mix(negRgb, positiveRgb, clamp(uModeTransition, 0.0, 1.0));
    vec3 activeRgb = imgColor * vignette + vec3(0.025) * (1.0 - vignette) + vec3(highlight);

    // Smooth optical transition between resting table and active inspection
    vec3 finalRgb = mix(restingRgb, activeRgb, clamp(uActive, 0.0, 1.0));

    gl_FragColor = vec4(finalRgb, 1.0);
  }
`;

export function createLoupeShaderMaterial(
  texture: THREE.Texture,
  isPositive: boolean,
  centerUv: [number, number],
  isActive: boolean = false,
  magnification: number = 2.5
) {
  return new THREE.ShaderMaterial({
    vertexShader: LoupeVertexShader,
    fragmentShader: LoupeFragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uCenterUv: { value: new THREE.Vector2(centerUv[0], centerUv[1]) },
      uMagnification: { value: magnification },
      uModeTransition: { value: isPositive ? 1.0 : 0.0 },
      uActive: { value: isActive ? 1.0 : 0.0 },
      uOrangeMask: { value: FILM_ORANGE_MASK },
      uExposure: { value: FILM_EXPOSURE },
    },
  });
}
