// Decodes a photograph off the main thread into RGBA rows ordered for WebGL
// (bottom row first), so the main thread only copies pixels to the GPU.
// `scale` below 1 decodes it smaller, to keep within a memory budget.
self.onmessage = async ({ data: { id, url, scale = 1 } }: MessageEvent<{ id: number; url: string; scale?: number }>) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'from-image' });
    const width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale))), height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));
    const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context in worker');
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(0, height); ctx.scale(1, -1); ctx.drawImage(bitmap, 0, 0, width, height); bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    (self as unknown as Worker).postMessage({ id, width: canvas.width, height: canvas.height, pixels }, [pixels.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
