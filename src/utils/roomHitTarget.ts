import { Box3, Camera, Ray, Raycaster, Vector2, Vector3 } from 'three';
import { mm, SHELF_CELL_MM, SHELF_HEIGHT, SHELF_ORIGIN, SHELF_WIDTH, CAMERA_SHELF_ORIGIN, CAMERA_SHELF_MM } from '../data/physicalScale';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from './cameraBounds';

// HTML shelf labels can overlap the table in perspective. Resolve the nearest
// physical surface, never the overlay's rectangular screen bounds.
export function roomRayTarget(ray: Ray, table: { width: number; height: number }): 'table' | 'shelf' | 'camera' | null {
  const tableHit = ray.intersectBox(new Box3(
    new Vector3(-table.width / 2, TABLE_SURFACE_Y - .08, TABLE_CENTER_Z - table.height / 2),
    new Vector3(table.width / 2, TABLE_SURFACE_Y + .002, TABLE_CENTER_Z + table.height / 2),
  ), new Vector3());
  const shelfHit = ray.intersectBox(new Box3(
    new Vector3(-SHELF_WIDTH / 2, SHELF_ORIGIN[1] - SHELF_HEIGHT / 2, SHELF_ORIGIN[2] - mm(SHELF_CELL_MM.depth / 2)),
    new Vector3(SHELF_WIDTH / 2, SHELF_ORIGIN[1] + SHELF_HEIGHT / 2, SHELF_ORIGIN[2] + mm(SHELF_CELL_MM.depth / 2)),
  ), new Vector3());
  const [x, y, z] = CAMERA_SHELF_ORIGIN;
  const cameraHit = ray.intersectBox(new Box3(new Vector3(x - mm(CAMERA_SHELF_MM.depth), y, z - mm(CAMERA_SHELF_MM.width / 2)), new Vector3(x, y + mm(CAMERA_SHELF_MM.height), z + mm(CAMERA_SHELF_MM.width / 2))), new Vector3());
  const hits = [{ kind: 'table' as const, point: tableHit }, { kind: 'shelf' as const, point: shelfHit }, { kind: 'camera' as const, point: cameraHit }];
  return hits.filter(hit => hit.point).sort((a, b) => a.point!.distanceToSquared(ray.origin) - b.point!.distanceToSquared(ray.origin))[0]?.kind ?? null;
}

export function roomHitTarget(camera: Camera, canvas: HTMLCanvasElement, x: number, y: number, table: { width: number; height: number }) {
  const rect = canvas.getBoundingClientRect(), ray = new Raycaster();
  ray.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), camera);
  return roomRayTarget(ray.ray, table);
}
