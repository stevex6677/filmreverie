export interface RoomCameraPose {
  yaw: number; // horizontal azimuth angle in radians
  pitch: number; // vertical elevation angle in radians
  distance: number; // distance from target in world units
}

export interface CameraBounds {
  minYaw: number;
  maxYaw: number;
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
}

// Flat light table coordinates on workbench
export const TABLE_SURFACE_Y = -0.72; // Illuminated table surface resting flat on workbench
export const TABLE_CENTER_Z = -0.10;  // Centered front-to-back on workbench top

// Room envelope and immobile standing eye, shared by geometry and camera.
export const ROOM_ENVELOPE = { width: 7.6, front: -1.1, back: 6.8, floor: -1.7, ceiling: 3.15 };
export const DEFAULT_CAMERA_BOUNDS: CameraBounds = {
  minYaw: -Infinity, maxYaw: Infinity,
  minPitch: -85 * Math.PI / 180, maxPitch: 85 * Math.PI / 180,
  minDistance: 3.5, maxDistance: 3.5,
};
export const DEFAULT_ROOM_POSE: RoomCameraPose = { yaw: .18, pitch: .28, distance: 3.5 };
export const ROOM_CAMERA_FOV = 60;
export const ROOM_EYE: [number, number, number] = [
  3.5 * Math.cos(.28) * Math.sin(.18),
  -.78 + 3.5 * Math.sin(.28),
  TABLE_CENTER_Z + 3.5 * Math.cos(.28) * Math.cos(.18),
];
export function roomLookTarget(pose: RoomCameraPose): [number, number, number] {
  const { yaw, pitch } = clampRoomPose(pose);
  return [ROOM_EYE[0] - Math.cos(pitch) * Math.sin(yaw), ROOM_EYE[1] - Math.sin(pitch), ROOM_EYE[2] - Math.cos(pitch) * Math.cos(yaw)];
}

export const INSPECT_CAMERA_DISTANCE = 3.2;
export const MIN_INSPECT_DISTANCE = 0.32; // Allows zooming up to 1000% (3.2m / 0.32m = 10x)
export const MAX_INSPECT_DISTANCE = 3.6;
export const DEFAULT_INSPECT_DISTANCE = 3.2;

export const MIN_TABLE_BRIGHTNESS = 0.3;
export const MAX_TABLE_BRIGHTNESS = 1.0;
export const DEFAULT_TABLE_BRIGHTNESS = 1.0;

export const MIN_TABLE_PAN_X = -1.4;
export const MAX_TABLE_PAN_X = 1.4;
export const MIN_TABLE_PAN_Z = TABLE_CENTER_Z - 0.5;
export const MAX_TABLE_PAN_Z = TABLE_CENTER_Z + 0.5;

export const INSPECT_CAMERA_POSITION: [number, number, number] = [
  0,
  TABLE_SURFACE_Y + INSPECT_CAMERA_DISTANCE,
  TABLE_CENTER_Z,
];
export const INSPECT_CAMERA_UP: [number, number, number] = [0, 0, -1];
export const ROOM_CAMERA_UP: [number, number, number] = [0, 1, 0];
export const INSPECT_CAMERA_TARGET: [number, number, number] = [0, TABLE_SURFACE_Y, TABLE_CENTER_Z];
export const ROOM_CAMERA_TARGET: [number, number, number] = [0, -0.78, TABLE_CENTER_Z];

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function clampRoomPose(
  pose: RoomCameraPose,
  bounds: CameraBounds = DEFAULT_CAMERA_BOUNDS
): RoomCameraPose {
  return {
    yaw: Number.isFinite(pose.yaw) ? pose.yaw : DEFAULT_ROOM_POSE.yaw,
    pitch: clamp(Number.isFinite(pose.pitch) ? pose.pitch : DEFAULT_ROOM_POSE.pitch, bounds.minPitch, bounds.maxPitch),
    distance: DEFAULT_ROOM_POSE.distance,
  };
}

export function sphericalToCartesian(
  pose: RoomCameraPose,
  target: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  const safePose = clampRoomPose(pose);
  const x = target[0] + safePose.distance * Math.cos(safePose.pitch) * Math.sin(safePose.yaw);
  const y = target[1] + safePose.distance * Math.sin(safePose.pitch);
  const z = target[2] + safePose.distance * Math.cos(safePose.pitch) * Math.cos(safePose.yaw);
  return [x, y, z];
}

export function clampInspectZoom(distance: number): number {
  return clamp(distance, MIN_INSPECT_DISTANCE, MAX_INSPECT_DISTANCE);
}

export function clampInspectPan(x: number, z: number): { x: number; z: number } {
  return {
    x: clamp(x, MIN_TABLE_PAN_X, MAX_TABLE_PAN_X),
    z: clamp(z, MIN_TABLE_PAN_Z, MAX_TABLE_PAN_Z),
  };
}

export function clampTableBrightness(val: number): number {
  return clamp(val, MIN_TABLE_BRIGHTNESS, MAX_TABLE_BRIGHTNESS);
}
