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

    // Authentic C-41 tri-pack dye absorption model:
    // Red exposure forms cyan dye -> absorbs red
    // Green exposure forms magenta dye -> absorbs green
    // Blue exposure forms yellow dye -> absorbs blue
    vec3 linearExposure = pow(positiveRgb, vec3(0.95));

    // Dmax dye absorption subtracting light transmission through the orange mask
    vec3 dyeAbsorption = vec3(
      linearExposure.r * 0.88 + linearExposure.g * 0.08,
      linearExposure.g * 0.75 + linearExposure.b * 0.10,
      linearExposure.b * 0.55 + linearExposure.g * 0.15
    );

    // Deep shadow = zero dye formation = pure transmission through orange mask
    // Highlight = dense dye development = dark warm charcoal Dmax
    vec3 negRgb = clamp(uOrangeMask * (vec3(1.0) - dyeAbsorption * 0.94) + vec3(0.015, 0.008, 0.003), 0.0, 1.0);

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
