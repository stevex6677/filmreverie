import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, CAMERA_SHELF_TARGET, SHELF_HEIGHT, SHELF_ORIGIN, mm } from '../data/physicalScale';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import type { TourTagId } from './tourSteps';

/** Where each tag points, in room coordinates: the top of the shelf and cabinet, the centre of the table. */
const ANCHORS: Record<TourTagId, [number, number, number]> = {
  shelf: [0, SHELF_ORIGIN[1] + SHELF_HEIGHT / 2, SHELF_ORIGIN[2]],
  table: [0, TABLE_SURFACE_Y, TABLE_CENTER_Z + .15],
  cabinet: [CAMERA_SHELF_TARGET[0], CAMERA_SHELF_ORIGIN[1] + mm(CAMERA_SHELF_MM.height), CAMERA_SHELF_ORIGIN[2]],
};

/** Tag elements rendered by the tour overlay, positioned here from the live camera. */
export const tourTagElements = new Map<TourTagId, HTMLElement>();

export function TourAnchors() {
  const { camera, gl } = useThree();
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const canvas = gl.domElement.getBoundingClientRect();
    for (const [id, element] of tourTagElements) {
      point.set(...ANCHORS[id]).project(camera);
      const x = canvas.left + (point.x + 1) / 2 * canvas.width, y = canvas.top + (1 - point.y) / 2 * canvas.height;
      // Tags hang above their point, so the point must leave room for the card.
      const onscreen = point.z < 1 && x > canvas.left + 40 && x < canvas.right - 40 && y > canvas.top + 140 && y < canvas.bottom;
      element.dataset.onscreen = String(onscreen);
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  });
  return null;
}
