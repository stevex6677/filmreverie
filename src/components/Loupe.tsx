import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createLoupeShaderMaterial } from "../shaders/loupeShader";

interface LoupeProps {
  isActive: boolean;
  targetX: number;
  targetY: number;
  frameIndex: number;
  u: number;
  v: number;
  texture: THREE.Texture;
  isPositive: boolean;
  isDeterministic?: boolean;
  onClick?: () => void;
}

export const Loupe: React.FC<LoupeProps> = ({
  isActive,
  targetX,
  targetY,
  u,
  v,
  texture,
  isPositive,
  isDeterministic = false,
  onClick,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  // Resting position (bottom-right on the light table off the film strip)
  const restingPos = useMemo(() => new THREE.Vector3(1.3, -0.42, 0.08), []);
  const activePos = useMemo(() => new THREE.Vector3(targetX, targetY, 0.08), [targetX, targetY]);

  const targetPos = isActive ? activePos : restingPos;

  // Shader material for the 2.5x magnified optical lens
  const lensMaterial = useMemo(() => {
    return createLoupeShaderMaterial(texture, isPositive, [u, v]);
  }, [texture, isPositive, u, v]);

  // Update uniforms and smooth positioning
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Position interpolation
    if (isDeterministic) {
      groupRef.current.position.copy(targetPos);
    } else {
      groupRef.current.position.lerp(targetPos, Math.min(1.0, delta * 14));
    }

    // Update shader uniforms
    if (lensMaterial.uniforms) {
      if (lensMaterial.uniforms.uTexture.value !== texture) {
        lensMaterial.uniforms.uTexture.value = texture;
      }

      lensMaterial.uniforms.uCenterUv.value.set(u, v);

      const targetMode = isPositive ? 1.0 : 0.0;
      const currentMode = lensMaterial.uniforms.uModeTransition.value;
      if (Math.abs(targetMode - currentMode) > 0.001) {
        lensMaterial.uniforms.uModeTransition.value = THREE.MathUtils.damp(
          currentMode,
          targetMode,
          16,
          delta
        );
      } else {
        lensMaterial.uniforms.uModeTransition.value = targetMode;
      }
    }
  });

  const lensRadius = 0.14;
  const barrelRadius = 0.17;
  const barrelHeight = 0.10;

  return (
    <group
      ref={groupRef}
      position={[targetPos.x, targetPos.y, targetPos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Contact shadow */}
      <mesh position={[0, -0.01, -0.06]}>
        <ringGeometry args={[0.08, barrelRadius + 0.04, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>

      {/* Loupe body / outer barrel */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 0.94, barrelRadius, barrelHeight, 36, 1, true]}
        />
        <meshStandardMaterial
          color="#1e1f23"
          roughness={0.4}
          metalness={0.8}
        />
      </mesh>

      {/* Knurled grip ring */}
      <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 1.03, barrelRadius * 1.03, 0.03, 36, 1, false]}
        />
        <meshStandardMaterial
          color="#2e3036"
          roughness={0.6}
          metalness={0.7}
        />
      </mesh>

      {/* Top brass chamfer and metal retaining bezel */}
      <mesh position={[0, 0, 0.046]}>
        <ringGeometry args={[lensRadius - 0.006, lensRadius, 48]} />
        <meshStandardMaterial
          color="#c89b4b"
          roughness={0.25}
          metalness={0.9}
        />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <ringGeometry args={[lensRadius, barrelRadius, 48]} />
        <meshStandardMaterial
          color="#1e1f23"
          roughness={0.35}
          metalness={0.8}
        />
      </mesh>

      {/* Optical Magnifying Lens Disc */}
      <mesh position={[0, 0, 0.04]} material={lensMaterial}>
        <circleGeometry args={[lensRadius, 48]} />
      </mesh>
    </group>
  );
};
