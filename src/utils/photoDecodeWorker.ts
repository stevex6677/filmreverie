// Decodes a photograph off the main thread into RGBA rows ordered for WebGL
// (bottom row first), so the main thread only copies pixels to the GPU.
self.onmessage = async ({ data: { id, url } }: MessageEvent<{ id: number; url: string }>) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'from-image' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context in worker');
    ctx.translate(0, bitmap.height); ctx.scale(1, -1); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    (self as unknown as Worker).postMessage({ id, width: canvas.width, height: canvas.height, pixels }, [pixels.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
