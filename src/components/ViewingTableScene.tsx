import { photoSourceDemand } from "../utils/photoFraming";
import { BASELINE_ROLL, createRollLayout, focusFrameLayout, locateFrame } from "../utils/rollLayout";
import { useRollTextures } from "../utils/useRollTextures";
import { useThree } from "@react-three/fiber";
import { getFilmStock } from "../data/filmStocks";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TABLE_SURFACE_Y, TABLE_CENTER_Z } from "../utils/cameraBounds";
import { ViewerAction, ViewerState } from "../state/viewerState";
import { LightTable } from "./LightTable";
import { FilmStrip } from "./FilmStrip";
import { Loupe } from "./Loupe";
import { DarkroomRoom } from "./DarkroomRoom";
import { CameraRig } from "./CameraRig";
import { TouchNavigation } from "./TouchNavigation";

interface ViewingTableSceneProps {
  inputBlocked?: boolean;
  state: ViewerState;
  dispatch: React.Dispatch<ViewerAction>;
  isDeterministic?: boolean;
  isReducedMotion?: boolean;
}

export const ViewingTableScene: React.FC<ViewingTableSceneProps> = ({
  inputBlocked = false,
  state,
  dispatch,
  isDeterministic = false,
  isReducedMotion = false,
}) => {
  const tableGroupRef = useRef<THREE.Group>(null);

  const { size, gl } = useThree();
  const multi = state.roll !== BASELINE_ROLL;
  const strips = useMemo(() => createRollLayout(state.roll), [state.roll]);
  const gate=focusFrameLayout(state.roll,state.activeFrameIndex);
  const projected=gate.frameWidth*state.roll.scale/(2*state.inspectZoom*Math.tan(Math.PI/8))*size.height*gl.getPixelRatio();
  const selected=state.roll.frames[state.activeFrameIndex];
  const sourcePixels=photoSourceDemand(projected,selected.aspectRatio,gate.frameWidth/gate.frameHeight,selected.rotation??0);
  const demand=state.roomMode === "inspect" && !state.isTransitioning && !state.cameraMoving ? sourcePixels*(state.loupe.isActive?state.loupe.magnification:1) : 0;
  const { textures, failed, settled, bytes, loadedCount, detailStatus } = useRollTextures(state.roll, state.activeFrameIndex, state.assetRetry, demand, gl.capabilities.maxTextureSize);
  useEffect(()=>{gl.domElement.dataset.textureIds=JSON.stringify(textures.map(t=>t.uuid));gl.domElement.dataset.textureBytes=String(bytes);gl.domElement.dataset.textureCount=String(loadedCount);gl.domElement.dataset.detailStatus=detailStatus;gl.domElement.dataset.textureEdge=String(Math.max(textures[state.activeFrameIndex]?.image?.width||0,textures[state.activeFrameIndex]?.image?.height||0));},[bytes,loadedCount,detailStatus,textures,state.activeFrameIndex,gl]);
  useEffect(() => { dispatch({ type: "ASSET_STATUS", failures: failed, loading: !settled, detailStatus }); }, [failed, settled, detailStatus, dispatch]);
  useEffect(() => { dispatch({ type: "VIEWPORT", aspect: size.width / size.height }); }, [size.width, size.height, dispatch]);

  const activeTexture = textures[state.loupe.frameIndex] || textures[0];
  const isPositive = state.filmMode === "positive";

  const handlePointerMove = (point: THREE.Vector3) => {
    if (state.touchPointer || inputBlocked) return;
    if (state.roomMode === "inspect" && state.loupe.isActive && !state.isTransitioning && !state.cameraMoving) {
      const local = tableGroupRef.current
        ? tableGroupRef.current.worldToLocal(point.clone())
        : point;
      dispatch({ type: "SET_LOUPE_POSITION", x: local.x, y: local.y });
    }
  };

  const handleFrameSelect = (index: number) => {
    if (state.isTransitioning && state.transitionKind !== "inspection") return;
    if (state.roomMode === "room") {
      dispatch({ type: "APPROACH_TABLE" });
      dispatch({ type: "SELECT_FRAME", frameIndex: index });
    } else {
      if (!state.focusMode && !state.loupe.isActive) dispatch({ type: "OPEN_FRAME", frameIndex: index });
    }
  };

  const handleTableClick = (point: THREE.Vector3) => {
    if (state.isTransitioning) return;
    if (state.roomMode === "room") {
      dispatch({ type: "APPROACH_TABLE" });
    } else if (state.loupe.isActive) {
      const local = tableGroupRef.current
        ? tableGroupRef.current.worldToLocal(point.clone())
        : point;
      dispatch({ type: "SET_LOUPE_POSITION", x: local.x, y: local.y });
    }
  };

  return (
    <>
      <TouchNavigation state={state} dispatch={dispatch} blocked={inputBlocked} />
      {/* Darkroom Atmosphere Scene Background */}
      <color attach="background" args={["#13151b"]} />

      {/* Dynamic Camera Rig with Orbit and Smooth Transitions */}
      <CameraRig
        touchInput={state.touchInput}
        inputBlocked={inputBlocked}
        roomMode={state.roomMode}
        inspectionTransition={state.transitionKind === "inspection"}
        stripIndex={locateFrame(state.roll,state.activeFrameIndex).strip.index}
        isTransitioning={state.isTransitioning}
        savedRoomPose={state.savedRoomPose}
        inspectZoom={state.inspectZoom}
        inspectPan={state.inspectPan}
        isLoupeActive={state.loupe.isActive}
        onUpdateRoomPose={(pose) => dispatch({ type: "UPDATE_ROOM_POSE", pose })}
        onCameraMotion={moving => dispatch({ type: "CAMERA_MOTION", moving })}
        onZoomAt={(delta, x, z) => dispatch({ type: "ZOOM_AT", delta, x, z })}
        onAdjustInspectZoom={(delta) => dispatch({ type: "ADJUST_TABLE_ZOOM", delta })}
        onAdjustInspectPan={(dx, dz) => dispatch({ type: "ADJUST_TABLE_PAN", dx, dz })}
        onTransitionComplete={() => dispatch({ type: "SET_TRANSITIONING", isTransitioning: false })}
        isDeterministic={isDeterministic}
        isReducedMotion={isReducedMotion}
      />

      {/* Surrounding 3D Darkroom Environment & Workbench */}
      <DarkroomRoom brightness={state.tableBrightness} roomBrightness={state.roomBrightness} immediate={isDeterministic || isReducedMotion} />

      {/* Flat Light Table on Workbench (placed horizontally on tabletop) */}
      <group
        ref={tableGroupRef}
        position={[0, TABLE_SURFACE_Y, TABLE_CENTER_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {/* Light Table Base & Diffuser */}
        <LightTable
          brightness={state.tableBrightness}
          onPointerMove={handlePointerMove}
          onClick={handleTableClick}
        />

        {strips.map(strip => <group key={strip.index} position={[0, strip.y, multi ? 0.003 : 0]} scale={strip.scale}>
          <FilmStrip frames={strip.frames} stock={getFilmStock(state.filmStockId)} textures={textures.slice(strip.offset, strip.offset + strip.frames.length)}
            isPositive={isPositive} layout={strip.layout} brightness={state.tableBrightness}
            onSelectFrame={index => handleFrameSelect(strip.offset + index)} onPointerMove={handlePointerMove} />
        </group>)}

        {/* Magnifying Loupe */}
        {(!state.focusMode || state.loupe.isActive) && <Loupe
          touchInput={state.touchPointer}
          physicalScale={state.roll.scale}
          suspended={state.isTransitioning || state.cameraMoving}
          isActive={state.roomMode === "inspect" && state.loupe.isActive}
          targetX={state.loupe.worldX}
          targetY={state.loupe.worldY}
          frameIndex={state.loupe.frameIndex}
          u={state.loupe.u}
          v={state.loupe.v}
          texture={activeTexture}
          isPositive={isPositive}
          magnification={state.loupe.magnification}
          brightness={state.tableBrightness}
          isDeterministic={isDeterministic}
          onClick={() => {
            if (state.roomMode === "inspect") {
              dispatch({ type: "TOGGLE_LOUPE" });
            } else {
              dispatch({ type: "APPROACH_TABLE" });
            }
          }}
        />}
      </group>
    </>
  );
};
