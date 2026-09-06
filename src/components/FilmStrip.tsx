import React, { useMemo } from "react";
import * as THREE from "three";
import { FilmStripLayout, getStripDimensions } from "../utils/loupeMapping";
import { FilmFrame } from "./FilmFrame";

interface FilmStripProps {
  textures: THREE.Texture[];
  isPositive: boolean;
  layout: FilmStripLayout;
  onSelectFrame?: (index: number) => void;
  onPointerMove?: (x: number, y: number, frameIndex?: number) => void;
}

export const FilmStrip: React.FC<FilmStripProps> = ({
  textures,
  isPositive,
  layout,
  onSelectFrame,
  onPointerMove,
}) => {
  const { width, height } = useMemo(() => getStripDimensions(layout), [layout]);

  // Generate sprocket holes along top and bottom edges
  const sprockets = useMemo(() => {
    const holes: { x: number; y: number }[] = [];
    const count = 40;
    const step = (width - 0.1) / (count - 1);
    const topY = height / 2 - layout.marginY / 2;
    const bottomY = -height / 2 + layout.marginY / 2;

    for (let i = 0; i < count; i++) {
      const x = -width / 2 + 0.05 + i * step;
      holes.push({ x, y: topY });
      holes.push({ x, y: bottomY });
    }
    return holes;
  }, [width, height, layout]);

  return (
    <group position={[0, 0, 0.02]}>
      {/* Film base substrate */}
      <mesh
        position={[0, 0, 0]}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.(e.point.x, e.point.y);
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#161514"
          roughness={0.3}
          metalness={0.1}
          transparent={true}
          opacity={0.96}
        />
      </mesh>

      {/* Sprocket holes */}
      {sprockets.map((pos, idx) => (
        <mesh key={idx} position={[pos.x, pos.y, 0.001]}>
          <planeGeometry args={[0.035, 0.022]} />
          {/* Sprockets reveal the glowing light table underneath */}
          <meshBasicMaterial color="#f0f3f6" />
        </mesh>
      ))}

      {/* 5 Film Frames */}
      {textures.map((texture, index) => (
        <FilmFrame
          key={index}
          index={index}
          texture={texture}
          isPositive={isPositive}
          layout={layout}
          onSelect={onSelectFrame}
          onPointerMove={onPointerMove}
        />
      ))}
    </group>
  );
};
