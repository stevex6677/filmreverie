import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { updateTableIllumination } from "../shaders/tableIllumination";
import { createFilmShaderMaterial } from "../shaders/filmShader";
import { photoCropScale, photoCropOffset } from "../utils/photoFraming";
import { FilmStripLayout, getFilmCurlZ, getFrameWidth, getFrameCenter } from "../utils/loupeMapping";

interface FilmFrameProps {
  index: number;
  photo?: import("../data/rollManifest").RollFrame;
  texture: THREE.Texture;
  isPositive: boolean;
  layout: FilmStripLayout;
  brightness?: number;
  negativeMask?: readonly number[];
  onSelect?: (index: number) => void;
  onPointerMove?: (point: THREE.Vector3, index: number) => void;
}

export const FilmFrame: React.FC<FilmFrameProps> = ({
  index,
  photo,
  texture,
  isPositive,
  layout,
  brightness = 1.0,
  negativeMask,
  onSelect,
  onPointerMove,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const center = useMemo(() => getFrameCenter(index, layout), [index, layout]);

  const material = useMemo(() => createFilmShaderMaterial(
    texture, isPositive, brightness,
    negativeMask ? new THREE.Color(negativeMask[0], negativeMask[1], negativeMask[2]) : undefined,
  ), [texture, isPositive, negativeMask]);
  useEffect(() => () => material.dispose(), [material]);

  const frameWidth = getFrameWidth(index, layout);
  const rotation = photo?.rotation ?? 0;
  const crop = photoCropScale(photo?.aspectRatio ?? frameWidth / layout.frameHeight, frameWidth / layout.frameHeight, rotation);
  material.uniforms.uPhotoCrop.value.set(crop.x, crop.y);
  const offset = photoCropOffset(photo?.aspectRatio ?? frameWidth / layout.frameHeight, frameWidth / layout.frameHeight, rotation, photo?.cropPosition);
  material.uniforms.uPhotoOffset.value.set(offset.x, -offset.y);
  material.uniforms.uPhotoRotation.value = rotation * Math.PI / 180;
  updateTableIllumination(material, brightness);

  // Curved plane geometry with 16 Y-segments matching the substrate transverse curl
  const frameGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(frameWidth, layout.frameHeight, 1, 16);
    const pos = geo.attributes.position;
    const stripHeight = layout.frameHeight + 2 * layout.marginY;
    for (let i = 0; i < pos.count; i++) {
      const localY = pos.getY(i);
      pos.setZ(i, getFilmCurlZ(localY, stripHeight));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [frameWidth, layout.frameHeight, layout.marginY]);

  useEffect(() => () => frameGeometry.dispose(), [frameGeometry]);

  // Smoothly transition uniform if needed
  useFrame((_, delta) => {
    if (material.uniforms.uModeTransition) {
      const target = isPositive ? 1.0 : 0.0;
      const current = material.uniforms.uModeTransition.value;
      if (Math.abs(target - current) > 0.001) {
        material.uniforms.uModeTransition.value = THREE.MathUtils.damp(
          current,
          target,
          16,
          delta
        );
      } else {
        material.uniforms.uModeTransition.value = target;
      }
    }
  }, -2); // Settle optical mode before the loupe capture.

  return (
    <group position={[center.x, center.y, 0.002]}>
      {/* Photo frame mesh with smooth transverse curl */}
      <mesh
        ref={meshRef}
        geometry={frameGeometry}
        material={material}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(index);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.(e.point, index);
        }}
      />
    </group>
  );
};
