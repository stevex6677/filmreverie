import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createFilmShaderMaterial } from "../shaders/filmShader";
import { FilmStripLayout, getFrameCenter } from "../utils/loupeMapping";

interface FilmFrameProps {
  index: number;
  texture: THREE.Texture;
  isPositive: boolean;
  layout: FilmStripLayout;
  onSelect?: (index: number) => void;
  onPointerMove?: (point: THREE.Vector3, index: number) => void;
}

export const FilmFrame: React.FC<FilmFrameProps> = ({
  index,
  texture,
  isPositive,
  layout,
  onSelect,
  onPointerMove,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const center = useMemo(() => getFrameCenter(index, layout), [index, layout]);

  const material = useMemo(() => {
    return createFilmShaderMaterial(texture, isPositive);
  }, [texture, isPositive]);

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
  });

  return (
    <group position={[center.x, center.y, 0.005]}>
      {/* Photo frame mesh */}
      <mesh
        ref={meshRef}
        material={material}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(index);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onPointerMove?.(e.point, index);
        }}
      >
        <planeGeometry args={[layout.frameWidth, layout.frameHeight]} />
      </mesh>

      {/* Frame outline border */}
      <lineSegments position={[0, 0, 0.001]}>
        <edgesGeometry
          attach="geometry"
          args={[new THREE.PlaneGeometry(layout.frameWidth, layout.frameHeight)]}
        />
        <lineBasicMaterial attach="material" color="#111115" linewidth={1} />
      </lineSegments>
    </group>
  );
};
