import * as THREE from 'three';
import { TABLE_SURFACE_Y } from './cameraBounds';

export interface TableAngle { tilt: number; yaw: number }
export const TOP_DOWN: TableAngle = { tilt: 0, yaw: 0 };
export const MAX_TABLE_TILT = 50 * Math.PI / 180;
export const MAX_TABLE_YAW = 60 * Math.PI / 180;
export function clampTableAngle(angle: TableAngle): TableAngle {
  return {
    tilt: Math.max(0, Math.min(MAX_TABLE_TILT, angle.tilt)),
    yaw: Math.max(-MAX_TABLE_YAW, Math.min(MAX_TABLE_YAW, angle.yaw)),
  };
}

/** A move across the screen (right, up) as a move on the table (x, film y) for a camera heading. */
export function screenToTable(yaw: number, right: number, up: number) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return { x: right * cos - up * sin, y: right * sin + up * cos };
}

/** Orbit the viewed point, with a continuous orientation even at the zenith. */
export function tableCameraPose(distance: number, pan: { x: number; z: number }, angle: TableAngle) {
  const { tilt, yaw } = angle;
  const sin = Math.sin(tilt), cos = Math.cos(tilt);
  return {
    position: [pan.x + distance * sin * Math.sin(yaw), TABLE_SURFACE_Y + distance * cos, pan.z + distance * sin * Math.cos(yaw)] as [number, number, number],
    up: [-cos * Math.sin(yaw), sin, -cos * Math.cos(yaw)] as [number, number, number],
    target: [pan.x, TABLE_SURFACE_Y, pan.z] as [number, number, number],
  };
}

export function tablePointAt(camera: THREE.Camera, canvas: HTMLCanvasElement, x: number, y: number, height = TABLE_SURFACE_Y) {
  const rect = canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), camera);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
}

/** A camera built from logical state keeps consecutive touch events cumulative. */
export function tableInputCamera(zoom: number, pan: { x: number; z: number }, angle: TableAngle, aspect: number) {
  const camera = new THREE.PerspectiveCamera(45, aspect, .001, 50);
  const pose = tableCameraPose(zoom, pan, angle);
  camera.position.set(...pose.position);
  camera.up.set(...pose.up);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  return camera;
}
