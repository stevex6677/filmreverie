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

export const DEFAULT_CAMERA_BOUNDS: CameraBounds = {
  minYaw: -0.42,  // ~ -24 deg (restrained room orbit)
  maxYaw: 0.42,   // ~ +24 deg
  minPitch: 0.10, // ~ 5.7 deg (comfortably above workbench/floor)
  maxPitch: 0.45, // ~ 25.8 deg (restrained elevation)
  minDistance: 3.0,
  maxDistance: 4.2,
};

export const DEFAULT_ROOM_POSE: RoomCameraPose = {
  yaw: 0.18,     // ~10.3 deg gentle 3/4 architectural perspective
  pitch: 0.28,   // ~16 deg natural standing eye-level downward gaze toward flat table & workbench
  distance: 3.5, // room overview showing flat table, bench, steel legs, shelf, floor, and safelight
};

export const INSPECT_CAMERA_DISTANCE = 3.2;
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
    yaw: clamp(pose.yaw, bounds.minYaw, bounds.maxYaw),
    pitch: clamp(pose.pitch, bounds.minPitch, bounds.maxPitch),
    distance: clamp(pose.distance, bounds.minDistance, bounds.maxDistance),
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
