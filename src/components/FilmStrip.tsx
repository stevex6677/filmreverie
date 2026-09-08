import React, { useMemo } from "react";
import * as THREE from "three";
import {
  FilmStripLayout,
  getStripDimensions,
  getPerforationPositions,
  SPROCKET_WIDTH,
  SPROCKET_HEIGHT,
  SPROCKET_CORNER_RADIUS,
} from "../utils/loupeMapping";
import { FilmFrame } from "./FilmFrame";

interface FilmStripProps {
  textures: THREE.Texture[];
  isPositive: boolean;
  layout: FilmStripLayout;
  onSelectFrame?: (index: number) => void;
  onPointerMove?: (point: THREE.Vector3) => void;
}

function createRoundedRectPath(x: number, y: number, w: number, h: number, r: number): THREE.Path {
  const path = new THREE.Path();
  const hw = w / 2;
  const hh = h / 2;
  path.moveTo(x - hw + r, y - hh);
  path.lineTo(x + hw - r, y - hh);
  path.quadraticCurveTo(x + hw, y - hh, x + hw, y - hh + r);
  path.lineTo(x + hw, y + hh - r);
  path.quadraticCurveTo(x + hw, y + hh, x + hw - r, y + hh);
  path.lineTo(x - hw + r, y + hh);
  path.quadraticCurveTo(x - hw, y + hh, x - hw, y + hh - r);
  path.lineTo(x - hw, y - hh + r);
  path.quadraticCurveTo(x - hw, y - hh, x - hw + r, y - hh);
  return path;
}

export const FilmStrip: React.FC<FilmStripProps> = ({
  textures,
  isPositive,
  layout,
  onSelectFrame,
  onPointerMove,
}) => {
  const { width, height } = useMemo(() => getStripDimensions(layout), [layout]);

  const { top, bottom } = useMemo(() => getPerforationPositions(layout), [layout]);
  const allPerforations = useMemo(() => [...top, ...bottom], [top, bottom]);

  // Continuous substrate geometry with 8 physical sprocket perforations cut per frame
  const substrateGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hh = height / 2;
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();

    for (const p of top) {
      shape.holes.push(
        createRoundedRectPath(p.x, p.y, SPROCKET_WIDTH, SPROCKET_HEIGHT, SPROCKET_CORNER_RADIUS)
      );
    }
    for (const p of bottom) {
      shape.holes.push(
        createRoundedRectPath(p.x, p.y, SPROCKET_WIDTH, SPROCKET_HEIGHT, SPROCKET_CORNER_RADIUS)
      );
    }

    return new THREE.ShapeGeometry(shape, 8);
  }, [width, height, top, bottom]);

  return (
    <group position={[0, 0, 0.006]}>
      {/* Contact shadow on illuminated light table */}
      <mesh position={[0, -0.004, -0.002]}>
        <planeGeometry args={[width + 0.02, height + 0.015]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} />
      </mesh>

      {/* Glowing sprocket apertures revealing illuminated light table */}
      {allPerforations.map((pos, idx) => (
        <mesh key={idx} position={[pos.x, pos.y, -0.001]}>
          <planeGeometry args={[SPROCKET_WIDTH + 0.001, SPROCKET_HEIGHT + 0.001]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}

      {/* Continuous glossy 35mm film acetate substrate with physical perforations */}
      <mesh
        geometry={substrateGeometry}
        position={[0, 0, 0]}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.(e.point);
        }}
      >
        <meshStandardMaterial
          color={isPositive ? "#15161a" : "#24160d"}
          roughness={0.18}
          metalness={0.08}
          transparent={true}
          opacity={0.97}
        />
      </mesh>

      {/* 5 Film Frames */}
      {textures.map((texture, index) => (
        <FilmFrame
          key={index}
          index={index}
          texture={texture}
          isPositive={isPositive}
          layout={layout}
          onSelect={onSelectFrame}
          onPointerMove={(pt) => onPointerMove?.(pt)}
        />
      ))}
    </group>
  );
};
