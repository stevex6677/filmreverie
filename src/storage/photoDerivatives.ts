import { sha256Hex } from './crypto';

export interface PhotoDerivatives { width: number; height: number; hash: string; viewing: Blob; thumbnail: Blob }
async function derivative(bitmap: ImageBitmap, edge: number) {
  const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio)), height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Image processing is unavailable.');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height); ctx.drawImage(bitmap, 0, 0, width, height);
  try {
    return 'convertToBlob' in canvas ? await canvas.convertToBlob({ type: 'image/jpeg', quality: .92 })
      : await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image conversion failed.')), 'image/jpeg', .92));
  } finally { canvas.width = canvas.height = 1; }
}

export async function photoDerivatives(source: Blob): Promise<PhotoDerivatives> {
  const hash = await sha256Hex(new Uint8Array(await source.arrayBuffer()));
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    return { width: bitmap.width, height: bitmap.height, hash,
      viewing: await derivative(bitmap, 2048), thumbnail: await derivative(bitmap, 256) };
  } finally { bitmap.close(); }
}
