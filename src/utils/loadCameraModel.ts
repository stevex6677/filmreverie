import { loadModel } from '../../standalone/model-viewer/model-core.js';
import type { CameraEntry } from '../data/cameras';

export interface CameraCollectionProgress {
  loaded: number;
  total: number;
  failed: number;
  retry: () => void;
}

export const loadCameraModel = (camera: CameraEntry) => loadModel(camera.url, camera.profile, {
  dracoDecoderPath: '/assets/draco/',
});

let detailPreload: Promise<void> | undefined;
export function preloadCameraDetails(cameras: readonly CameraEntry[]) {
  // One background download/decode at a time. Inspection can start any other
  // model immediately, and shares loadModel's in-flight and decoded cache.
  return detailPreload ??= (async () => {
    for (const camera of cameras) {
      try { await loadCameraModel(camera); }
      catch { /* Optional preload failures must not interrupt the room or queue.
                 Opening the camera uses the normal retryable loader. */ }
    }
  })();
}

// Bound cabinet downloads/decodes so five Draco loaders cannot exhaust a phone.
let active = 0;
const queue: Array<() => void> = [];
const shelfModels = new Map<string, ReturnType<typeof loadModel>>();
export function loadShelfCameraModel(camera: CameraEntry) {
  if (!shelfModels.has(camera.shelfUrl)) {
    const promise = new Promise<Awaited<ReturnType<typeof loadModel>>>((resolve, reject) => {
      const start = () => {
        active++;
        loadModel(camera.shelfUrl, 'default', { dracoDecoderPath: '/assets/draco/' })
          .then(resolve, reject).finally(() => { active--; queue.shift()?.(); });
      };
      if (active < 2) start(); else queue.push(start);
    }).catch(error => { shelfModels.delete(camera.shelfUrl); throw error; });
    shelfModels.set(camera.shelfUrl, promise);
  }
  return shelfModels.get(camera.shelfUrl)!;
}
