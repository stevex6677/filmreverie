import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  INSPECT_CAMERA_POSITION,
  INSPECT_CAMERA_TARGET,
  RoomCameraPose,
  sphericalToCartesian,
} from "../utils/cameraBounds";
import { RoomMode } from "../state/viewerState";

interface CameraRigProps {
  roomMode: RoomMode;
  isTransitioning: boolean;
  savedRoomPose: RoomCameraPose;
  onUpdateRoomPose: (pose: Partial<RoomCameraPose>) => void;
  onTransitionComplete: () => void;
  isDeterministic?: boolean;
}

export const CameraRig: React.FC<CameraRigProps> = ({
  roomMode,
  isTransitioning,
  savedRoomPose,
  onUpdateRoomPose,
  onTransitionComplete,
  isDeterministic = false,
}) => {
  const { camera, gl } = useThree();
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, yaw: 0, pitch: 0 });

  // Compute desired camera position based on mode
  const targetPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3(...INSPECT_CAMERA_TARGET));

  useEffect(() => {
    if (roomMode === "inspect") {
      targetPos.current.set(...INSPECT_CAMERA_POSITION);
      lookTarget.current.set(...INSPECT_CAMERA_TARGET);
    } else {
      const [rx, ry, rz] = sphericalToCartesian(savedRoomPose, INSPECT_CAMERA_TARGET);
      targetPos.current.set(rx, ry, rz);
      lookTarget.current.set(...INSPECT_CAMERA_TARGET);
    }
  }, [roomMode, savedRoomPose]);

  const maxDragDistRef = useRef(0);

  // Pointer drag for orbit in room mode
  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerDown = (e: PointerEvent) => {
      // Only drag with primary mouse button in room mode when not transitioning
      if (e.button !== 0 || roomMode !== "room" || isTransitioning) return;
      isDraggingRef.current = true;
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
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || roomMode !== "room" || isTransitioning) return;
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
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      // If user was dragging to orbit (> 6px movement), suppress mesh click
      if (maxDragDistRef.current > 6) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        maxDragDistRef.current = 0;
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("click", handleClickCapture, true);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("click", handleClickCapture, true);
    };
  }, [gl, roomMode, isTransitioning, savedRoomPose, onUpdateRoomPose]);

  // Animate camera position and orientation
  useFrame((_, delta) => {
    const [rx, ry, rz] =
      roomMode === "inspect"
        ? INSPECT_CAMERA_POSITION
        : sphericalToCartesian(savedRoomPose, INSPECT_CAMERA_TARGET);
    targetPos.current.set(rx, ry, rz);

    if (isDeterministic) {
      camera.position.copy(targetPos.current);
      camera.lookAt(lookTarget.current);
      if (isTransitioning) {
        onTransitionComplete();
      }
      return;
    }

    // Smooth camera transition
    const speed = isTransitioning ? 7.0 : 12.0;
    camera.position.lerp(targetPos.current, Math.min(1.0, delta * speed));
    camera.lookAt(lookTarget.current);

    if (isTransitioning) {
      const dist = camera.position.distanceTo(targetPos.current);
      if (dist < 0.015) {
        camera.position.copy(targetPos.current);
        onTransitionComplete();
      }
    }
  });

  return null;
};
