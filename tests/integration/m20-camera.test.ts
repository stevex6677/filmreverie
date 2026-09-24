import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Box3, Mesh, MeshPhysicalMaterial, Ray, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { nodeDraco } from '../helpers/draco';
import { mountModel, fittedDistance } from '../../standalone/model-viewer/model-core.js';
import { CAMERAS, PRIMARY_CAMERA } from '../../src/data/cameras';
import { mm, CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, SHELF_HEIGHT, SHELF_ORIGIN, CAMERA_PRESENTATION_YAW, cameraShelfSlot } from '../../src/data/physicalScale';
import { roomCameraModel } from '../../src/utils/roomCameraModel';
import { ROOM_EYE, ROOM_ENVELOPE, DEFAULT_ROOM_POSE } from '../../src/utils/cameraBounds';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';
import { roomRayTarget } from '../../src/utils/roomHitTarget';

describe('M20 current camera and physical shelf', () => {
  it.each([
    ['mamiya-universal', .756],
    ['minolta-autocord', .3024],
    ['canon-7s', .4968],
    ['canon-demi-ee17', .4176],
    ['olympus-om1', .4896],
  ].flatMap(([id, width]) => ['detail', 'shelf'].map(variant => ({ id: String(id), width: Number(width), variant }))))('loads $id $variant geometry at its physical width and fits its cabinet slot', async ({ id, width, variant }) => {
    const index = CAMERAS.findIndex(camera => camera.id === id), entry = CAMERAS[index];
    const bytes = readFileSync(`public${variant === 'shelf' ? entry.shelfUrl : entry.url}`);
    expect(bytes.length).toBeLessThan(variant === 'shelf' ? 1_000_000 : 5_000_000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(variant === 'shelf' ? entry.shelf.sha256 : entry.sha256);
    // Node has no image decoder. Keep the real geometry/node transforms and
    // binary buffers, omitting only materials; browser tests render all textures.
    const jsonLength = bytes.readUInt32LE(12);
    const data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    if (variant === 'shelf') {
      const primitives = data.meshes.flatMap((mesh: any) => mesh.primitives);
      expect(primitives).toHaveLength(1);
      expect(primitives.reduce((sum: number, p: any) => sum + data.accessors[p.indices].count / 3, 0)).toBeLessThan(25_000);
    }
    data.images = []; data.textures = []; data.materials = [];
    for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    data.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + jsonLength).toString('base64')}`;
    if (!globalThis.ProgressEvent) Object.assign(globalThis, { ProgressEvent: class { constructor(public type: string) {} } });
    const gltf = await new GLTFLoader().setDRACOLoader(nodeDraco).parseAsync(JSON.stringify(data), '');
    const original = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    const mounted = mountModel(gltf.scene, entry.rotation, mm(entry.widthMm));
    const measured = new Box3().setFromObject(mounted.object).getSize(new Vector3());
    expect(measured.x).toBeCloseTo(width, 8);
    expect(mounted.size.y / mounted.size.x).toBeCloseTo(original.y / original.x, 8);
    expect(mounted.size.z / mounted.size.x).toBeCloseTo(original.z / original.x, 8);
    expect(mounted.size.y + mm(22)).toBeLessThan(mm(CAMERA_SHELF_MM.height / CAMERA_SHELF_MM.tiers));
    const rotatedDepth = mounted.size.z * Math.cos(CAMERA_PRESENTATION_YAW) + mounted.size.x * Math.abs(Math.sin(CAMERA_PRESENTATION_YAW));
    expect(rotatedDepth + mm(20)).toBeLessThan(mm(CAMERA_SHELF_MM.depth));
    const slot = cameraShelfSlot(index);
    expect(slot.z - rotatedDepth / 2).toBeGreaterThan(mm(7)); // clear the backing
    expect(slot.z + rotatedDepth / 2).toBeLessThan(mm(CAMERA_SHELF_MM.depth));
    expect(mounted.object.scale.x).toBe(mounted.object.scale.y);
    expect(mounted.object.scale.y).toBe(mounted.object.scale.z);
    for (const aspect of [.46, 1.5, 2]) expect(fittedDistance(mounted.size, aspect)).toBeGreaterThan(mounted.size.length() / 2);
    const rotatedWidth = mounted.size.x * Math.cos(CAMERA_PRESENTATION_YAW) + mounted.size.z * Math.abs(Math.sin(CAMERA_PRESENTATION_YAW));
    expect(Math.abs(slot.x) + rotatedWidth / 2 + mm(18)).toBeLessThan(mm(CAMERA_SHELF_MM.width / 2));
    for (const [otherIndex, other] of CAMERAS.entries()) {
      if (otherIndex === index) continue;
      const otherSlot = cameraShelfSlot(otherIndex);
      if (slot.y === otherSlot.y) expect(Math.abs(slot.x - otherSlot.x)).toBeGreaterThan((rotatedWidth + mm(other.widthMm)) / 2);
    }
    const sourceMeshes: Mesh[] = [];
    mounted.object.traverse(node => { if (node instanceof Mesh) sourceMeshes.push(node); });
    for (const mesh of sourceMeshes) {
      const positions = mesh.geometry.attributes.position;
      expect(positions.array.every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.index?.array.every(index => index >= 0 && index < positions.count)).toBe(true);
    }
    const opaque = new MeshPhysicalMaterial(), glass = new MeshPhysicalMaterial({ transmission: 1 });
    sourceMeshes.forEach((mesh, index) => { mesh.material = index < 3 ? glass : opaque; });
    const environment = new Texture(), presentation = roomCameraModel(mounted.object, environment);
    const size = new Box3().setFromObject(presentation.object).getSize(new Vector3());
    // Draco accessor bounds precede quantization. Compare actual decoded vertices
    // when checking that baking world transforms preserves the geometry.
    const decodedSize = new Box3().setFromObject(mounted.object, true).getSize(new Vector3());
    for (const axis of ['x', 'y', 'z'] as const) expect(size[axis]).toBeCloseTo(decodedSize[axis], 6);
    const triangles = (meshes: Mesh[]) => meshes.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0);
    expect(triangles(presentation.object.children as Mesh[])).toBe(triangles(sourceMeshes));
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
