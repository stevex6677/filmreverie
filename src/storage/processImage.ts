import { photoDerivatives, type PhotoDerivatives } from './photoDerivatives';

/** One image at a time bounds decoded memory; terminating the worker cancels CPU work too. */
export async function processImage(source: Blob, signal: AbortSignal): Promise<PhotoDerivatives> {
  signal.throwIfAborted();
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    await new Promise(resolve => setTimeout(resolve, 0));
    signal.throwIfAborted();
    return photoDerivatives(source);
  }
  const worker = new Worker(new URL('./photoDerivatives.worker.ts', import.meta.url), { type: 'module' });
  let cancel: () => void = () => {};
  try {
    return await new Promise<PhotoDerivatives>((resolve, reject) => {
      cancel = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
      signal.addEventListener('abort', cancel, { once: true });
      worker.onmessage = (event: MessageEvent<{ result: PhotoDerivatives; error?: string }>) => event.data.error
        ? reject(new Error(event.data.error)) : resolve(event.data.result);
      worker.onerror = () => reject(new Error('Image processing failed. Retry adding this photograph.'));
      worker.postMessage(source);
    });
  } finally { signal.removeEventListener('abort', cancel); worker.terminate(); }
}
