import * as THREE from "three";
import { DISPLAY_FRAGMENT, FILM_TRANSMISSION_GLSL, illuminationUniforms } from "./tableIllumination";
import { FILM_EXPOSURE, FILM_ORANGE_MASK } from "./filmShader";

export const LoupeVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const LoupeFragmentShader = `
  uniform sampler2D uTexture;
  uniform sampler2D uDomeContext;
  uniform vec2 uCenterUv;
  uniform float uMagnification;
  uniform float uModeTransition;
  uniform float uActive;
  uniform vec3 uOrangeMask;
  uniform float uExposure;
  uniform float uUseSceneCapture;
  uniform float uTableOutput;
  uniform float uSurfaceReflection;
  uniform float uOpticalEffects;
  uniform float uGlassDome;
  varying vec2 vUv;
  ${FILM_TRANSMISSION_GLSL}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);

    if (r > 1.0) {
      discard;
    }

    if (uGlassDome > 0.5 && uUseSceneCapture > 0.5) {
      // A hemisphere has a clear magnifying center and stronger peripheral
      // refraction. Capture the table itself, including perforations and gaps.
      float bend = 1.0 + uOpticalEffects * (uMagnification - 1.0) * pow(r, 12.0) * .82;
      vec2 detailUv = .5 + p * .5 * bend;
      vec2 sampleUv = .5 + p * .5 * bend / uMagnification;
      vec2 chroma = p * .0022 * pow(r, 4.0) * uOpticalEffects;
      vec3 surround = vec3(
        texture2D(uDomeContext, clamp(sampleUv + chroma, vec2(.001), vec2(.999))).r,
        texture2D(uDomeContext, clamp(sampleUv, vec2(.001), vec2(.999))).g,
        texture2D(uDomeContext, clamp(sampleUv - chroma, vec2(.001), vec2(.999))).b
      );
      vec3 detail = texture2D(uTexture, clamp(detailUv, vec2(.001), vec2(.999))).rgb;
      vec3 transmitted = mix(detail, surround, smoothstep(.82, .98, r * bend) * uOpticalEffects);
      // Clear glass transmits the captured film without a grey veil, tint or
      // painted reflections. Curvature comes from refraction and the silhouette.
      gl_FragColor = vec4(transmitted, 1.0);
      ${DISPLAY_FRAGMENT}
      return;
    }

    // Optical barrel distortion
    vec2 distP = p * (1.0 + uOpticalEffects * 0.018 * r * r);

    // Subtle edge vignette
    float vignette = 1.0 - uOpticalEffects * 0.42 * smoothstep(0.78, 1.0, r);

    // Branch 1: Real-time physical scene capture (magnifies whatever is underneath in 3D)
    if (uUseSceneCapture > 0.5) {
      vec2 lensUv = distP * 0.5 + 0.5;
      vec2 chromOffset = distP * 0.002 * r * r * uOpticalEffects;

      float rCh = texture2D(uTexture, clamp(lensUv + chromOffset, vec2(0.001), vec2(0.999))).r;
      float gCh = texture2D(uTexture, clamp(lensUv, vec2(0.001), vec2(0.999))).g;
      float bCh = texture2D(uTexture, clamp(lensUv - chromOffset, vec2(0.001), vec2(0.999))).b;
      vec3 sceneColor = vec3(rCh, gCh, bCh);
      vec2 blur = vec2(0.0025) * smoothstep(0.65, 1.0, r) * uOpticalEffects;
      vec3 peripheral = (texture2D(uTexture, clamp(lensUv + blur, vec2(.001), vec2(.999))).rgb
        + texture2D(uTexture, clamp(lensUv - blur, vec2(.001), vec2(.999))).rgb) * 0.5;
      sceneColor = mix(sceneColor, peripheral, 0.32 * smoothstep(.65,1.0,r) * uOpticalEffects);

      vec3 finalColor = sceneColor * vignette + vec3(0.025) * (1.0 - vignette);
      gl_FragColor = vec4(finalColor, 1.0);
      ${DISPLAY_FRAGMENT}
      return;
    }

    // Branch 2: Synthetic fallback mode for isolated unit testing
    // Resting View: Clean illuminated light table surface transmitted through optical glass
    vec3 tableSurface = vec3(0.98, 0.99, 1.0) * uTableOutput;
    vec3 restingRgb = tableSurface * vignette + vec3(0.04) * (1.0 - vignette);

    // Active View: Magnified photographic frame with authentic negative/positive response
    vec2 baseUv = uCenterUv + (distP * 0.5) / uMagnification;
    vec2 chromOffset = (distP * 0.002 * r * r * uOpticalEffects);
    float rChannel = texture2D(uTexture, clamp(baseUv + chromOffset, vec2(0.001), vec2(0.999))).r;
    float gChannel = texture2D(uTexture, clamp(baseUv, vec2(0.001), vec2(0.999))).g;
    float bChannel = texture2D(uTexture, clamp(baseUv - chromOffset, vec2(0.001), vec2(0.999))).b;
    vec3 sampledColor = vec3(rChannel, gChannel, bChannel);

    vec3 transmission = filmTransmittance(sampledColor * uExposure, uModeTransition, uOrangeMask);
    vec3 imgColor = transmitTableLight(transmission, uTableOutput, uSurfaceReflection);
    vec3 activeRgb = imgColor * vignette + vec3(0.025) * (1.0 - vignette);

    // Smooth optical transition between resting table and active inspection
    vec3 finalRgb = mix(restingRgb, activeRgb, clamp(uActive, 0.0, 1.0));

    gl_FragColor = vec4(finalRgb, 1.0);
    ${DISPLAY_FRAGMENT}
  }
`;

export function createLoupeShaderMaterial(
  texture: THREE.Texture,
  isPositive: boolean,
  centerUv: [number, number],
  isActive: boolean = false,
  magnification: number = 2.5,
  brightness: number = 1
) {
  return new THREE.ShaderMaterial({
    vertexShader: LoupeVertexShader,
    fragmentShader: LoupeFragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uDomeContext: { value: texture },
      uCenterUv: { value: new THREE.Vector2(centerUv[0], centerUv[1]) },
      uMagnification: { value: magnification },
      uModeTransition: { value: isPositive ? 1.0 : 0.0 },
      uActive: { value: isActive ? 1.0 : 0.0 },
      uOrangeMask: { value: FILM_ORANGE_MASK },
      uExposure: { value: FILM_EXPOSURE },
      ...illuminationUniforms(brightness),
      uUseSceneCapture: { value: 0.0 },
      uOpticalEffects: { value: 1.0 },
      uGlassDome: { value: 0.0 },
    },
  });
}
