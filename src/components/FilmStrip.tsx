import React, { useMemo } from "react";
import * as THREE from "three";
import {
  FilmStripLayout,
  getStripDimensions,
  getPerforationPositions,
  getFilmCurlZ,
  SPROCKET_WIDTH,
  SPROCKET_HEIGHT,
  SPROCKET_CORNER_RADIUS,
} from "../utils/loupeMapping";
import { createFilmRebateTexture } from "../utils/filmRebateCanvas";
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

  // High-resolution authentic 35mm rebate print texture (brand markings, barcodes, frame numbers)
  const rebateTexture = useMemo(() => {
    return createFilmRebateTexture(isPositive, layout);
  }, [isPositive, layout]);

  // Continuous substrate geometry with physical perforations, softened corner cut leads, and transverse curl
  const substrateGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hh = height / 2;
    const r = 0.006; // Softened cut lead corners

    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    shape.lineTo(hw, hh - r);
    shape.quadraticCurveTo(hw, hh, hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    shape.lineTo(-hw, -hh + r);
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
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

    const geo = new THREE.ShapeGeometry(shape, 8);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, getFilmCurlZ(y, height));
      if (uv) {
        uv.setXY(i, (x + hw) / width, (y + hh) / height);
      }
    }
    pos.needsUpdate = true;
    if (uv) uv.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [width, height, top, bottom]);

  return (
    <group position={[0, 0, 0.004]}>
      {/* Tight central contact shadow where film rests against table */}
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[width + 0.01, height * 0.75]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.16} />
      </mesh>

      {/* Soft diffused shadow conforming to the arched film edges */}
      <mesh position={[0, -0.002, -0.003]}>
        <planeGeometry args={[width + 0.035, height + 0.024]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.10} />
      </mesh>

      {/* Glowing sprocket apertures revealing illuminated light table underneath */}
      {allPerforations.map((pos, idx) => (
        <mesh
          key={idx}
          position={[pos.x, pos.y, getFilmCurlZ(pos.y, height) - 0.0006]}
        >
          <planeGeometry args={[SPROCKET_WIDTH + 0.001, SPROCKET_HEIGHT + 0.001]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}

      {/* Continuous glossy 35mm film acetate substrate with authentic rebate print and physical curl */}
      <mesh
        geometry={substrateGeometry}
        position={[0, 0, 0.0015]}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.(e.point);
        }}
      >
        <meshStandardMaterial
          map={rebateTexture}
          roughness={0.45}
          metalness={0.04}
          transparent={true}
          opacity={0.96}
          depthWrite={false}
        />
      </mesh>

      {/* 5 Film Frames with matching transverse curvature */}
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
