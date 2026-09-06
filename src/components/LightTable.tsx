import React from "react";
import * as THREE from "three";

interface LightTableProps {
  width?: number;
  height?: number;
  onPointerMove?: (x: number, y: number) => void;
  onClick?: (x: number, y: number) => void;
}

export const LightTable: React.FC<LightTableProps> = ({
  width = 3.6,
  height = 1.6,
  onPointerMove,
  onClick,
}) => {
  const panelWidth = width - 0.25;
  const panelHeight = height - 0.25;

  return (
    <group position={[0, 0, 0]}>
      {/* Outer dark bezel/housing */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial
          color="#121316"
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>

      {/* Illuminated frosted acrylic / diffuser panel */}
      <mesh
        position={[0, 0, 0.001]}
        onPointerMove={(e) => {
          onPointerMove?.(e.point.x, e.point.y);
        }}
        onClick={(e) => {
          onClick?.(e.point.x, e.point.y);
        }}
      >
        <planeGeometry args={[panelWidth, panelHeight]} />
        <meshStandardMaterial
          color="#dde5ed"
          emissive="#eff3f7"
          emissiveIntensity={0.65}
          roughness={0.4}
          metalness={0.05}
        />
      </mesh>

      {/* Subtle illuminated edge highlight */}
      <lineSegments position={[0, 0, 0.002]}>
        <edgesGeometry
          attach="geometry"
          args={[new THREE.PlaneGeometry(panelWidth, panelHeight)]}
        />
        <lineBasicMaterial attach="material" color="#4a505b" linewidth={1} />
      </lineSegments>
    </group>
  );
};
