import { useThree } from "@react-three/fiber";
import { DEFAULT_FILM_STOCK_ID, FilmStockProfile, getFilmStock } from "../data/filmStocks";
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  FilmStripLayout,
  getStripDimensions,
  getPerforationPositions,
  SPROCKET_WIDTH,
  SPROCKET_HEIGHT,
  SPROCKET_CORNER_RADIUS,
} from "../utils/loupeMapping";
import { createFilmRebateTexture } from "../utils/filmRebateCanvas";
import { createRebateMaterial } from "../shaders/filmShader";
import { updateTableIllumination } from "../shaders/tableIllumination";
import { FilmFrame } from "./FilmFrame";
import { curveFilmSubstrate } from "../utils/filmSurfaceGeometry";

interface FilmStripProps {
  textures: THREE.Texture[];
  frames?: readonly import("../data/rollManifest").RollFrame[];
  stock?: FilmStockProfile;
  isPositive: boolean;
  layout: FilmStripLayout;
  brightness?: number;
  filmStrength?: number;
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
  frames,
  stock = getFilmStock(DEFAULT_FILM_STOCK_ID),
  isPositive,
  layout,
  brightness = 1.0,
  filmStrength,
  onSelectFrame,
  onPointerMove,
}) => {
  const { gl } = useThree();
  const { width, height } = useMemo(() => getStripDimensions(layout), [layout]);

  const { top, bottom } = useMemo(() => getPerforationPositions(layout), [layout]);


  // High-resolution authentic 35mm rebate print texture (stock lettering and frame numbers)
  const rebateTexture = useMemo(() => {
    return createFilmRebateTexture(stock, layout, gl.capabilities.maxTextureSize, gl.capabilities.getMaxAnisotropy());
  }, [stock, layout, gl]);

  const rebateMaterial = useMemo(() => {
    const channels = stock.base.substrateBase.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const base = new THREE.Color().setRGB(channels[0] / 255, channels[1] / 255, channels[2] / 255, THREE.SRGBColorSpace);
    return createRebateMaterial(rebateTexture, brightness, isPositive, stock.type === "negative", base, layout, new THREE.Color(stock.base.rebateText));
  }, [rebateTexture, stock]);
  rebateMaterial.uniforms.uModeTransition.value = isPositive && stock.type === "negative" ? 1 : 0;
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

    const flat = new THREE.ShapeGeometry(shape, 8);
    const geo = curveFilmSubstrate(flat, layout);
    flat.dispose();
    return geo;
  }, [width, height, top, bottom, layout]);

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
          photo={frames?.[index]}
          texture={texture}
          isPositive={isPositive}
          layout={layout}
          brightness={brightness}
          stockId={stock.id}
          filmStrength={filmStrength}
          negativeMask={stock.base.negativeMask}
          onSelect={onSelectFrame}
          onPointerMove={(pt) => onPointerMove?.(pt)}
        />
      ))}
    </group>
  );
};
