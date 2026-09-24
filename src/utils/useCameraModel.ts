import { useCallback, useEffect, useState } from 'react';
import type { Group } from 'three';
import { loadShelfCameraModel } from './loadCameraModel';
import type { CameraEntry } from '../data/cameras';

export function useCameraModel(camera: CameraEntry, enabled: boolean) {
  const [model, setModel] = useState<Group | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || model) return;
    let disposed = false;
    setError('');
    loadShelfCameraModel(camera).then(value => {
      if (!disposed) setModel(value);
    }).catch(() => { if (!disposed) setError(navigator.onLine ? 'The camera model could not be loaded.' : "Camera model isn't available offline."); });
    return () => { disposed = true; };
  }, [camera, enabled, model, attempt]);
  const retry = useCallback(() => { setError(''); setAttempt(value => value + 1); }, []);
  return { model, error, retry };
}
