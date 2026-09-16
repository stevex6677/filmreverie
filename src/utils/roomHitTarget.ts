import { Box3, Camera, Ray, Raycaster, Vector2, Vector3 } from 'three';
import { mm, SHELF_CELL_MM, SHELF_HEIGHT, SHELF_ORIGIN, SHELF_WIDTH } from '../data/physicalScale';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from './cameraBounds';

// HTML shelf labels can overlap the table in perspective. Resolve the nearest
// physical surface, never the overlay's rectangular screen bounds.
export function roomRayTarget(ray: Ray, table: { width: number; height: number }): 'table' | 'shelf' | null {
  const tableHit = ray.intersectBox(new Box3(
    new Vector3(-table.width / 2, TABLE_SURFACE_Y - .08, TABLE_CENTER_Z - table.height / 2),
    new Vector3(table.width / 2, TABLE_SURFACE_Y + .002, TABLE_CENTER_Z + table.height / 2),
  ), new Vector3());
  const shelfHit = ray.intersectBox(new Box3(
    new Vector3(-SHELF_WIDTH / 2, SHELF_ORIGIN[1] - SHELF_HEIGHT / 2, SHELF_ORIGIN[2] - mm(SHELF_CELL_MM.depth / 2)),
    new Vector3(SHELF_WIDTH / 2, SHELF_ORIGIN[1] + SHELF_HEIGHT / 2, SHELF_ORIGIN[2] + mm(SHELF_CELL_MM.depth / 2)),
  ), new Vector3());
  if (tableHit && (!shelfHit || tableHit.distanceToSquared(ray.origin) < shelfHit.distanceToSquared(ray.origin))) return 'table';
  return shelfHit ? 'shelf' : null;
}

export function roomHitTarget(camera: Camera, canvas: HTMLCanvasElement, x: number, y: number, table: { width: number; height: number }) {
  const rect = canvas.getBoundingClientRect(), ray = new Raycaster();
  ray.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), camera);
  return roomRayTarget(ray.ray, table);
}
