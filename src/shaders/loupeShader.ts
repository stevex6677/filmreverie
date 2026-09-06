import * as THREE from "three";

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

    // Barrel distortion
    vec2 distP = p * (1.0 + 0.04 * r * r);

    // Sample UV on source texture
    vec2 sampleUv = uCenterUv + (distP * 0.5) / uMagnification;
    sampleUv = clamp(sampleUv, vec2(0.001), vec2(0.999));

    vec4 tex = texture2D(uTexture, sampleUv);
    vec3 positiveRgb = tex.rgb * uExposure;

    // Authentic negative response matching film strip
    vec3 inv = clamp(vec3(1.0) - tex.rgb, 0.0, 1.0);
    vec3 negRgb = clamp(pow(inv, vec3(0.9)) * uOrangeMask * 1.05 + vec3(0.03, 0.015, 0.005), 0.0, 1.0);

    vec3 imgColor = mix(negRgb, positiveRgb, clamp(uModeTransition, 0.0, 1.0));

    // Subtle edge vignette
    float vignette = smoothstep(1.0, 0.85, r);

    // Subtle lens reflection arc
    vec2 refLight = normalize(vec2(-0.7, 0.7));
    float highlight = pow(max(0.0, dot(p, refLight)), 6.0) * 0.12 * smoothstep(0.4, 0.9, r);

    vec3 finalRgb = imgColor * vignette + vec3(0.03) * (1.0 - vignette) + vec3(highlight);

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
      uOrangeMask: { value: new THREE.Color(0.86, 0.44, 0.16) },
      uExposure: { value: 1.0 },
    },
  });
}
