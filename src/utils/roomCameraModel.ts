import { BufferGeometry, Group, Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Static shelf presentation only. Keep the shared source and inspection's
// transmission materials untouched: tiny lens elements must not force an
// additional full-darkroom transmission pass on every room drag.
export function roomCameraModel(source: Object3D, environment: Texture) {
  const object = new Group(), materials = new Map<Material, MeshStandardMaterial>();
  const geometries: BufferGeometry[] = [];
  const batches = new Map<string, { material: MeshStandardMaterial; parts: BufferGeometry[] }>();
  const adapt = (sourceMaterial: Material) => {
    if (!materials.has(sourceMaterial)) {
      const material = sourceMaterial.clone() as MeshPhysicalMaterial;
      material.envMap = environment; material.envMapIntensity = .65;
      if (material.transmission > 0) {
        material.transmission = 0;
        material.transparent = true; material.opacity = .28; material.depthWrite = false;
        material.color.set('#244050'); material.metalness = 1; material.roughness = .12; material.envMapIntensity = .5;
      }
      materials.set(sourceMaterial, material);
    }
    return materials.get(sourceMaterial)!;
  };
  const add = (geometry: BufferGeometry, material: Material | Material[]) => {
    const mesh = new Mesh(geometry, material); mesh.raycast = () => {};
    object.add(mesh); geometries.push(geometry);
  };
  source.updateMatrixWorld(true);
  source.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const geometry: BufferGeometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    if (Array.isArray(node.material)) { add(geometry, node.material.map(adapt)); return; }
    const material = adapt(node.material);
    // Keep transparent optical layers separate for correct depth sorting.
    if (material.transparent) { add(geometry, material); return; }
    const attributes = Object.entries(geometry.attributes).map(([key, value]) => `${key}:${value.itemSize}:${value.normalized}`).sort().join(',');
    const key = `${material.uuid}:${!!geometry.index}:${attributes}`;
    if (!batches.has(key)) batches.set(key, { material, parts: [] });
    batches.get(key)!.parts.push(geometry);
  });
  for (const { material, parts } of batches.values()) {
    const merged = mergeGeometries(parts);
    if (merged) { parts.forEach(part => part.dispose()); add(merged, material); }
    else parts.forEach(part => add(part, material));
  }
  return { object, dispose: () => { geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); } };
}
