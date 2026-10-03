import { FilmStripLayout, getFrameBounds, getStripDimensions } from "../utils/loupeMapping";
import * as THREE from "three";
import { FILM_LOOK_GLSL, filmLookUniforms } from "./filmLook";
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

// Screening's spatial develop band. uReveal = (edge, softness, mode, glow) in
// strip-local layout units; mode 0 is off, 1 turns negative to positive and 2
// brings up the backlight behind reversal film. uRevealSpan maps UV to strip x.
export const REVEAL_GLSL = `
  uniform vec4 uReveal;
  uniform vec2 uRevealSpan;
  float revealMask() {
    float x = uRevealSpan.x + vUv.x * uRevealSpan.y;
    return 1.0 - smoothstep(uReveal.x - uReveal.y, uReveal.x + uReveal.y, x);
  }
  float revealMode(float mode) { return uReveal.z > 0.5 && uReveal.z < 1.5 ? revealMask() : mode; }
  float revealLight() {
    if (uReveal.z < 0.5) return 1.0;
    float x = uRevealSpan.x + vUv.x * uRevealSpan.y;
    float band = uReveal.w * exp(-pow((x - uReveal.x) / max(uReveal.y * 2.5, 1e-5), 2.0));
    return (uReveal.z > 1.5 ? mix(0.035, 1.0, revealMask()) : 1.0) + band;
  }
`;
export function revealUniforms(x0 = 0, width = 1) {
  return { uReveal: { value: new THREE.Vector4() }, uRevealSpan: { value: new THREE.Vector2(x0, width) } };
}

export const FilmFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uModeTransition;
  uniform vec3 uOrangeMask;
  uniform float uExposure;
  uniform float uTableOutput;
  uniform float uSurfaceReflection;
  uniform vec2 uPhotoCrop;
  uniform vec2 uPhotoOffset;
  uniform float uPhotoRotation;
  varying vec2 vUv;
  ${FILM_TRANSMISSION_GLSL}
  ${FILM_LOOK_GLSL}
  ${REVEAL_GLSL}
  void main() {
    vec2 p = (vUv - 0.5) * uPhotoCrop + uPhotoOffset;
    float c = cos(uPhotoRotation), s = sin(uPhotoRotation);
    vec2 photoUV = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec3 source = texture2D(uTexture, clamp(photoUV, vec2(0.0), vec2(1.0))).rgb * uExposure;
    gl_FragColor = vec4(illuminatedFilm(applyFilmLook(source, vUv), revealMode(uModeTransition), uOrangeMask, uTableOutput * revealLight(), uSurfaceReflection), 1.0);
    ${DISPLAY_FRAGMENT}
  }
`;

export function createFilmShaderMaterial(texture: THREE.Texture, isPositive: boolean, brightness = 1, base = FILM_ORANGE_MASK) {
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    fragmentShader: FilmFragmentShader,
    uniforms: {
      ...filmLookUniforms(),
      uTexture: { value: texture },
      uPhotoCrop: { value: new THREE.Vector2(1, 1) },
      uPhotoOffset: { value: new THREE.Vector2() },
      uPhotoRotation: { value: 0 },
      uModeTransition: { value: isPositive ? 1.0 : 0.0 },
      uOrangeMask: { value: base.clone() },
      uExposure: { value: FILM_EXPOSURE },
      ...revealUniforms(),
      ...illuminationUniforms(brightness),
    },
  });
}

/** How far the rebate continues under each frame's edge, in millimetres of film. */
export const GATE_OVERLAP_MM = .4;

export function createRebateMaterial(texture: THREE.Texture, brightness = 1, isPositive = false, negativeStock = true, base = new THREE.Color("rgb(217,119,36)"), layout?: FilmStripLayout, ink = new THREE.Color("#2a1208")) {
  const size = layout ? getStripDimensions(layout) : undefined;
  const gates = Array.from({ length: layout?.frameCount || 1 }, (_, i) => {
    if (!layout || !size) return new THREE.Vector2();
    const bounds = getFrameBounds(i, layout);
    return new THREE.Vector2(bounds.minX / size.width + .5, bounds.maxX / size.width + .5);
  });
  // The rebate runs 0.4 mm under each (opaque) frame. The frame sits slightly
  // above it, so a thinner overlap opened a sub-pixel gap at steep camera
  // angles, where the lit table showed through as a dotted line along the edge.
  const overlap = .55 / 36 * GATE_OVERLAP_MM;
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    uniforms: { uGates: { value: gates }, uTexture: { value: texture }, uModeTransition: { value: isPositive && negativeStock ? 1 : 0 }, uRebateBase: { value: base.clone() }, uRebateInk: { value: ink.clone() },
      uRailFraction: { value: layout && size ? layout.marginY / size.height : 0 },
      uGateInset: { value: size ? new THREE.Vector2(overlap / size.width, overlap / size.height) : new THREE.Vector2() },
      ...revealUniforms(size ? -size.width / 2 : 0, size?.width ?? 1),
      ...illuminationUniforms(brightness) },
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform float uTableOutput;
      uniform float uSurfaceReflection;
      uniform float uModeTransition;
      uniform vec3 uRebateBase;
      uniform vec3 uRebateInk;
      uniform float uRailFraction;
      uniform vec2 uGates[${gates.length}];
      uniform vec2 uGateInset;
      varying vec2 vUv;
      ${REVEAL_GLSL}
      void main() {
        vec4 rebate;
        if (uRailFraction > 0.0) {
          if (vUv.y > uRailFraction && vUv.y < 1.0 - uRailFraction) {
            // Individual apertures support mixed widths; retain the seam overlap.
            for (int i = 0; i < ${gates.length}; i++) {
              if (vUv.x > uGates[i].x + uGateInset.x && vUv.x < uGates[i].y - uGateInset.x
                && vUv.y > uRailFraction + uGateInset.y && vUv.y < 1.0 - uRailFraction - uGateInset.y) discard;
            }
            rebate = vec4(uRebateBase, 1.0);
          } else {
            float railV = vUv.y < uRailFraction
              ? 0.5 * vUv.y / uRailFraction
              : 0.5 + 0.5 * (vUv.y - (1.0 - uRailFraction)) / uRailFraction;
            rebate = texture2D(uTexture, vec2(vUv.x, railV));
            rebate.rgb = mix(uRebateInk, uRebateBase, rebate.r / max(rebate.a, 0.001));
          }
        } else {
          rebate = texture2D(uTexture, vUv);
          rebate.rgb = mix(uRebateInk, uRebateBase, rebate.r / max(rebate.a, 0.001));
        }
        if (rebate.a < 0.1) discard;
        // Normalize away the orange mask before reversing the entire rebate,
        // including its lettering. E-6 is already positive and bypasses this.
        vec3 positive = vec3(0.004) + max(vec3(0.0), vec3(1.0) - rebate.rgb / max(uRebateBase, vec3(0.001))) * 0.5;
        vec3 transmission = mix(rebate.rgb * 0.5, positive, revealMode(uModeTransition));
        gl_FragColor = vec4(transmission * uTableOutput * revealLight() + vec3(uSurfaceReflection), 1.0);
        ${DISPLAY_FRAGMENT}
      }
    `,
  });
}

export function createPanelMaterial(brightness = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: FilmVertexShader,
    // uAmbient: dim room light on the diffuser, used by screenings while the table is off.
    uniforms: { ...illuminationUniforms(brightness), uAmbient: { value: 0 } },
    fragmentShader: `
      uniform float uTableOutput;
      uniform float uAmbient;
      void main() {
        // A uniform neutral diffuser. Film shapes belong to the actual scene,
        // never a baked shadow of a fixed strip layout on the panel itself.
        gl_FragColor = vec4(vec3(uTableOutput + uAmbient), 1.0);
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
