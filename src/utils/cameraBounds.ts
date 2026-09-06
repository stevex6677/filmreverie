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
  minYaw: -0.65, // ~ -37 deg
  maxYaw: 0.65,  // ~ +37 deg
  minPitch: 0.35, // ~ 20 deg
  maxPitch: 0.95, // ~ 54 deg
  minDistance: 2.4,
  maxDistance: 3.8,
};

export const DEFAULT_ROOM_POSE: RoomCameraPose = {
  yaw: 0.0,
  pitch: 0.55,
  distance: 3.1,
};

export const INSPECT_CAMERA_POSITION: [number, number, number] = [0, 0, 2.8];
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
