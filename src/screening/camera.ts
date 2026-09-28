import * as THREE from 'three';
import { tableCameraPose } from '../utils/tableCamera';
import { DEFAULT_FOV, type CameraPose } from './timeline';

/** Place a perspective camera at a screening pose. Used by the rig and by snapshot renders. */
export function applyScreeningPose(camera: THREE.PerspectiveCamera, pose: CameraPose) {
  const orbit = tableCameraPose(pose.zoom, pose.pan, { tilt: pose.tilt, yaw: pose.yaw });
  const lift = pose.height ?? 0;
  camera.position.set(orbit.position[0], orbit.position[1] + lift, orbit.position[2]);
  camera.up.set(...orbit.up);
  camera.lookAt(orbit.target[0], orbit.target[1] + lift, orbit.target[2]);
  if (pose.roll) camera.rotateZ(pose.roll);
  camera.fov = pose.fov ?? DEFAULT_FOV;
  camera.near = Math.min(.04, pose.zoom * .025);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
