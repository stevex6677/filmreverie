import { useEffect, useState } from 'react';
import type { Group } from 'three';
import { loadModel } from '../../standalone/model-viewer/model-core.js';
import { PRIMARY_CAMERA } from '../data/cameras';

export function useCameraModel(enabled: boolean) {
  const [model, setModel] = useState<Group | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || model) return;
    let disposed = false;
    setError('');
    loadModel(PRIMARY_CAMERA.url, PRIMARY_CAMERA.profile).then(value => {
      if (!disposed) setModel(value);
    }).catch(() => { if (!disposed) setError(navigator.onLine ? 'The camera model could not be loaded.' : "Camera model isn't available offline."); });
    return () => { disposed = true; };
  }, [enabled, model, attempt]);
  return { model, error, retry: () => { setError(''); setAttempt(value => value + 1); } };
}
