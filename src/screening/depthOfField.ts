import * as THREE from 'three';
import { createLinearRenderTarget, DISPLAY_FRAGMENT } from '../shaders/tableIllumination';

// Depth of field for screenings, at full resolution like a lens. The scene is
// rendered once into a linear HDR target with depth. A pass packs color with
// linear depth, so each gather sample is one texture read. A small tile pass
// records the largest blur that can reach each tile, so a pixel searches only
// as far as it must. Each pixel then gathers a disc of the scene by circle of
// confusion (scatter-as-gather, after Gustafsson 2018): bright light through
// the film and the photographs' lamps spread into even, hard-edged discs,
// blurred foreground spreads over what is behind it, and a sharp surface is
// never blurred by what lies behind it. The result gets the same ACES/sRGB
// output as the directly viewed scene. Sparse samples (a small budget) are
// jittered per pixel and read a mip level matched to their spacing.
//
// Playback may render at a reduced `scale` of the canvas. Targets keep their
// full size and the frame is drawn into a region of them, then scaled up to
// the unchanged canvas, so changing scale never reallocates or resizes
// anything (either would stall a frame).

/** The largest blur radius, as a fraction of the picture height. */
export const MAX_BLUR = .03;
const TILE = 16;
const MAX_ITERATIONS = 1024;

/**
 * Circle of confusion (radius, fraction of picture height) of a point at
 * `depth` when focused at `focus`. It grows with relative defocus, and more
 * steeply for close focus, as it does with a real lens.
 */
export function blurFraction(aperture: number, focus: number, depth: number) {
  return Math.min(MAX_BLUR, aperture * closeness(focus) * Math.abs(1 - focus / depth));
}
const closeness = (focus: number) => Math.min(1.4, Math.max(.35, Math.sqrt(.2 / Math.max(1e-3, focus))));

const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// Passes address the rendered region in pixels (uSize) of targets allocated at uAlloc.
const REGION = `
  uniform vec2 uSize, uAlloc;
  vec2 texel(vec2 pixel) { return clamp(pixel, vec2(0.5), uSize - 0.5) / uAlloc; }
`;
const packShader = `
  #include <packing>
  ${REGION}
  uniform sampler2D uColor;
  uniform sampler2D uDepth;
  uniform float uNear, uFar;
  void main() {
    vec2 uv = texel(gl_FragCoord.xy);
    gl_FragColor = vec4(texture2D(uColor, uv).rgb, -perspectiveDepthToViewZ(texture2D(uDepth, uv).x, uNear, uFar));
  }
`;
// uPacked holds linear HDR color, and view depth in alpha.
const COMMON = `
  ${REGION}
  uniform sampler2D uPacked;
  uniform float uFocus, uScale, uMaxBlur;
  float blurSize(float depth) { return min(uMaxBlur, uScale * abs(1.0 - uFocus / depth)); }
`;
// One texel per tile: the largest blur (in pixels) within reach of the tile.
const tileShader = `
  ${COMMON}
  void main() {
    float reach = 0.0;
    vec2 center = gl_FragCoord.xy * ${TILE}.0, span = vec2(${TILE / 2}.0 + uMaxBlur);
    for (int y = 0; y <= 12; y++) for (int x = 0; x <= 12; x++) {
      vec2 pixel = center + (vec2(float(x), float(y)) / 12.0 * 2.0 - 1.0) * span;
      reach = max(reach, blurSize(texture2D(uPacked, texel(pixel)).a));
    }
    gl_FragColor = vec4(reach, 0.0, 0.0, 1.0);
  }
`;
const gatherShader = `
  ${COMMON}
  uniform sampler2D uTiles;
  uniform vec2 uTileAlloc;
  uniform float uSamples;
  void main() {
    vec2 pixel = gl_FragCoord.xy;
    vec4 center = texture2D(uPacked, texel(pixel));
    vec3 color = center.rgb;
    float reach = min(uMaxBlur, texture2D(uTiles, (floor(pixel / ${TILE}.0) + 0.5) / uTileAlloc).r);
    if (reach >= 0.5) {
      float centerDepth = center.a, centerSize = blurSize(centerDepth);
      // Rings thin out with radius; the step spends about uSamples within reach.
      float step = max(0.5, reach * reach / (2.0 * uSamples));
      // Below dense sampling, rotate the spiral and shift its rings per pixel
      // (interleaved gradient noise), so sparse samples read as fine grain, not rings.
      float sparse = step > 1.0 ? 1.0 : 0.0;
      float turn = sparse * 6.2831853 * fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
      float shift = sparse * fract(52.9829189 * fract(dot(pixel + vec2(47.0, 17.0), vec2(0.06711056, 0.00583715))));
      // Sparse samples read a pre-blurred level matched to their spacing, so
      // the gaps between them fill in smoothly.
      float lod = max(0.0, log2(sqrt(6.2831853 * step)) - 1.0), edge = exp2(lod);
      float total = 1.0, radius = step * (0.5 + shift);
      for (int i = 0; i < ${MAX_ITERATIONS}; i++) {
        if (radius > reach + 0.5) break;
        float angle = turn + float(i) * 2.39996323;
        vec2 at = clamp(pixel + vec2(cos(angle), sin(angle)) * radius, vec2(edge), uSize - edge);
        vec4 tap = textureLod(uPacked, at / uAlloc, lod);
        float sampleDepth = tap.a, sampleSize = blurSize(sampleDepth);
        // A sharp surface in front is not blurred by what lies behind it.
        if (sampleDepth > centerDepth) sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
        // Each sample is a disc of its own blur: a hard, even edge like a lens aperture.
        float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
        color += mix(color / total, tap.rgb, m);
        total += 1.0;
        radius += step / radius;
      }
      color /= total;
    }
    gl_FragColor = vec4(color, 1.0);
    #ifdef DISPLAY
    ${DISPLAY_FRAGMENT}
    #endif
  }
`;
// Scales a reduced-resolution frame up to the canvas, with the display output.
const presentShader = `
  uniform sampler2D uImage;
  uniform vec2 uRegion;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uImage, vUv * uRegion).rgb, 1.0);
    ${DISPLAY_FRAGMENT}
  }
`;

const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string> = {}) =>
  new THREE.ShaderMaterial({ vertexShader, fragmentShader, depthTest: false, depthWrite: false, uniforms, defines });
const region = () => ({ uSize: { value: new THREE.Vector2() }, uAlloc: { value: new THREE.Vector2() } });
const common = () => ({ ...region(), uPacked: { value: null }, uFocus: { value: 1 }, uScale: { value: 0 }, uMaxBlur: { value: 0 } });
const gatherUniforms = () => ({ ...common(), uTiles: { value: null }, uTileAlloc: { value: new THREE.Vector2() }, uSamples: { value: 128 } });
const target = (width: number, height: number, filter: THREE.MagnificationTextureFilter) => {
  const result = createLinearRenderTarget(width, height);
  result.depthBuffer = false;
  result.texture.minFilter = result.texture.magFilter = filter;
  return result;
};

export class DepthOfField {
  private scene: THREE.WebGLRenderTarget | null = null;
  private packed: THREE.WebGLRenderTarget | null = null;
  private tiles: THREE.WebGLRenderTarget | null = null;
  private image: THREE.WebGLRenderTarget | null = null;
  private readonly pack = pass(packShader, { ...region(), uColor: { value: null }, uDepth: { value: null }, uNear: { value: .1 }, uFar: { value: 100 } });
  private readonly tile = pass(tileShader, common());
  /** Gathers straight to the canvas at full scale, or into `image` for scaling up. */
  private readonly gatherDisplay = pass(gatherShader, gatherUniforms(), { DISPLAY: '' });
  private readonly gatherLinear = pass(gatherShader, gatherUniforms());
  private readonly present = pass(presentShader, { uImage: { value: null }, uRegion: { value: new THREE.Vector2(1, 1) } });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.present);
  private readonly output = new THREE.Scene().add(this.quad);
  private readonly screen = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();
  private supported: boolean | null = null;

  constructor() { this.quad.frustumCulled = false; }

  /** Allocate every target once for this canvas size; only a canvas resize reallocates. */
  private allocate(width: number, height: number) {
    const tiles = [Math.ceil(width / TILE), Math.ceil(height / TILE)] as const;
    if (!this.scene) {
      this.scene = createLinearRenderTarget(width, height);
      this.scene.samples = 4;
      this.scene.depthTexture = new THREE.DepthTexture(width, height);
      // Full-detail samples never mix the depths of two surfaces (nearest); mipmaps serve sparse samples.
      this.packed = target(width, height, THREE.NearestFilter);
      this.packed.texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.packed.texture.generateMipmaps = true;
      this.tiles = target(tiles[0], tiles[1], THREE.NearestFilter);
      this.image = target(width, height, THREE.LinearFilter);
    }
    if (this.scene.width !== width || this.scene.height !== height) {
      for (const t of [this.scene, this.packed!, this.image!]) t.setSize(width, height);
      this.tiles!.setSize(tiles[0], tiles[1]);
    }
  }

  private draw(gl: THREE.WebGLRenderer, material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null, width: number, height: number) {
    this.quad.material = material;
    if (to) { to.viewport.set(0, 0, width, height); to.scissorTest = false; }
    gl.setRenderTarget(to); gl.render(this.output, this.screen);
  }

  /**
   * Render the scene focused at `focus` (view distance) at `scale` of the
   * canvas resolution. `samples` bounds the gather's cost per pixel; the blur's
   * size does not depend on it. Without depth of field at full scale, or where
   * half-float targets are unavailable, it renders directly.
   */
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: number, aperture: number, samples: number, scale = 1) {
    this.supported ??= gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
    const { x: width, y: height } = gl.getDrawingBufferSize(this.size);
    const previous = gl.getRenderTarget();
    const full = scale >= .999, w = full ? width : Math.max(1, Math.round(width * scale)), h = full ? height : Math.max(1, Math.round(height * scale));
    const blur = aperture * closeness(focus) * h;
    const sharp = !(blur >= .75) || !(focus > 0);
    if (!this.supported || !width || !height || (sharp && full)) { gl.setRenderTarget(null); gl.render(scene, camera); gl.setRenderTarget(previous); return; }
    this.allocate(width, height);
    this.scene!.viewport.set(0, 0, w, h); this.scene!.scissorTest = false;
    gl.setRenderTarget(this.scene); gl.render(scene, camera);
    let image = this.scene!.texture;
    if (!sharp) {
      const pack = this.pack.uniforms;
      pack.uColor.value = this.scene!.texture; pack.uDepth.value = this.scene!.depthTexture;
      pack.uNear.value = camera.near; pack.uFar.value = camera.far;
      pack.uSize.value.set(w, h); pack.uAlloc.value.set(width, height);
      this.draw(gl, this.pack, this.packed, w, h);
      const gather = full ? this.gatherDisplay : this.gatherLinear;
      for (const material of [this.tile, gather]) {
        const u = material.uniforms;
        u.uPacked.value = this.packed!.texture; u.uSize.value.set(w, h); u.uAlloc.value.set(width, height);
        u.uFocus.value = focus; u.uScale.value = blur; u.uMaxBlur.value = MAX_BLUR * h;
      }
      this.draw(gl, this.tile, this.tiles, Math.ceil(w / TILE), Math.ceil(h / TILE));
      gather.uniforms.uTiles.value = this.tiles!.texture;
      gather.uniforms.uTileAlloc.value.set(this.tiles!.width, this.tiles!.height);
      gather.uniforms.uSamples.value = Math.max(16, Math.min(MAX_ITERATIONS / 2, samples));
      if (full) { this.draw(gl, gather, null, width, height); gl.setRenderTarget(previous); return; }
      this.draw(gl, gather, this.image, w, h);
      image = this.image!.texture;
    }
    this.present.uniforms.uImage.value = image;
    this.present.uniforms.uRegion.value.set(w / width, h / height);
    this.draw(gl, this.present, null, width, height);
    gl.setRenderTarget(previous);
  }

  /** Compile and allocate everything playback may use, so its first use does not stall a frame. */
  warm(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: number, aperture: number) {
    if (aperture > 0) this.render(gl, scene, camera, focus, aperture, 16, 1);
    this.render(gl, scene, camera, focus, aperture, 16, .5);
    if (aperture > 0) this.render(gl, scene, camera, focus, aperture, 16, 1);
  }

  dispose() {
    this.scene?.depthTexture?.dispose();
    for (const t of [this.scene, this.packed, this.tiles, this.image]) t?.dispose();
    this.scene = this.packed = this.tiles = this.image = null;
    for (const m of [this.pack, this.tile, this.gatherDisplay, this.gatherLinear, this.present]) m.dispose();
    this.quad.geometry.dispose();
  }
}
