import { loadModel } from '../../standalone/model-viewer/model-core.js';
import type { CameraEntry } from '../data/cameras';

export const loadCameraModel = (camera: CameraEntry) => loadModel(camera.url, camera.profile, {
  dracoDecoderPath: '/assets/draco/',
});
