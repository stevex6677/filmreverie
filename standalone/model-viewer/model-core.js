import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as mamiya from './profiles/mamiya.js';

// The shelf and inspection stage share decoded geometry/materials. Clones own
// only their transforms; disposing a stage must not dispose this shared asset.
const models = new Map();
export function loadModel(url, profile = 'default') {
  const key = `${profile}:${url}`;
  if (!models.has(key)) {
    const promise = new GLTFLoader().loadAsync(url).then(gltf => {
      gltf.scene.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (profile === 'mamiya') mamiya.prepareMesh(mesh);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material.map) material.map.anisotropy = 4;
        }
      });
      return gltf.scene;
    }).catch(error => { models.delete(key); throw error; });
    models.set(key, promise);
  }
  return models.get(key);
}

export function mountModel(source, rotation = [0, 0, 0], width) {
  const oriented = new THREE.Group();
  oriented.add(source.clone(true));
  oriented.rotation.set(...rotation);
  const bounds = new THREE.Box3().setFromObject(oriented);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0)) throw new Error('Model has no measurable geometry');
  const scale = width === undefined ? 2.05 / Math.max(size.x, size.y, size.z) : width / size.x;
  const mount = new THREE.Group();
  mount.add(oriented); mount.scale.setScalar(scale);
  oriented.position.sub(bounds.getCenter(new THREE.Vector3()));
  return { object: mount, size: size.multiplyScalar(scale), scale };
}

export function studioEnvironment(renderer) {
  const w = 512, h = 256, data = new Float32Array(w * h * 4);
  const lobes = [
    { d: new THREE.Vector3(-.7, .65, 1).normalize(), width: .4, power: 5 },
    { d: new THREE.Vector3(1, .4, -.5).normalize(), width: .4, power: 3 },
    { d: new THREE.Vector3(.1, 1, .1).normalize(), width: .55, power: 1.7 },
  ];
  const v = new THREE.Vector3();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const phi = x / w * Math.PI * 2, theta = y / h * Math.PI;
    v.set(-Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    let value = .14 + .18 * Math.max(0, v.y);
    for (const l of lobes) value += l.power * Math.exp(-(1 - v.dot(l.d)) / l.width ** 2);
    const i = (y * w + x) * 4; data[i] = value; data[i + 1] = value; data[i + 2] = value * 1.015; data[i + 3] = 1;
  }
  const env = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  env.mapping = THREE.EquirectangularReflectionMapping; env.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer), target = pmrem.fromEquirectangular(env);
  env.dispose(); pmrem.dispose();
  return target;
}

export function orbitControls(camera, canvas, min = 1.15, max = 9) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .09;
  controls.minDistance = min; controls.maxDistance = max;
  controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  controls.autoRotateSpeed = .7; controls.screenSpacePanning = true;
  controls.touches.ONE = THREE.TOUCH.ROTATE; controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  return controls;
}

export const viewDirections = {
  home: [1.7, 1.5, 3.2], front: [0, 0, 1], rear: [0, 0, -1],
  left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, .0001], bottom: [0, -1, .0001],
};

export function fittedDistance(size, aspect, fov = 34) {
  // Bounding sphere keeps all orientations inside both frustum dimensions.
  const halfAngle = Math.atan(Math.tan(fov * Math.PI / 360) * Math.min(1, aspect));
  return size.length() / 2 / Math.sin(halfAngle) * 1.08;
}
