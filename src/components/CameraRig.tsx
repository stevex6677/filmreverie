import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  DEFAULT_INSPECT_DISTANCE,
  INSPECT_CAMERA_UP,
  ROOM_CAMERA_TARGET,
  ROOM_CAMERA_UP,
  TABLE_CENTER_Z,
  TABLE_SURFACE_Y,
  RoomCameraPose,
  sphericalToCartesian,
} from "../utils/cameraBounds";
import { RoomMode } from "../state/viewerState";

interface CameraRigProps {
  roomMode: RoomMode;
  isTransitioning: boolean;
  savedRoomPose: RoomCameraPose;
  inspectZoom?: number;
  inspectPan?: { x: number; z: number };
  isLoupeActive?: boolean;
  onUpdateRoomPose: (pose: Partial<RoomCameraPose>) => void;
  onCameraMotion?: (moving: boolean) => void;
  onZoomAt?: (delta: number, x: number, z: number) => void;
  onAdjustInspectZoom?: (delta: number) => void;
  onAdjustInspectPan?: (dx: number, dz: number) => void;
  onTransitionComplete: () => void;
  isDeterministic?: boolean;
  isReducedMotion?: boolean;
}

export const CameraRig: React.FC<CameraRigProps> = ({
  roomMode,
  isTransitioning,
  savedRoomPose,
  inspectZoom = DEFAULT_INSPECT_DISTANCE,
  inspectPan = { x: 0, z: TABLE_CENTER_Z },
  isLoupeActive = false,
  onUpdateRoomPose,
  onCameraMotion,
  onZoomAt,
  onAdjustInspectZoom,
  onAdjustInspectPan,
  onTransitionComplete,
  isDeterministic = false,
  isReducedMotion = false,
}) => {
  const { camera, gl } = useThree();
  const isDraggingRoomRef = useRef(false);
  const isPanningTableRef = useRef(false);
  const isSpacePressedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, yaw: 0, pitch: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Compute desired camera position, up vector, and look target based on mode
  const targetPos = useRef(new THREE.Vector3());
  const targetUp = useRef(new THREE.Vector3(...ROOM_CAMERA_UP));
  const lookTarget = useRef(new THREE.Vector3(...ROOM_CAMERA_TARGET));
  const desiredLookTarget = useRef(new THREE.Vector3(...ROOM_CAMERA_TARGET));

  const maxDragDistRef = useRef(0);
  const wasMovingRef = useRef(false);

  // Spacebar tracking for table pan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        isSpacePressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpacePressedRef.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Wheel zoom in inspect mode
  useEffect(() => {
    const canvas = gl.domElement;
    const handleWheel = (e: WheelEvent) => {
      if (roomMode !== "inspect" || isTransitioning) return;
      e.preventDefault();
      if (onAdjustInspectZoom) {
        // Proportional step scaling: micro-steps when zoomed in, large steps when zoomed out
        const step = Math.min(0.35, Math.max(0.025, inspectZoom * 0.085));
        const zoomDelta = Math.sign(e.deltaY) * step;
        if (onZoomAt) {
          const rect = canvas.getBoundingClientRect();
          const ray = new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
          const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_SURFACE_Y), new THREE.Vector3());
          if (point) onZoomAt(zoomDelta, point.x, point.z);
        } else onAdjustInspectZoom(zoomDelta);
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [gl, roomMode, isTransitioning, inspectZoom, onAdjustInspectZoom, onZoomAt, camera]);

  // Pointer drag for room orbit or table pan
  useEffect(() => {
    const canvas = gl.domElement;

    const handleContextMenu = (e: MouseEvent) => {
      if (roomMode === "inspect") {
        e.preventDefault();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (isTransitioning) return;

      if (roomMode === "room") {
        // Orbit room with primary button
        if (e.button !== 0) return;
        isDraggingRoomRef.current = true;
        maxDragDistRef.current = 0;
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          yaw: savedRoomPose.yaw,
          pitch: savedRoomPose.pitch,
        };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {}
      } else if (roomMode === "inspect") {
        // Pan table on right-click (button 2), middle-click (button 1), Space+left-click, or left-click when loupe is not active
        const isPanButton =
          e.button === 2 ||
          e.button === 1 ||
          (e.button === 0 && (isSpacePressedRef.current || !isLoupeActive));

        if (isPanButton) {
          isPanningTableRef.current = true;
          maxDragDistRef.current = 0;
          panStartRef.current = { x: e.clientX, y: e.clientY };
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {}
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isTransitioning) return;

      if (roomMode === "room" && isDraggingRoomRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDragDistRef.current) {
          maxDragDistRef.current = dist;
        }

        const sensitivity = 0.0035;
        const newYaw = dragStartRef.current.yaw - dx * sensitivity;
        const newPitch = dragStartRef.current.pitch + dy * sensitivity;

        onUpdateRoomPose({ yaw: newYaw, pitch: newPitch });
      } else if (roomMode === "inspect" && isPanningTableRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        maxDragDistRef.current += Math.hypot(dx, dy);
        panStartRef.current = { x: e.clientX, y: e.clientY };

        if (onAdjustInspectPan) {
          // World units per pixel based on camera distance and vertical FOV (45 deg)
          const fovRad = (45 * Math.PI) / 180;
          const heightWorld = 2 * inspectZoom * Math.tan(fovRad / 2);
          const worldPerPixel = heightWorld / Math.max(1, canvas.clientHeight);

          // Moving mouse right/down pushes camera left/up (natural grab-and-drag feel)
          const dWorldX = -dx * worldPerPixel;
          const dWorldZ = -dy * worldPerPixel;
          onAdjustInspectPan(dWorldX, dWorldZ);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingRoomRef.current) {
        isDraggingRoomRef.current = false;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
      if (isPanningTableRef.current) {
        isPanningTableRef.current = false;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      // If user was dragging (> 6px movement), suppress mesh click
      if (maxDragDistRef.current > 6) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        maxDragDistRef.current = 0;
      }
    };

    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("click", handleClickCapture, true);

    return () => {
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("click", handleClickCapture, true);
    };
  }, [
    gl,
    roomMode,
    isTransitioning,
    savedRoomPose,
    inspectZoom,
    isLoupeActive,
    onUpdateRoomPose,
    onAdjustInspectPan,
  ]);

  // Animate camera position and orientation
  useFrame((_, delta) => {
    const desiredTarget: [number, number, number] =
      roomMode === "inspect"
        ? [inspectPan.x, TABLE_SURFACE_Y, inspectPan.z]
        : ROOM_CAMERA_TARGET;
    const [rx, ry, rz] =
      roomMode === "inspect"
        ? [inspectPan.x, TABLE_SURFACE_Y + inspectZoom, inspectPan.z]
        : sphericalToCartesian(savedRoomPose, ROOM_CAMERA_TARGET);
    targetPos.current.set(rx, ry, rz);
    const moving = !isDeterministic && !isReducedMotion && (camera.position.distanceTo(targetPos.current) > .001 || isPanningTableRef.current);
    if (moving !== wasMovingRef.current) { wasMovingRef.current = moving; onCameraMotion?.(moving); }

    const desiredUp = roomMode === "inspect" ? INSPECT_CAMERA_UP : ROOM_CAMERA_UP;
    targetUp.current.set(...desiredUp);
    desiredLookTarget.current.set(...desiredTarget);

    if (isDeterministic || isReducedMotion) {
      camera.position.copy(targetPos.current);
      camera.up.copy(targetUp.current);
      lookTarget.current.copy(desiredLookTarget.current);
      camera.lookAt(lookTarget.current);
      if (isTransitioning) {
        onTransitionComplete();
      }
      return;
    }

    // Smooth camera transition
    const speed = isTransitioning ? 7.0 : 12.0;
    camera.position.lerp(targetPos.current, Math.min(1.0, delta * speed));
    camera.up.lerp(targetUp.current, Math.min(1.0, delta * speed)).normalize();
    lookTarget.current.lerp(desiredLookTarget.current, Math.min(1.0, delta * speed));
    camera.lookAt(lookTarget.current);

    if (isTransitioning) {
      const dist = camera.position.distanceTo(targetPos.current);
      if (dist < 0.015) {
        camera.position.copy(targetPos.current);
        camera.up.copy(targetUp.current);
        lookTarget.current.copy(desiredLookTarget.current);
        onTransitionComplete();
      }
    }
  });

  return null;
};
