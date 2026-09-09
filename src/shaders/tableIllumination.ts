import * as THREE from "three";
import { clampTableBrightness } from "../utils/cameraBounds";

// Linear radiance, shared by the diffuser, film and local bounce lights.
// The slider is a control setting, not a calibrated display luminance.
export function getTableIllumination(brightness = 1) {
  const setting = clampTableBrightness(Number.isFinite(brightness) ? brightness : 1);
  const output = 2.4 * setting * setting;
  return { output, spillIntensity: output * 1.8, surfaceReflection: 0.008 };
}

export const DISPLAY_EXPOSURE = 1;
export const FILM_TRANSMISSION_GLSL = `
  vec3 filmTransmittance(vec3 source, float mode, vec3 base) {
    vec3 positive = clamp(source, 0.0, 1.0);
    vec3 exposure = pow(positive, vec3(0.45));
    vec3 absorption = vec3(
      exposure.r * 0.88 + exposure.g * 0.08,
      exposure.g * 0.75 + exposure.b * 0.10,
      exposure.b * 0.55 + exposure.g * 0.15
    );
    vec3 negative = clamp(base * pow(vec3(1.0) - absorption * 0.98, vec3(2.2))
      + vec3(0.015, 0.008, 0.003), 0.0, 1.0);
    return mix(negative * 0.7, positive * 0.5, clamp(mode, 0.0, 1.0));
  }
  vec3 transmitTableLight(vec3 transmission, float tableRadiance, float reflection) {
    return transmission * tableRadiance + vec3(reflection);
  }
`;

// CPU counterpart for optical integration checks; inputs and output are linear.
export function filmTransmittance(source: THREE.Color, positive: boolean, base: THREE.Color) {
  const p = new THREE.Color(...[source.r, source.g, source.b].map(v => THREE.MathUtils.clamp(v, 0, 1)) as [number, number, number]);
  if (positive) return p.multiplyScalar(0.5);
  const e = [p.r, p.g, p.b].map(v => Math.pow(v, 0.45));
  return new THREE.Color(
    base.r * Math.pow(1 - (e[0] * 0.88 + e[1] * 0.08) * 0.98, 2.2) + 0.015,
    base.g * Math.pow(1 - (e[1] * 0.75 + e[2] * 0.10) * 0.98, 2.2) + 0.008,
    base.b * Math.pow(1 - (e[2] * 0.55 + e[1] * 0.15) * 0.98, 2.2) + 0.003,
  ).multiplyScalar(0.7);
}

export function illuminationUniforms(brightness = 1) {
  const light = getTableIllumination(brightness);
  return { uTableOutput: { value: light.output }, uSurfaceReflection: { value: light.surfaceReflection } };
}

export function updateTableIllumination(material: THREE.ShaderMaterial, brightness: number) {
  material.uniforms.uTableOutput.value = getTableIllumination(brightness).output;
}

export const DISPLAY_FRAGMENT = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// Scene capture stores un-tonemapped linear HDR light. The lens uses the same
// final ACES/sRGB conversion as the directly viewed surfaces, exactly once.
export function createLinearRenderTarget(width: number, height: number) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return target;
}

// At 1.5x the lens covers ~522 texels of a 1536px master. 768 retains
// source detail while keeping the half-float capture near the old 4 MiB cost.
export const LOUPE_CAPTURE_SIZE = 768;
export function createLoupeRenderTarget() {
  return createLinearRenderTarget(LOUPE_CAPTURE_SIZE, LOUPE_CAPTURE_SIZE);
}

export function captureLoupeScene(
  renderer: Pick<THREE.WebGLRenderer, "getRenderTarget" | "setRenderTarget" | "render" | "toneMapping">,
  scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, loupe: THREE.Object3D,
) {
  const previousTarget = renderer.getRenderTarget();
  const previousToneMapping = renderer.toneMapping;
  const visible = loupe.visible;
  try {
    loupe.visible = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.toneMapping = previousToneMapping;
    loupe.visible = visible;
  }
}
