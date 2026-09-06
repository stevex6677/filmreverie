import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { ROLL_FRAMES } from "../data/rollManifest";
import { DEFAULT_LAYOUT } from "../utils/loupeMapping";
import { ViewerAction, ViewerState } from "../state/viewerState";
import { LightTable } from "./LightTable";
import { FilmStrip } from "./FilmStrip";
import { Loupe } from "./Loupe";

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
    if (state.loupe.isActive) {
      dispatch({ type: "SET_LOUPE_POSITION", x, y });
    }
  };

  const handleFrameSelect = (index: number) => {
    dispatch({ type: "SELECT_FRAME", frameIndex: index });
  };

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[0, 2, 4]} intensity={0.8} />

      {/* Light Table Base & Diffuser */}
      <LightTable
        onPointerMove={handlePointerMove}
        onClick={(x, y) => {
          if (state.loupe.isActive) {
            dispatch({ type: "SET_LOUPE_POSITION", x, y });
          }
        }}
      />

      {/* Film Strip with 5 Frames */}
      <FilmStrip
        textures={textures}
        isPositive={isPositive}
        layout={DEFAULT_LAYOUT}
        onSelectFrame={handleFrameSelect}
        onPointerMove={(x, y, frameIndex) => {
          if (state.loupe.isActive) {
            dispatch({ type: "SET_LOUPE_POSITION", x, y });
          } else if (frameIndex !== undefined) {
            // hover selection
          }
        }}
      />

      {/* 2.5x Magnifying Loupe */}
      <Loupe
        isActive={state.loupe.isActive}
        targetX={state.loupe.worldX}
        targetY={state.loupe.worldY}
        frameIndex={state.loupe.frameIndex}
        u={state.loupe.u}
        v={state.loupe.v}
        texture={activeTexture}
        isPositive={isPositive}
        isDeterministic={isDeterministic}
        onClick={() => dispatch({ type: "TOGGLE_LOUPE" })}
      />
    </>
  );
};
