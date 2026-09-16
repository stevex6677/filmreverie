import { SHELF_CAMERA, SHELF_ORIGIN, shelfFov } from '../data/physicalScale';
import { InspectionMotion, Point3 } from "../utils/inspectionMotion";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  DEFAULT_INSPECT_DISTANCE,
  ROOM_CAMERA_UP,
  TABLE_CENTER_Z,
  TABLE_SURFACE_Y,
  RoomCameraPose,
  ROOM_EYE,
  ROOM_CAMERA_FOV,
  roomLookTarget,
} from "../utils/cameraBounds";
import { TableAngle, TOP_DOWN, tableCameraPose, tablePointAt } from "../utils/tableCamera";
import { RoomMode } from "../state/viewerState";

interface CameraRigProps {
  shelfTransition?: boolean;
  shelfFocused?: boolean;
  tableAngle?: TableAngle;
  angleDragging?: boolean;
  touchInput?: boolean;
  inputBlocked?: boolean;
  roomMode: RoomMode;
  inspectionTransition?: boolean;
  stripIndex?: number;
  isTransitioning: boolean;
  savedRoomPose: RoomCameraPose;
  inspectZoom?: number;
  inspectPan?: { x: number; z: number };
  isLoupeActive?: boolean;
  loupeInspection?: boolean;
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
  shelfTransition = false,
  shelfFocused = false,
  tableAngle = TOP_DOWN,
  angleDragging = false,
  touchInput = false,
  inputBlocked = false,
  roomMode,
  inspectionTransition = false,
  stripIndex = 0,
  isTransitioning,
  savedRoomPose,
  inspectZoom = DEFAULT_INSPECT_DISTANCE,
  inspectPan = { x: 0, z: TABLE_CENTER_Z },
  isLoupeActive = false,
  loupeInspection = false,
  onUpdateRoomPose,
  onCameraMotion,
  onZoomAt,
  onAdjustInspectZoom,
  onAdjustInspectPan,
  onTransitionComplete,
  isDeterministic = false,
  isReducedMotion = false,
}) => {
  const { camera, gl, size } = useThree();
  const captureOwner = useRef<HTMLElement | null>(null);
  const isDraggingRoomRef = useRef(false);
  const isPanningTableRef = useRef(false);
  const isSpacePressedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, yaw: 0, pitch: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  const targetPos = useRef(new THREE.Vector3());
  const desiredCamera = useRef(new THREE.PerspectiveCamera());

  const maxDragDistRef = useRef(0);
  const wasMovingRef = useRef(false);
  const flight = useRef<InspectionMotion | null>(null);
  const lastTarget = useRef("");
  const lastStrip = useRef(stripIndex);
  const shelfFlight = useRef<{ key: string; elapsed: number; position: THREE.Vector3; rotation: THREE.Quaternion; fov: number } | null>(null);
  const navigationBlocked = isTransitioning && !shelfTransition;
  const renderedAngle = useRef({ ...tableAngle });

  // Spacebar tracking for table pan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target instanceof HTMLElement && !!e.target.closest('button, [role="dialog"], [contenteditable="true"]')))) {
        isSpacePressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpacePressedRef.current = false;
      }
    };
    const clearSpace = () => { isSpacePressedRef.current = false; };
    window.addEventListener("blur", clearSpace);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("blur", clearSpace);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Wheel zoom in inspect mode
  useEffect(() => {
    const canvas = gl.domElement;
    const handleWheel = (e: WheelEvent) => {
      if (loupeInspection) { e.preventDefault(); return; }
      if (inputBlocked || roomMode !== "inspect" || isTransitioning) return;
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
  }, [gl, roomMode, isTransitioning, inspectZoom, onAdjustInspectZoom, onZoomAt, camera, inputBlocked, loupeInspection]);

  // Pointer drag for fixed-eye room look or table pan
  useEffect(() => {
    const canvas = gl.domElement;

    const handleContextMenu = (e: MouseEvent) => {
      if (roomMode === "inspect") {
        e.preventDefault();
      }
    };

    const accepts = (target: EventTarget | null) => target === canvas || (target instanceof Element && !!target.closest('.shelf-approach-target'));
    const handlePointerDown = (e: PointerEvent) => {
      if (!accepts(e.target)) return;
      if (inputBlocked || loupeInspection || e.pointerType === 'touch' || e.pointerType === 'pen' || navigationBlocked) return;

      if (roomMode === "room") {
        // Look around from the standing eye with primary button
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
          captureOwner.current = e.target as HTMLElement;
          captureOwner.current.setPointerCapture(e.pointerId);
        } catch {}
      } else if (roomMode === "inspect") {
        // Pan table on right-click (button 2), middle-click (button 1), Space+left-click, or left-click when loupe is not active
        const isPanButton =
          e.button === 2 ||
          e.button === 1 ||
          e.button === 0;

        if (isPanButton) {
          isPanningTableRef.current = true;
          maxDragDistRef.current = 0;
          panStartRef.current = { x: e.clientX, y: e.clientY };
          try {
            captureOwner.current = e.target as HTMLElement;
            captureOwner.current.setPointerCapture(e.pointerId);
          } catch {}
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (inputBlocked || e.pointerType === 'touch' || e.pointerType === 'pen' || navigationBlocked) return;

      if (roomMode === "room" && isDraggingRoomRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDragDistRef.current) {
          maxDragDistRef.current = dist;
        }

        const sensitivity = 0.0035;
        // Grab the room: its contents follow the pointer on both axes.
        const newYaw = dragStartRef.current.yaw + dx * sensitivity;
        const newPitch = dragStartRef.current.pitch - dy * sensitivity;

        onUpdateRoomPose({ yaw: newYaw, pitch: newPitch });
      } else if (roomMode === "inspect" && isPanningTableRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        maxDragDistRef.current += Math.hypot(dx, dy);
        panStartRef.current = { x: e.clientX, y: e.clientY };

        if (onAdjustInspectPan) {
          const from = tablePointAt(camera, canvas, e.clientX - dx, e.clientY - dy);
          const to = tablePointAt(camera, canvas, e.clientX, e.clientY);
          if (from && to) onAdjustInspectPan(from.x - to.x, from.z - to.z);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      // Browsers can coalesce the last move; include the release position.
      if (isDraggingRoomRef.current || isPanningTableRef.current) handlePointerMove(e);
      if (isDraggingRoomRef.current) {
        isDraggingRoomRef.current = false;
        try {
          captureOwner.current?.releasePointerCapture(e.pointerId);
        } catch {}
      }
      if (isPanningTableRef.current) {
        isPanningTableRef.current = false;
        try {
          captureOwner.current?.releasePointerCapture(e.pointerId);
        } catch {}
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      if (!accepts(e.target)) return;
      // If user was dragging (> 6px movement), suppress mesh click
      if (maxDragDistRef.current > 6) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        maxDragDistRef.current = 0;
      }
    };

    // Keep canvas listener ordering (the loupe gets first refusal). Only the
    // cabinet overlay needs a document listener because it sits above the canvas.
    const shelfDown = (e: PointerEvent) => { if (e.target !== canvas) handlePointerDown(e); };
    const shelfClick = (e: MouseEvent) => { if (e.target !== canvas) handleClickCapture(e); };
    const cancelInput = () => { isDraggingRoomRef.current = false; isPanningTableRef.current = false; isSpacePressedRef.current = false; };
    if (navigationBlocked || inputBlocked) cancelInput();
    window.addEventListener("blur", cancelInput);
    window.addEventListener("pointercancel", cancelInput);
    document.addEventListener("lostpointercapture", cancelInput, true);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerdown", shelfDown, true);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("click", handleClickCapture, true);
    document.addEventListener("click", shelfClick, true);

    return () => {
      window.removeEventListener("blur", cancelInput);
      window.removeEventListener("pointercancel", cancelInput);
      document.removeEventListener("lostpointercapture", cancelInput, true);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerdown", shelfDown, true);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("click", handleClickCapture, true);
      document.removeEventListener("click", shelfClick, true);
    };
  }, [
    gl,
    roomMode,
    isTransitioning,
    navigationBlocked,
    savedRoomPose,
    inspectZoom,
    isLoupeActive,
    loupeInspection,
    onUpdateRoomPose,
    onAdjustInspectPan,
    camera,
    inputBlocked,
  ]);

  // Room input directly controls orientation at the fixed eye. Only automatic
  // journeys move it; quaternion interpolation remains stable across the yaw seam.
  useFrame((_, delta) => {
    const inspecting = roomMode === "inspect";
    const perspective = camera as THREE.PerspectiveCamera;
    const tablePose = tableCameraPose(inspectZoom, inspectPan, tableAngle);
    targetPos.current.set(...(inspecting
      ? tablePose.position
      : shelfFocused ? SHELF_CAMERA : ROOM_EYE));
    const desired = desiredCamera.current;
    desired.position.copy(targetPos.current);
    desired.up.set(...(inspecting ? tablePose.up : ROOM_CAMERA_UP));
    desired.lookAt(...(inspecting ? tablePose.target : shelfFocused ? SHELF_ORIGIN : roomLookTarget(savedRoomPose)));
    const angleChanging = Math.abs(renderedAngle.current.tilt - tableAngle.tilt) + Math.abs(renderedAngle.current.yaw - tableAngle.yaw) > .00001;
    const immediate = angleDragging || isDeterministic || isReducedMotion || (!inspecting && !isTransitioning) || ((touchInput || loupeInspection) && !isTransitioning && !angleChanging);
    const moving = !immediate && (camera.position.distanceTo(targetPos.current) > .001 || camera.quaternion.angleTo(desired.quaternion) > .001 || isPanningTableRef.current);
    if (moving !== wasMovingRef.current) { wasMovingRef.current = moving; onCameraMotion?.(moving); }
    // A finite shelf flight avoids waiting for an exponential tail to settle.
    // Reversals start at the rendered pose, and look input can change its target.
    let shelfProgress: number | null = null;
    if (!shelfTransition || immediate) shelfFlight.current = null;
    if (shelfTransition && !immediate) {
      const key = shelfFocused ? 'shelf' : 'room';
      if (shelfFlight.current?.key !== key) shelfFlight.current = { key, elapsed: 0, position: camera.position.clone(), rotation: camera.quaternion.clone(), fov: perspective.fov };
      const motion = shelfFlight.current;
      motion.elapsed = Math.min(.42, motion.elapsed + delta);
      shelfProgress = 1 - Math.pow(1 - motion.elapsed / .42, 3);
      camera.position.lerpVectors(motion.position, targetPos.current, shelfProgress);
      camera.quaternion.slerpQuaternions(motion.rotation, desired.quaternion, shelfProgress);
      flight.current = null; lastTarget.current = ''; lastStrip.current = stripIndex;
    } else if (inspecting && inspectionTransition && !immediate) {
      const key=targetPos.current.toArray().join(',');
      if (key !== lastTarget.current) {
        if (!flight.current) flight.current=new InspectionMotion(camera.position.toArray() as Point3);
        flight.current.retarget(targetPos.current.toArray() as Point3,Math.abs(stripIndex-lastStrip.current),loupeInspection ? .5 : undefined);
        lastTarget.current=key;lastStrip.current=stripIndex;
      }
      camera.position.set(...flight.current!.step(delta));
      camera.quaternion.slerp(desired.quaternion,1-Math.exp(-delta*12));
    } else if (immediate || (!isTransitioning && !moving)) {
      renderedAngle.current = { ...tableAngle };
      flight.current=null;lastTarget.current="";lastStrip.current=stripIndex;
      camera.position.copy(targetPos.current);
      camera.quaternion.copy(desired.quaternion);
    } else if (inspecting && !isTransitioning) {
      // Interpolate orbit coordinates, not a chord between camera positions:
      // the point under the center stays fixed throughout an angle change.
      flight.current=null;lastTarget.current="";lastStrip.current=stripIndex;
      const alpha = 1 - Math.exp(-delta * 12);
      renderedAngle.current.tilt = THREE.MathUtils.lerp(renderedAngle.current.tilt, tableAngle.tilt, alpha);
      renderedAngle.current.yaw = THREE.MathUtils.lerp(renderedAngle.current.yaw, tableAngle.yaw, alpha);
      const rect = gl.domElement.getBoundingClientRect();
      const center = tablePointAt(camera, gl.domElement, rect.left + rect.width / 2, rect.top + rect.height / 2);
      const pan = center ? { x: THREE.MathUtils.lerp(center.x, inspectPan.x, alpha), z: THREE.MathUtils.lerp(center.z, inspectPan.z, alpha) } : inspectPan;
      const distance = center ? THREE.MathUtils.lerp(camera.position.distanceTo(center), inspectZoom, alpha) : inspectZoom;
      const pose = tableCameraPose(distance, pan, renderedAngle.current);
      camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target);
    } else {
      flight.current=null;lastTarget.current="";lastStrip.current=stripIndex;
      const alpha = 1 - Math.exp(-delta * (isTransitioning ? 7 : 12));
      camera.position.lerp(targetPos.current, alpha);
      camera.quaternion.slerp(desired.quaternion, alpha);
    }
    perspective.near = inspecting ? Math.min(.04, inspectZoom * .025) : .04;
    // Keep the entire cabinet reachable on a portrait screen from the same
    // standing eye. Widen the lens, never move the viewer through the room.
    const roomFov = 2 * Math.atan(Math.tan(ROOM_CAMERA_FOV * Math.PI / 360) * Math.max(1, 1.6 / (size.width / size.height))) * 180 / Math.PI;
    const cabinetFov = shelfFov(size.width / size.height);
    const desiredFov = inspecting ? 45 : shelfFocused ? cabinetFov : roomFov;
    perspective.fov = immediate ? desiredFov : shelfProgress !== null
      ? THREE.MathUtils.lerp(shelfFlight.current!.fov, desiredFov, shelfProgress)
      : THREE.MathUtils.lerp(perspective.fov, desiredFov, 1 - Math.exp(-delta * 7));
    perspective.updateProjectionMatrix();
    camera.up.copy(desired.up);
    // Loupe projection runs before the renderer, so refresh the view matrix now.
    camera.updateMatrixWorld();
    // Camera telemetry exposes the real rendered pose for regression checks.
    gl.domElement.dataset.tableAngle = `${tableAngle.tilt},${tableAngle.yaw}`;
    gl.domElement.dataset.cameraFov = String(perspective.fov);
    gl.domElement.dataset.cameraPosition = camera.position.toArray().join(",");
    gl.domElement.dataset.cameraQuaternion = camera.quaternion.toArray().join(",");
    if (isTransitioning && (!inspectionTransition || immediate || flight.current?.done) && camera.position.distanceTo(targetPos.current) < .001 && camera.quaternion.angleTo(desired.quaternion) < .001 && Math.abs(perspective.fov - desiredFov) < .001) {
      renderedAngle.current = { ...tableAngle };
      camera.position.copy(targetPos.current);
      camera.quaternion.copy(desired.quaternion);
      perspective.fov = desiredFov; perspective.updateProjectionMatrix();
      onTransitionComplete();
    }
  }, -2); // Update the camera before loupe capture/projection and the main render.
  return null;
};
