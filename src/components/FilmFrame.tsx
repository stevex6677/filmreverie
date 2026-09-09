import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createFilmShaderMaterial } from "../shaders/filmShader";
import { FilmStripLayout, getFilmCurlZ, getFrameCenter } from "../utils/loupeMapping";

interface FilmFrameProps {
  index: number;
  texture: THREE.Texture;
  isPositive: boolean;
  layout: FilmStripLayout;
  brightness?: number;
  onSelect?: (index: number) => void;
  onPointerMove?: (point: THREE.Vector3, index: number) => void;
}

export const FilmFrame: React.FC<FilmFrameProps> = ({
  index,
  texture,
  isPositive,
  layout,
  brightness = 1.0,
  onSelect,
  onPointerMove,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const center = useMemo(() => getFrameCenter(index, layout), [index, layout]);

  const material = useMemo(() => {
    return createFilmShaderMaterial(texture, isPositive);
  }, [texture, isPositive]);

  // Curved plane geometry with 16 Y-segments matching the substrate transverse curl
  const frameGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(layout.frameWidth, layout.frameHeight, 1, 16);
    const pos = geo.attributes.position;
    const stripHeight = layout.frameHeight + 2 * layout.marginY;
    for (let i = 0; i < pos.count; i++) {
      const localY = pos.getY(i);
      pos.setZ(i, getFilmCurlZ(localY, stripHeight));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [layout.frameWidth, layout.frameHeight, layout.marginY]);

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

    if (material.uniforms.uExposure) {
      const targetExp = 1.0 * Math.pow(brightness, 0.5);
      const currentExp = material.uniforms.uExposure.value;
      if (Math.abs(targetExp - currentExp) > 0.001) {
        material.uniforms.uExposure.value = THREE.MathUtils.damp(
          currentExp,
          targetExp,
          16,
          delta
        );
      } else {
        material.uniforms.uExposure.value = targetExp;
      }
    }
  });

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
