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

export const DEFAULT_CAMERA_BOUNDS: CameraBounds = {
  minYaw: -0.42,  // ~ -24 deg (restrained room orbit)
  maxYaw: 0.42,   // ~ +24 deg
  minPitch: 0.06, // ~ 3.5 deg (comfortably above workbench/floor)
  maxPitch: 0.34, // ~ 19.5 deg (restrained elevation)
  minDistance: 3.2,
  maxDistance: 4.2,
};

export const DEFAULT_ROOM_POSE: RoomCameraPose = {
  yaw: 0.20,     // ~11.5 deg gentle 3/4 architectural perspective
  pitch: 0.16,   // ~9.2 deg eye-level elevation
  distance: 3.75, // genuine room overview showing table, bench, legs, floor, and safelight
};

export const INSPECT_CAMERA_POSITION: [number, number, number] = [0, 0, 3.2];
export const INSPECT_CAMERA_TARGET: [number, number, number] = [0, 0, 0];

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
