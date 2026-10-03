import { photoDerivatives } from './photoDerivatives';
self.onmessage = async (event: MessageEvent<Blob>) => {
  try { self.postMessage({ result: await photoDerivatives(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Cannot decode this image.' }); }
};
