import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BASELINE_ROLL, RollDefinition } from "./rollLayout";

export const uniqueRollSources = (roll: RollDefinition) => [...new Set(roll.frames.map(frame => frame.src))];
export function prioritizedSources(roll: RollDefinition, selected: number) {
  const indices = roll.frames.map((_, index) => index);
  indices.sort((a, b) => Math.abs(a - selected) - Math.abs(b - selected));
  return [...new Set(indices.map(index => roll.frames[index].src))];
}

/** Owned, shared texture cache. Navigation reprioritizes pending work without reloading residents. */
export function useRollTextures(roll: RollDefinition, priority: number, retry: number) {
  const [loaded, setLoaded] = useState<Map<string, THREE.Texture>>(new Map());
  const [failed, setFailed] = useState<string[]>([]);
  const [settled, setSettled] = useState(false);
  const priorityRef = useRef(priority);
  priorityRef.current = priority;
  const placeholder = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([65, 65, 65, 255]), 1, 1);
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => placeholder.dispose(), [placeholder]);
  useEffect(() => {
    let cancelled = false;
    const owned = new Map<string, THREE.Texture>();
    const errors: string[] = [];
    const overviewUrls = roll === BASELINE_ROLL ? [] : [...new Set(roll.frames.flatMap(frame => frame.thumbnailSrc ? [frame.thumbnailSrc] : []))];
    const details = roll.imported ? prioritizedSources(roll, priorityRef.current).slice(0, roll.framesPerStrip * 3) : uniqueRollSources(roll);
    const pending = new Set([...overviewUrls, ...details]);
    setLoaded(new Map()); setFailed([]); setSettled(false);
    const loader = new THREE.TextureLoader();
    async function worker() {
      while (!cancelled && pending.size) {
        // Overview work is bounded and cheap; detail follows current selection and neighbours.
        const src = overviewUrls.find(url => pending.has(url)) ?? prioritizedSources(roll, priorityRef.current).find(url => pending.has(url))!;
        pending.delete(src);
        try {
          const texture = await loader.loadAsync(src);
          if (cancelled) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          owned.set(src, texture);
          setLoaded(new Map(owned));
        } catch {
          if (!cancelled && uniqueRollSources(roll).includes(src)) { errors.push(src); setFailed([...errors]); }
        }
      }
    }
    Promise.all([worker(), worker(), worker()]).then(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; owned.forEach(texture => texture.dispose()); };
    // Selection updates the priority ref; only explicit retry or roll replacement restarts work.
  }, [roll, retry, roll.imported ? Math.floor(priority / roll.framesPerStrip) : 0]);
  return { textures: roll.frames.map(frame => loaded.get(frame.src) ?? (frame.thumbnailSrc ? loaded.get(frame.thumbnailSrc) : undefined) ?? placeholder), failed, settled, loadedCount: loaded.size };
}
