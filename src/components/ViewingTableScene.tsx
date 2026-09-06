import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { ROLL_FRAMES } from "../data/rollManifest";
import { DEFAULT_LAYOUT } from "../utils/loupeMapping";
import { ViewerAction, ViewerState } from "../state/viewerState";
import { LightTable } from "./LightTable";
import { FilmStrip } from "./FilmStrip";
import { Loupe } from "./Loupe";
import { DarkroomRoom } from "./DarkroomRoom";
import { CameraRig } from "./CameraRig";

interface ViewingTableSceneProps {
  state: ViewerState;
  dispatch: React.Dispatch<ViewerAction>;
  isDeterministic?: boolean;
}

export const ViewingTableScene: React.FC<ViewingTableSceneProps> = ({
  state,
  dispatch,
  isDeterministic = false,
}) => {
  // Load textures for all five frames
  const imageSources = useMemo(() => ROLL_FRAMES.map((f) => f.src), []);
  const textures = useTexture(imageSources) as THREE.Texture[];

  useEffect(() => {
    textures.forEach((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
    });
  }, [textures]);

  const activeTexture = textures[state.loupe.frameIndex] || textures[0];
  const isPositive = state.filmMode === "positive";

  const handlePointerMove = (x: number, y: number) => {
    if (state.roomMode === "inspect" && state.loupe.isActive) {
      dispatch({ type: "SET_LOUPE_POSITION", x, y });
    }
  };

  const handleFrameSelect = (index: number) => {
    if (state.isTransitioning) return;
    if (state.roomMode === "room") {
      dispatch({ type: "APPROACH_TABLE" });
      dispatch({ type: "SELECT_FRAME", frameIndex: index });
    } else {
      dispatch({ type: "SELECT_FRAME", frameIndex: index });
    }
  };

  const handleTableClick = (x: number, y: number) => {
    if (state.isTransitioning) return;
    if (state.roomMode === "room") {
      dispatch({ type: "APPROACH_TABLE" });
    } else if (state.loupe.isActive) {
      dispatch({ type: "SET_LOUPE_POSITION", x, y });
    }
  };

  return (
    <>
      {/* Darkroom Atmosphere Scene Background */}
      <color attach="background" args={["#13151b"]} />

      {/* Dynamic Camera Rig with Orbit and Smooth Transitions */}
      <CameraRig
        roomMode={state.roomMode}
        isTransitioning={state.isTransitioning}
        savedRoomPose={state.savedRoomPose}
        onUpdateRoomPose={(pose) => dispatch({ type: "UPDATE_ROOM_POSE", pose })}
        onTransitionComplete={() => dispatch({ type: "SET_TRANSITIONING", isTransitioning: false })}
        isDeterministic={isDeterministic}
      />

      {/* Surrounding 3D Darkroom Environment */}
      <DarkroomRoom />

      {/* Light Table Base & Diffuser */}
      <LightTable
        onPointerMove={handlePointerMove}
        onClick={handleTableClick}
      />

      {/* Film Strip with 5 Frames */}
      <FilmStrip
        textures={textures}
        isPositive={isPositive}
        layout={DEFAULT_LAYOUT}
        onSelectFrame={handleFrameSelect}
        onPointerMove={(x, y) => {
          if (state.roomMode === "inspect" && state.loupe.isActive) {
            dispatch({ type: "SET_LOUPE_POSITION", x, y });
          }
        }}
      />

      {/* 2.5x Magnifying Loupe */}
      <Loupe
        isActive={state.roomMode === "inspect" && state.loupe.isActive}
        targetX={state.loupe.worldX}
        targetY={state.loupe.worldY}
        frameIndex={state.loupe.frameIndex}
        u={state.loupe.u}
        v={state.loupe.v}
        texture={activeTexture}
        isPositive={isPositive}
        isDeterministic={isDeterministic}
        onClick={() => {
          if (state.roomMode === "inspect") {
            dispatch({ type: "TOGGLE_LOUPE" });
          } else {
            dispatch({ type: "APPROACH_TABLE" });
          }
        }}
      />
    </>
  );
};

