import * as THREE from 'three';

// Uploading a whole photograph to the GPU blocks the main thread: 26–65 ms for
// a 2400 × 1600 JPEG in Safari 18 on an Intel Mac, whether or not it was
// decoded first. In the middle of a screening or a camera move that is a
// dropped frame or two. Instead a worker decodes the photograph, and its rows
// are uploaded in strips of about 1 MB (≈6 ms there for 8 strips each) over a
// few frames, within a small time budget per frame. The texture is handed out
// only when complete, so a half-uploaded photograph is never drawn.

const STRIP_BYTES = 1 << 20;
/** Main-thread time per frame for uploads; at least one strip always goes. */
export const UPLOAD_BUDGET_MS = { idle: 6, playback: 4 };

interface Job { texture: THREE.DataTexture; pixels: Uint8ClampedArray; row: number; resolve: (texture: THREE.Texture) => void; reject: (error: unknown) => void }
interface Decoded { id: number; width: number; height: number; pixels: Uint8ClampedArray; error?: string }

let worker: Worker | null | undefined;
const pending = new Map<number, { resolve: (decoded: Decoded) => void; reject: (error: Error) => void }>();
let nextId = 0;
function decoder() {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return worker = null;
    worker = new Worker(new URL('./photoDecodeWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<Decoded>) => {
      const request = pending.get(data.id); pending.delete(data.id);
      if (data.error) request?.reject(new Error(data.error)); else request?.resolve(data);
    };
    worker.onerror = () => { for (const request of pending.values()) request.reject(new Error('Decode worker failed')); pending.clear(); worker = null; };
  } catch { worker = null; }
  return worker;
}
function decode(url: string, scale: number) {
  const active = decoder();
  if (!active) return Promise.reject(new Error('Worker decoding unavailable'));
  const id = ++nextId;
  return new Promise<Decoded>((resolve, reject) => { pending.set(id, { resolve, reject }); active.postMessage({ id, url: new URL(url, location.href).href, scale }); });
}

/**
 * Photographs are mipmapped and anisotropically filtered: a 2048 px photograph
 * seen small or at a grazing angle would otherwise skip texels and shimmer as
 * the camera moves. The mip chain adds a third to the texture's memory.
 */
export const MIPMAP_MEMORY = 4 / 3;
export function filterPhotograph(texture: THREE.Texture) {
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  // Clamped to the device's maximum by the renderer.
  texture.anisotropy = 8;
}

/** Photographs decoded ahead of their upload; bounded, as each holds full-size pixels. */
const AHEAD = 2;

export class ProgressiveTextureUploader {
  private jobs: Job[] = [];
  private ahead = new Map<string, Promise<Decoded>>();
  private scheduled = false;
  /** Set lower while a screening plays, when every frame counts. */
  budget = UPLOAD_BUDGET_MS.idle;
  /** Photographs are decoded at this fraction of their size (below 1 to fit a memory budget). */
  resolution = 1;
  constructor(private readonly gl: THREE.WebGLRenderer) {}

  /** A GPU-resident texture of the photograph at `url`, oriented like TextureLoader's (flipY). */
  async load(url: string): Promise<THREE.Texture> {
    const early = this.ahead.get(url);
    this.ahead.delete(url);
    const { width, height, pixels } = await (early ?? decode(url, this.resolution));
    const texture = new THREE.DataTexture(null, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = THREE.SRGBColorSpace;
    filterPhotograph(texture);
    // Allocate storage (with its mip chain) without uploading; rows follow in strips.
    // The mips are generated once the last strip is in.
    texture.source.dataReady = false;
    texture.needsUpdate = true;
    this.gl.initTexture(texture);
    // The first strips go at once; the rest follow on later frames.
    return new Promise((resolve, reject) => { this.jobs.push({ texture, pixels, row: 0, resolve, reject }); if (!this.scheduled) this.step(); this.schedule(); });
  }

  /** Start decoding the photographs expected next, while the current one uploads. */
  prefetch(urls: readonly string[]) {
    for (const url of urls) {
      if (this.ahead.size >= AHEAD) break;
      if (this.ahead.has(url)) continue;
      const pending = decode(url, this.resolution);
      pending.catch(() => this.ahead.delete(url));
      this.ahead.set(url, pending);
    }
  }

  // Strips follow the display's frames; a timer keeps loading going where
  // frames do not run (a hidden page), when there is no frame to protect.
  private schedule() {
    if (this.scheduled || !this.jobs.length) return;
    this.scheduled = true;
    const run = () => { if (!this.scheduled) return; this.scheduled = false; cancelAnimationFrame(frame); clearTimeout(timer); this.step(); this.schedule(); };
    const frame = requestAnimationFrame(run), timer = setTimeout(run, 100);
  }

  private step() {
    const started = performance.now(), context = this.gl.getContext() as WebGL2RenderingContext;
    const budget = document.visibilityState === 'hidden' ? Infinity : this.budget;
    while (this.jobs.length) {
      const job = this.jobs[0], { texture } = job, { width, height } = texture.image;
      const handle = (this.gl.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture;
      if (!handle || context.isContextLost()) { this.jobs.shift(); job.reject(new Error('Texture unavailable')); continue; }
      this.gl.state.bindTexture(context.TEXTURE_2D, handle);
      context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false);
      context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      context.pixelStorei(context.UNPACK_ALIGNMENT, 4);
      const rows = Math.max(1, Math.floor(STRIP_BYTES / (width * 4)));
      do {
        const count = Math.min(rows, height - job.row);
        context.texSubImage2D(context.TEXTURE_2D, 0, 0, job.row, width, count, context.RGBA, context.UNSIGNED_BYTE, job.pixels.subarray(job.row * width * 4, (job.row + count) * width * 4));
        job.row += count;
      } while (job.row < height && performance.now() - started < budget);
      if (job.row < height) return;
      context.generateMipmap(context.TEXTURE_2D);
      this.jobs.shift();
      job.pixels = new Uint8ClampedArray(0);
      job.resolve(texture);
      if (performance.now() - started >= budget) return;
    }
  }

  dispose() { this.ahead.clear(); for (const job of this.jobs) { job.texture.dispose(); job.reject(new Error('Uploader disposed')); } this.jobs = []; }
}
