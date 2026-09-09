import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

import { createPanelEdgeMaterial, createPanelMaterial } from "../shaders/filmShader";
import { updateTableIllumination } from "../shaders/tableIllumination";

interface LightTableProps {
  width?: number;
  height?: number;
  brightness?: number;
  onPointerMove?: (point: THREE.Vector3) => void;
  onClick?: (point: THREE.Vector3) => void;
}

export const LightTable: React.FC<LightTableProps> = ({
  width = 3.6,
  height = 1.8,
  brightness = 1.0,
  onPointerMove,
  onClick,
}) => {
  const panelMaterial = useMemo(() => createPanelMaterial(1, width - 0.20, height - 0.20), [width, height]);
  updateTableIllumination(panelMaterial, brightness);
  useEffect(() => () => panelMaterial.dispose(), [panelMaterial]);
  const panelWidth = width - 0.20;
  const panelHeight = height - 0.20;
  const edgeMaterial = useMemo(() => createPanelEdgeMaterial(panelWidth, panelHeight), [panelWidth, panelHeight]);
  updateTableIllumination(edgeMaterial, brightness);
  useEffect(() => () => edgeMaterial.dispose(), [edgeMaterial]);

  return (
    <group position={[0, 0, 0]}>
      {/* Outer physical chassis/casing with slim tabletop lightbox profile (0.08m deep) */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial
          color="#1b1d22"
          roughness={0.4}
          metalness={0.65}
        />
      </mesh>

      {/* Anodized lower aluminum lip/trim */}
      <mesh position={[0, -panelHeight / 2 - 0.045, 0.008]}>
        <boxGeometry args={[panelWidth + 0.08, 0.02, 0.016]} />
        <meshStandardMaterial color="#2c3038" roughness={0.35} metalness={0.8} />
      </mesh>

      {/* Side power rocker switch / dial accent */}
      <mesh position={[width / 2 + 0.015, -height / 4, -0.04]}>
        <boxGeometry args={[0.03, 0.12, 0.04]} />
        <meshStandardMaterial color="#ea580c" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Restrained scattering stays within 7cm of the bright diffuser edge. */}
      <mesh position={[0, 0, 0.0005]} material={edgeMaterial}>
        <planeGeometry args={[panelWidth + 0.14, panelHeight + 0.14]} />
      </mesh>

      {/* Illuminated frosted acrylic / diffuser panel */}
      <mesh
        position={[0, 0, 0.001]}
        onPointerMove={(e) => {
          onPointerMove?.(e.point);
        }}
        onClick={(e) => {
          onClick?.(e.point);
        }}
      >
        <planeGeometry args={[panelWidth, panelHeight]} />
        <primitive object={panelMaterial} attach="material" />
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
