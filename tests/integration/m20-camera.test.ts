import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Box3, Mesh, MeshPhysicalMaterial, Ray, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mountModel, fittedDistance } from '../../standalone/model-viewer/model-core.js';
import { PRIMARY_CAMERA } from '../../src/data/cameras';
import { mm, CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, CAMERA_SHELF_SLOTS, SHELF_HEIGHT, SHELF_ORIGIN, CAMERA_PRESENTATION_YAW } from '../../src/data/physicalScale';
import { roomCameraModel } from '../../src/utils/roomCameraModel';
import { ROOM_EYE, ROOM_ENVELOPE, DEFAULT_ROOM_POSE } from '../../src/utils/cameraBounds';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';
import { roomRayTarget } from '../../src/utils/roomHitTarget';
import current from '../../blender/mamiya_universal/CURRENT.json';

describe('M20 current camera and physical shelf', () => {
  it('loads the actual current GLB geometry and fits a uniformly scaled 210 mm assembly', async () => {
    const bytes = readFileSync(`public${PRIMARY_CAMERA.url}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(current.browser_glb.sha256);
    expect(PRIMARY_CAMERA.asset).toBe(current.browser_glb.path);
    expect(current.browser_glb.source_blend_sha256).toBe(current.editable_blend.sha256);
    // Node has no image decoder. Keep the real geometry/node transforms and
    // binary buffers, omitting only materials; browser tests render all textures.
    const jsonLength = bytes.readUInt32LE(12);
    const data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    data.images = []; data.textures = []; data.materials = [];
    for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    data.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + jsonLength).toString('base64')}`;
    if (!globalThis.ProgressEvent) Object.assign(globalThis, { ProgressEvent: class { constructor(public type: string) {} } });
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify(data), '');
    const original = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    const mounted = mountModel(gltf.scene, PRIMARY_CAMERA.rotation, mm(210));
    expect(mounted.size.x).toBeCloseTo(.756, 8);
    expect(mounted.size.y / mounted.size.x).toBeCloseTo(original.y / original.x, 8);
    expect(mounted.size.z / mounted.size.x).toBeCloseTo(original.z / original.x, 8);
    expect(mounted.size.y + mm(22)).toBeLessThan(mm(CAMERA_SHELF_MM.height / CAMERA_SHELF_MM.tiers));
    const rotatedDepth = mounted.size.z * Math.cos(CAMERA_PRESENTATION_YAW) + mounted.size.x * Math.abs(Math.sin(CAMERA_PRESENTATION_YAW));
    expect(rotatedDepth + mm(20)).toBeLessThan(mm(CAMERA_SHELF_MM.depth));
    expect(CAMERA_SHELF_SLOTS[0].z - rotatedDepth / 2).toBeGreaterThan(mm(7)); // clear the backing
    expect(CAMERA_SHELF_SLOTS[0].z + rotatedDepth / 2).toBeLessThan(mm(CAMERA_SHELF_MM.depth));
    expect(mounted.object.scale.x).toBe(mounted.object.scale.y);
    expect(mounted.object.scale.y).toBe(mounted.object.scale.z);
    for (const aspect of [.46, 1.5, 2]) expect(fittedDistance(mounted.size, aspect)).toBeGreaterThan(mounted.size.length() / 2);
    expect(PRIMARY_CAMERA.introduced).toBe(1969); expect(PRIMARY_CAMERA.manufactured).toBeNull();
    expect(CAMERA_SHELF_SLOTS).toHaveLength(6);
    for (const slot of CAMERA_SHELF_SLOTS) {
      expect(Math.abs(slot.x) + mounted.size.x / 2 + mm(18)).toBeLessThan(mm(CAMERA_SHELF_MM.width / 2));
    }
    const sourceMeshes: Mesh[] = [];
    mounted.object.traverse(node => { if (node instanceof Mesh) sourceMeshes.push(node); });
    const opaque = new MeshPhysicalMaterial(), glass = new MeshPhysicalMaterial({ transmission: 1 });
    sourceMeshes.forEach((mesh, index) => { mesh.material = index < 3 ? glass : opaque; });
    const environment = new Texture(), presentation = roomCameraModel(mounted.object, environment);
    const size = new Box3().setFromObject(presentation.object).getSize(new Vector3());
    for (const axis of ['x', 'y', 'z'] as const) expect(size[axis]).toBeCloseTo(mounted.size[axis], 6);
    const triangles = (meshes: Mesh[]) => meshes.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0);
    expect(triangles(presentation.object.children as Mesh[])).toBe(triangles(sourceMeshes));
    expect(presentation.object.children.length).toBeLessThan(sourceMeshes.length / 2);
    for (const mesh of presentation.object.children as Mesh[]) expect((mesh.material as MeshPhysicalMaterial).transmission).toBe(0);
    expect(glass.transmission).toBe(1); expect(sourceMeshes[0].material).toBe(glass);
    const geometryDisposed = new Set();
    sourceMeshes.forEach(mesh => mesh.geometry.addEventListener('dispose', () => geometryDisposed.add(mesh.geometry)));
    presentation.dispose(); expect(geometryDisposed.size).toBe(0);
    opaque.dispose(); glass.dispose(); environment.dispose();
  });
  it('centers the standing eye and aligns both cabinet tops and bottoms', () => {
    expect(ROOM_EYE[0]).toBe(0);
    expect(ROOM_EYE[2]).toBe((ROOM_ENVELOPE.front + ROOM_ENVELOPE.back) / 2);
    expect(DEFAULT_ROOM_POSE.yaw).toBe(0);
    expect(mm(CAMERA_SHELF_MM.height)).toBe(SHELF_HEIGHT);
    expect(CAMERA_SHELF_ORIGIN[1]).toBeCloseTo(SHELF_ORIGIN[1] - SHELF_HEIGHT / 2);
    expect(CAMERA_SHELF_ORIGIN[1] + mm(CAMERA_SHELF_MM.height)).toBeCloseTo(SHELF_ORIGIN[1] + SHELF_HEIGHT / 2);
    expect(CAMERA_SHELF_ORIGIN[0] + mm(7)).toBeCloseTo(ROOM_ENVELOPE.width / 2);
    expect(CAMERA_SHELF_ORIGIN[0] - mm(CAMERA_SHELF_MM.depth)).toBeGreaterThanOrEqual(3.22 - .82 / 2); // no closer than the opposite bench edge
    expect(ROOM_ENVELOPE.back - .65 - .82 / 2 - (CAMERA_SHELF_ORIGIN[2] + mm(CAMERA_SHELF_MM.width / 2))).toBeGreaterThan(mm(150)); // clear gap to rear developing bench
  });
  it('returns the nearest physical shelf for a ray directed at the right wall', () => {
    const [x, y, z] = CAMERA_SHELF_ORIGIN;
    expect(roomRayTarget(new Ray(new Vector3(0, y + .4, z), new Vector3(1, 0, 0)), { width: 4, height: 2 })).toBe('camera');
    expect(x).toBeLessThan(3.8);
  });
  it('preserves table details and room heading through inspection, reversal, and shelf switches', () => {
    const initial = createInitialViewerState('inspect');
    const table = viewerReducer(initial, { type: 'OPEN_FRAME', frameIndex: 2 });
    const shelf = viewerReducer(table, { type: 'APPROACH_CAMERA_SHELF' });
    expect(shelf.shelfId).toBe('camera'); expect(shelf.shelfFocused).toBe(true);
    expect(viewerReducer(shelf, { type: 'LOOK_ROOM', yaw: 1, pitch: 1 }).savedRoomPose).toEqual(table.savedRoomPose);
    const display = viewerReducer(shelf, { type: 'OPEN_CAMERA', id: PRIMARY_CAMERA.id });
    expect(display.cameraDisplay).toBe(PRIMARY_CAMERA.id);
    const back = viewerReducer(display, { type: 'CLOSE_CAMERA' });
    const restored = viewerReducer(back, { type: 'APPROACH_TABLE' });
    for (const field of ['roll', 'inspectZoom', 'inspectPan', 'focusMode', 'activeFrameIndex', 'savedOverview', 'tableBrightness', 'filmStockId', 'savedRoomPose'] as const) expect(restored[field]).toEqual(table[field]);
    const filmShelf = viewerReducer(shelf, { type: 'APPROACH_SHELF' });
    expect(filmShelf.shelfId).toBe('film'); expect(filmShelf.cameraDisplay).toBeNull();
    const reversed = viewerReducer(shelf, { type: 'RETURN_TO_ROOM' });
    expect(reversed.shelfId).toBeNull(); expect(reversed.transitionKind).toBe('shelf');
  });
});
