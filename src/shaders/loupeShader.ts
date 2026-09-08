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

    // Sample UV on source texture with subtle lens chromatic aberration near periphery
    vec2 baseUv = uCenterUv + (distP * 0.5) / uMagnification;
    vec2 chromOffset = (distP * 0.0025 * r * r);
    float rChannel = texture2D(uTexture, clamp(baseUv + chromOffset, vec2(0.001), vec2(0.999))).r;
    float gChannel = texture2D(uTexture, clamp(baseUv, vec2(0.001), vec2(0.999))).g;
    float bChannel = texture2D(uTexture, clamp(baseUv - chromOffset, vec2(0.001), vec2(0.999))).b;
    vec3 sampledColor = vec3(rChannel, gChannel, bChannel);

    vec3 positiveRgb = clamp(sampledColor * uExposure, 0.0, 1.0);

    // Authentic negative response matching film strip
    vec3 inv = clamp(vec3(1.0) - sampledColor, 0.0, 1.0);
    vec3 density = pow(inv, vec3(0.92));
    vec3 negRgb = clamp(density * uOrangeMask * 1.08 + vec3(0.025, 0.012, 0.004), 0.0, 1.0);

    vec3 imgColor = mix(negRgb, positiveRgb, clamp(uModeTransition, 0.0, 1.0));

    // Subtle edge vignette
    float vignette = smoothstep(1.0, 0.86, r);

    // Subtle lens reflection arc (multi-coated optical glass)
    vec2 refLight = normalize(vec2(-0.7, 0.7));
    float highlight = pow(max(0.0, dot(p, refLight)), 6.0) * 0.10 * smoothstep(0.4, 0.9, r);

    vec3 finalRgb = imgColor * vignette + vec3(0.025) * (1.0 - vignette) + vec3(highlight);

    gl_FragColor = vec4(finalRgb, 1.0);
  }
`;

export function createLoupeShaderMaterial(texture: THREE.Texture, isPositive: boolean, centerUv: [number, number]) {
  return new THREE.ShaderMaterial({
    vertexShader: LoupeVertexShader,
    fragmentShader: LoupeFragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uCenterUv: { value: new THREE.Vector2(centerUv[0], centerUv[1]) },
      uMagnification: { value: 2.5 },
      uModeTransition: { value: isPositive ? 1.0 : 0.0 },
      uOrangeMask: { value: FILM_ORANGE_MASK },
      uExposure: { value: FILM_EXPOSURE },
    },
  });
}
