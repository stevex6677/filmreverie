import { DEFAULT_FILM_STOCK_ID, FilmStockProfile, getFilmStock } from "../data/filmStocks";
import React, { useEffect, useMemo } from "react";
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
import { createRebateMaterial } from "../shaders/filmShader";
import { updateTableIllumination } from "../shaders/tableIllumination";
import { FilmFrame } from "./FilmFrame";

interface FilmStripProps {
  textures: THREE.Texture[];
  stock?: FilmStockProfile;
  isPositive: boolean;
  layout: FilmStripLayout;
  brightness?: number;
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
  stock = getFilmStock(DEFAULT_FILM_STOCK_ID),
  isPositive,
  layout,
  brightness = 1.0,
  onSelectFrame,
  onPointerMove,
}) => {
  const { width, height } = useMemo(() => getStripDimensions(layout), [layout]);

  const { top, bottom } = useMemo(() => getPerforationPositions(layout), [layout]);


  // High-resolution authentic 35mm rebate print texture (stock lettering and frame numbers)
  const rebateTexture = useMemo(() => {
    return createFilmRebateTexture(stock, layout);
  }, [stock, layout]);

  const rebateMaterial = useMemo(() => createRebateMaterial(rebateTexture), [rebateTexture]);
  updateTableIllumination(rebateMaterial, brightness);
  useEffect(() => () => { rebateMaterial.dispose(); rebateTexture.dispose(); }, [rebateMaterial, rebateTexture]);

  // Continuous substrate geometry with physical perforations, softened corner cut leads, and transverse curl
  const substrateGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hh = height / 2;
    const r = 0.0008; // Authentic lab guillotine sheared ends with slight micro-bevel

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

  useEffect(() => () => substrateGeometry.dispose(), [substrateGeometry]);

  return (
    <group position={[0, 0, 0.004]}>
      {/* Continuous glossy 35mm film acetate substrate with authentic rebate print and physical curl */}
      <mesh
        geometry={substrateGeometry}
        position={[0, 0, 0.0015]}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.(e.point);
        }}
      >
        <primitive object={rebateMaterial} attach="material" />
      </mesh>

      {/* 5 Film Frames with matching transverse curvature */}
      {textures.map((texture, index) => (
        <FilmFrame
          key={index}
          index={index}
          texture={texture}
          isPositive={isPositive}
          layout={layout}
          brightness={brightness}
          negativeMask={stock.base.negativeMask}
          onSelect={onSelectFrame}
          onPointerMove={(pt) => onPointerMove?.(pt)}
        />
      ))}
    </group>
  );
};
