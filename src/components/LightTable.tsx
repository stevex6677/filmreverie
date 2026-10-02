import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

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
  const panelMaterial = useMemo(() => createPanelMaterial(), []);
  updateTableIllumination(panelMaterial, brightness);
  useEffect(() => () => panelMaterial.dispose(), [panelMaterial]);
  const panelWidth = width - 0.20;
  const panelHeight = height - 0.20;
  const edgeMaterial = useMemo(() => createPanelEdgeMaterial(panelWidth, panelHeight), [panelWidth, panelHeight]);
  updateTableIllumination(edgeMaterial, brightness);
  useEffect(() => () => edgeMaterial.dispose(), [edgeMaterial]);
  const chassis = useMemo(() => {
    const leadX = width / 2 - 0.25, back = height / 2;
    return {
      case: new RoundedBoxGeometry(width, height, 0.08, 3, 0.012),
      lead: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        [leadX, back - 0.01, -0.04], [leadX, back + 0.05, -0.05], [leadX + 0.03, back + 0.1, -0.075],
        [leadX + 0.06, 1.0, -0.075], [leadX + 0.06, 1.03, -0.12], [leadX + 0.06, 1.035, -0.45],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z))), 48, 0.005, 8),
      anodised: new THREE.MeshStandardMaterial({ color: "#1b1d22", roughness: 0.4, metalness: 0.65 }),
      bezel: new THREE.MeshStandardMaterial({ color: "#8d9298", roughness: 0.3, metalness: 0.85 }),
      knob: new THREE.MeshStandardMaterial({ color: "#2c3036", roughness: 0.55, metalness: 0.5 }),
      led: new THREE.MeshBasicMaterial({ color: "#7dffa8" }),
      rubber: new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.7 }),
    };
  }, [width, height]);
  useEffect(() => () => Object.values(chassis).forEach(item => item.dispose()), [chassis]);

  return (
    <group position={[0, 0, 0]}>
      {/* Anodised aluminium case with rounded edges, 8 cm deep. */}
      <mesh position={[0, 0, -0.04]} geometry={chassis.case} material={chassis.anodised} />
      {/* Machined bright chamfer around the diffuser. */}
      {[-1, 1].map(side => <React.Fragment key={side}>
        <mesh position={[0, side * (panelHeight / 2 + 0.003), 0.0002]} material={chassis.bezel}><boxGeometry args={[panelWidth + 0.012, 0.006, 0.0004]} /></mesh>
        <mesh position={[side * (panelWidth / 2 + 0.003), 0, 0.0002]} material={chassis.bezel}><boxGeometry args={[0.006, panelHeight, 0.0004]} /></mesh>
      </React.Fragment>)}

      {/* Dimmer knob and power LED on the front right of the case. */}
      <group position={[width / 2 - 0.16, -height / 2, -0.04]}>
        <mesh position={[0, -0.006, 0]} material={chassis.anodised}><cylinderGeometry args={[0.02, 0.02, 0.012, 32]} /></mesh>
        <mesh position={[0, -0.0125, 0]} material={chassis.knob}><cylinderGeometry args={[0.017, 0.018, 0.003, 32]} /></mesh>
        <mesh position={[0.008, -0.0141, 0.008]} material={chassis.bezel}><boxGeometry args={[0.002, 0.0004, 0.008]} /></mesh>
        <mesh position={[0.05, -0.0003, 0]} rotation={[Math.PI / 2, 0, 0]} material={chassis.led}><circleGeometry args={[0.0028, 16]} /></mesh>
      </group>

      {/* Power lead from the back of the case, off the back of the bench. */}
      <mesh geometry={chassis.lead} material={chassis.rubber} />

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

    </group>
  );
};
