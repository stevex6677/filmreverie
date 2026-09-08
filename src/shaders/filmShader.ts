import * as THREE from "three";

export const FilmVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const FILM_ORANGE_MASK = new THREE.Color(0.88, 0.46, 0.18);
export const FILM_EXPOSURE = 1.0;

export const FilmFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uModeTransition;
  uniform vec3 uOrangeMask;
  uniform float uExposure;
  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(uTexture, vUv);
    vec3 positiveRgb = clamp(tex.rgb * uExposure, 0.0, 1.0);

    // Inverted negative emulsion with authentic dye response and orange base mask
    vec3 inv = clamp(vec3(1.0) - tex.rgb, 0.0, 1.0);
    vec3 density = pow(inv, vec3(0.92));
    vec3 negRgb = clamp(density * uOrangeMask * 1.08 + vec3(0.025, 0.012, 0.004), 0.0, 1.0);

    // Mode mix: 0 = negative, 1 = positive
    vec3 finalRgb = mix(negRgb, positiveRgb, clamp(uModeTransition, 0.0, 1.0));

    gl_FragColor = vec4(finalRgb, 1.0);
  }
`;

export function createFilmShaderMaterial(texture: THREE.Texture, isPositive: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    fragmentShader: FilmFragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uModeTransition: { value: isPositive ? 1.0 : 0.0 },
      uOrangeMask: { value: FILM_ORANGE_MASK },
      uExposure: { value: FILM_EXPOSURE },
    },
  });
}
