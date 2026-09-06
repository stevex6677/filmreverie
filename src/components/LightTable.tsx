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
      {/* Outer physical chassis/casing with tangible thickness (0.18m deep) */}
      <mesh position={[0, 0, -0.09]}>
        <boxGeometry args={[width, height, 0.18]} />
        <meshStandardMaterial
          color="#1b1d22"
          roughness={0.4}
          metalness={0.65}
        />
      </mesh>

      {/* Side power rocker switch / dial accent */}
      <mesh position={[width / 2 + 0.015, -height / 4, -0.09]}>
        <boxGeometry args={[0.03, 0.12, 0.06]} />
        <meshStandardMaterial color="#ea580c" roughness={0.3} metalness={0.2} />
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
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={1.20}
          roughness={0.3}
          metalness={0.02}
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
