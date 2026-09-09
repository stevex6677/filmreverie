import * as THREE from "three";
import { DEFAULT_LAYOUT, getStripDimensions } from "../utils/loupeMapping";
import { DISPLAY_FRAGMENT, FILM_TRANSMISSION_GLSL, illuminationUniforms } from "./tableIllumination";

export const FilmVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const FILM_ORANGE_MASK = new THREE.Color(0.88, 0.46, 0.18);
// Source exposure stays fixed; the dimmer changes transmitted light only.
export const FILM_EXPOSURE = 1.0;

export const FilmFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uModeTransition;
  uniform vec3 uOrangeMask;
  uniform float uExposure;
  uniform float uTableOutput;
  uniform float uSurfaceReflection;
  varying vec2 vUv;
  ${FILM_TRANSMISSION_GLSL}
  void main() {
    vec3 source = texture2D(uTexture, vUv).rgb * uExposure;
    vec3 transmission = filmTransmittance(source, uModeTransition, uOrangeMask);
    gl_FragColor = vec4(transmitTableLight(transmission, uTableOutput, uSurfaceReflection), 1.0);
    ${DISPLAY_FRAGMENT}
  }
`;

export function createFilmShaderMaterial(texture: THREE.Texture, isPositive: boolean, brightness = 1, base = FILM_ORANGE_MASK) {
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    fragmentShader: FilmFragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uModeTransition: { value: isPositive ? 1.0 : 0.0 },
      uOrangeMask: { value: base.clone() },
      uExposure: { value: FILM_EXPOSURE },
      ...illuminationUniforms(brightness),
    },
  });
}

export function createRebateMaterial(texture: THREE.Texture, brightness = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    uniforms: { uTexture: { value: texture }, ...illuminationUniforms(brightness) },
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform float uTableOutput;
      uniform float uSurfaceReflection;
      varying vec2 vUv;
      void main() {
        vec4 rebate = texture2D(uTexture, vUv);
        if (rebate.a < 0.1) discard;
        // Artwork is a transmission map; alpha cuts photo gates, never adds white light.
        gl_FragColor = vec4(rebate.rgb * 0.5 * uTableOutput + vec3(uSurfaceReflection), 1.0);
        ${DISPLAY_FRAGMENT}
      }
    `,
  });
}

export function createPanelMaterial(brightness = 1, width = 3.4, height = 1.6) {
  const strip = getStripDimensions(DEFAULT_LAYOUT);
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    uniforms: { ...illuminationUniforms(brightness),
      uPanelSize: { value: new THREE.Vector2(width, height) },
      uStripSize: { value: new THREE.Vector2(strip.width, strip.height) },
    },
    fragmentShader: `
      uniform float uTableOutput;
      uniform vec2 uPanelSize;
      uniform vec2 uStripSize;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float frost = sin(vUv.x * 1800.0) * sin(vUv.y * 1200.0) * 0.002;
        float diffuser = 1.0 - 0.045 * dot(p, p) + frost;
        // Film contact shading is attenuation of the diffuser's linear light,
        // not a black transparency blended over an already tone-mapped panel.
        vec2 local = (vUv - 0.5) * uPanelSize;
        vec2 softEdge = abs(local + vec2(0.0, 0.002)) - (uStripSize + vec2(0.035, 0.024)) * 0.5;
        float softShadow = 1.0 - smoothstep(-0.006, 0.006, max(softEdge.x, softEdge.y));
        vec2 contactEdge = abs(local) - vec2(uStripSize.x + 0.01, uStripSize.y * 0.75) * 0.5;
        float contactShadow = 1.0 - smoothstep(-0.001, 0.001, max(contactEdge.x, contactEdge.y));
        float transmission = (1.0 - softShadow * 0.10) * (1.0 - contactShadow * 0.16);
        gl_FragColor = vec4(vec3(0.98, 0.99, 1.0) * uTableOutput * diffuser * transmission, 1.0);
        ${DISPLAY_FRAGMENT}
      }
    `,
  });
}

// Bounded light scattered onto the dark chassis lip. Compose it with the dark
// surface in linear light before display conversion, also in the loupe capture.
export function createPanelEdgeMaterial(width: number, height: number, brightness = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    uniforms: { ...illuminationUniforms(brightness), uPanelSize: { value: new THREE.Vector2(width, height) } },
    fragmentShader: `
      uniform float uTableOutput;
      uniform vec2 uPanelSize;
      varying vec2 vUv;
      void main() {
        vec2 p = abs((vUv - 0.5) * (uPanelSize + vec2(0.14))) - uPanelSize * 0.5;
        float edgeDistance = length(max(p, 0.0)) + min(max(p.x, p.y), 0.0);
        if (edgeDistance < 0.0) discard;
        float scatter = exp(-edgeDistance * 75.0) * 0.10 * pow(uTableOutput / 2.4, 2.0);
        gl_FragColor = vec4(vec3(0.002) * (1.0 - scatter) + vec3(uTableOutput) * scatter, 1.0);
        ${DISPLAY_FRAGMENT}
      }
    `,
  });
}
