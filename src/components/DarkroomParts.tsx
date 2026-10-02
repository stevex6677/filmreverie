import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { studioEnvironment } from "../../standalone/model-viewer/model-core.js";
import type { V3 } from "../utils/darkroomGeometry";

// Shadowed mesh primitives for the darkroom's procedural furniture.

type Mat = THREE.Material;
export const Box = ({ at, size, material, rotation }: { at: V3; size: V3; material: Mat; rotation?: V3 }) =>
  <mesh castShadow receiveShadow position={at} rotation={rotation} material={material}><boxGeometry args={size} /></mesh>;
export const Cylinder = ({ at, radius, height, material, rotation, segments = 24 }: { at: V3; radius: number | [number, number]; height: number; material: Mat; rotation?: V3; segments?: number }) => {
  const [top, bottom] = typeof radius === "number" ? [radius, radius] : radius;
  return <mesh castShadow receiveShadow position={at} rotation={rotation} material={material}><cylinderGeometry args={[top, bottom, height, segments]} /></mesh>;
};
export const Part = ({ geometry, material, at = [0, 0, 0], rotation, scale }: { geometry: THREE.BufferGeometry; material: Mat; at?: V3; rotation?: V3; scale?: number }) =>
  <mesh castShadow receiveShadow geometry={geometry} material={material} position={at} rotation={rotation} scale={scale} />;

const environments = new WeakMap<THREE.WebGLRenderer, { target: THREE.WebGLRenderTarget; users: number }>();

/** One reflection environment per renderer, shared by the room's furniture and the camera cabinet. */
export function useDarkroomEnvironment(): THREE.WebGLRenderTarget {
  const gl = useThree(state => state.gl);
  const entry = useMemo(() => {
    let shared = environments.get(gl);
    if (!shared) environments.set(gl, shared = { target: studioEnvironment(gl), users: 0 });
    return shared;
  }, [gl]);
  useEffect(() => {
    entry.users++;
    return () => {
      entry.users--;
      // Dispose a tick later, so an immediate remount reclaims it instead.
      setTimeout(() => {
        if (entry.users > 0 || environments.get(gl) !== entry) return;
        environments.delete(gl); entry.target.dispose();
      });
    };
  }, [gl, entry]);
  return entry.target;
}

/** Disposes every texture, material and geometry in a resource set on replacement or unmount. */
export function useDisposeResources(resources: Record<string, Record<string, unknown>>) {
  useEffect(() => () => {
    const each = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(each);
      else if (value && typeof (value as { dispose?: () => void }).dispose === "function") (value as { dispose: () => void }).dispose();
    };
    Object.values(resources).forEach(group => Object.values(group).forEach(each));
  }, [resources]);
}

/** Reflections follow the room lights, so chrome does not glow in safelight-only darkness. */
export function useRoomReflections(materials: Record<string, THREE.Material | THREE.Material[]>, roomBrightness: number) {
  useEffect(() => {
    const intensity = .02 + .6 * roomBrightness;
    Object.values(materials).flat().forEach(material => { if (material instanceof THREE.MeshStandardMaterial && material.envMap) material.envMapIntensity = intensity; });
  }, [materials, roomBrightness]);
}
