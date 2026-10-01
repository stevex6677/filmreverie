import { clampFilmStrength, FILM_LOOKS } from '../data/filmLooks';
import { FilmStockId } from '../data/filmStocks';
import { createFilmLookPreview, FILM_LOOK_GLSL } from '../shaders/filmLook';

export interface FilmLookOptions { stockId: FilmStockId; strength: number; widthMm: number; heightMm: number; seed: number }

const VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() { vUv = vec2(aPosition.x * .5 + .5, .5 - aPosition.y * .5); gl_Position = vec4(aPosition, 0.0, 1.0); }`;
// The light table's film look, applied to an sRGB photograph and returned as sRGB.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uImage;
in vec2 vUv;
out vec4 outColor;
${FILM_LOOK_GLSL}
void main() { outColor = vec4(filmToPerceptual(applyFilmLook(filmToLinear(texture(uImage, vUv).rgb), vUv)), 1.0); }`;

/** One WebGL context shared by every editor preview; results are copied to 2D canvases. */
class Renderer {
  readonly canvas = document.createElement('canvas');
  readonly gl: WebGL2RenderingContext;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private textures: { image: HTMLImageElement; texture: WebGLTexture }[] = [];
  lost = false;
  constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', () => { this.lost = true; });
    const shader = (type: number, source: string) => {
      const value = gl.createShader(type)!;
      gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) ?? 'Film look shader failed');
      return value;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.bindAttribLocation(program, 0, 'aPosition'); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Film look program failed');
    gl.useProgram(program);
    for (const name of ['uImage', 'uFilmStrength', 'uFilmTone', 'uFilmColor', 'uFilmGrain', 'uFilmSizeMm', 'uFilmSeed']) this.uniforms[name] = gl.getUniformLocation(program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.uniforms.uImage, 0);
  }
  private texture(image: HTMLImageElement) {
    const gl = this.gl, cached = this.textures.find(entry => entry.image === image);
    if (cached) return cached.texture;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    // Mipmaps keep a 2048 px viewing image clean when drawn small.
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, wrap, gl.CLAMP_TO_EDGE);
    this.textures.unshift({ image, texture });
    // The crop and film views share the current photograph; keep a few neighbours.
    for (const old of this.textures.splice(4)) gl.deleteTexture(old.texture);
    return texture;
  }
  render(target: CanvasRenderingContext2D, image: HTMLImageElement, options: FilmLookOptions) {
    const gl = this.gl, { width, height } = target.canvas, look = FILM_LOOKS[options.stockId];
    if (this.canvas.width < width || this.canvas.height < height) {
      this.canvas.width = Math.max(this.canvas.width, width); this.canvas.height = Math.max(this.canvas.height, height);
    }
    gl.viewport(0, this.canvas.height - height, width, height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture(image));
    const u = this.uniforms;
    gl.uniform1f(u.uFilmStrength, clampFilmStrength(options.strength) / 50);
    gl.uniform4f(u.uFilmTone, look.contrast, look.saturation, look.shadows, look.highlights);
    gl.uniform3f(u.uFilmColor, ...look.color);
    gl.uniform2f(u.uFilmGrain, look.grain, look.grainPerMm);
    gl.uniform2f(u.uFilmSizeMm, options.widthMm, options.heightMm);
    gl.uniform1f(u.uFilmSeed, options.seed);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    target.clearRect(0, 0, width, height);
    target.drawImage(this.canvas, 0, 0, width, height, 0, 0, width, height);
  }
}

let shared: Renderer | null | undefined;
function renderer() {
  if (shared?.lost) shared = undefined;
  if (shared === undefined) {
    try { shared = new Renderer(); } catch { shared = null; }
  }
  return shared;
}

/** Draws the whole photograph into the canvas at its current pixel size, with the film look applied. */
export function renderFilmLook(canvas: HTMLCanvasElement, image: HTMLImageElement, options: FilmLookOptions) {
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) return;
  const gpu = renderer();
  if (gpu) { gpu.render(context, image, options); return; }
  // Without WebGL2, apply the identical CPU film look.
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  createFilmLookPreview({ data: pixels.data.slice() }, canvas.width, canvas.height, FILM_LOOKS[options.stockId], options.widthMm, options.heightMm, options.seed)(options.strength, pixels.data);
  context.putImageData(pixels, 0, 0);
}
