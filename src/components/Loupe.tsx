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
  const barrelHeight = 0.07;

  return (
    <group
      ref={groupRef}
      position={[targetPos.x, targetPos.y, targetPos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Soft radial contact shadow */}
      <mesh position={[0, -0.005, -0.06]}>
        <ringGeometry args={[0.06, barrelRadius + 0.05, 36]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.38} />
      </mesh>

      {/* Clear optical acrylic skirt at base letting table illumination in */}
      <mesh position={[0, 0, -0.022]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 0.96, barrelRadius * 1.02, 0.042, 36, 1, false]}
        />
        <meshStandardMaterial
          color="#f8fafc"
          roughness={0.12}
          metalness={0.08}
          transparent={true}
          opacity={0.36}
        />
      </mesh>

      {/* Lower retaining collar between skirt and metal barrel */}
      <mesh position={[0, 0, 0.002]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 0.97, barrelRadius * 0.97, 0.008, 36]}
        />
        <meshStandardMaterial
          color="#18191d"
          roughness={0.35}
          metalness={0.85}
        />
      </mesh>

      {/* Anodized matte black aluminum body / upper barrel */}
      <mesh position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 0.93, barrelRadius * 0.97, barrelHeight, 36, 1, true]}
        />
        <meshStandardMaterial
          color="#1c1d22"
          roughness={0.38}
          metalness={0.8}
        />
      </mesh>

      {/* Knurled focusing grip ring with tactile ribbed profile */}
      <mesh position={[0, 0, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[barrelRadius * 1.03, barrelRadius * 1.03, 0.035, 48, 1, false]}
        />
        <meshStandardMaterial
          color="#25272e"
          roughness={0.65}
          metalness={0.7}
        />
      </mesh>

      {/* Precision polished brass retaining bezel */}
      <mesh position={[0, 0, 0.074]}>
        <ringGeometry args={[lensRadius - 0.008, lensRadius, 48]} />
        <meshStandardMaterial
          color="#d4af37"
          roughness={0.22}
          metalness={0.92}
        />
      </mesh>

      {/* Outer top barrel rim */}
      <mesh position={[0, 0, 0.073]}>
        <ringGeometry args={[lensRadius, barrelRadius * 0.95, 48]} />
        <meshStandardMaterial
          color="#16171a"
          roughness={0.35}
          metalness={0.85}
        />
      </mesh>

      {/* Optical Magnifying Lens Disc with subtle curvature and AR reflection */}
      <mesh position={[0, 0, 0.068]} material={lensMaterial}>
        <circleGeometry args={[lensRadius, 48]} />
      </mesh>
    </group>
  );
};
