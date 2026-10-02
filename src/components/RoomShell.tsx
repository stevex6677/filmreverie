import { useMemo } from "react";
import * as THREE from "three";
import { ROOM_ENVELOPE } from "../utils/cameraBounds";
import { Box, Cylinder, useDisposeResources, useRoomReflections } from "./DarkroomParts";
import { ceilingTileTexture, clockFaceTexture, floorTileTexture, matTexture, occlusionTexture, plasterTexture } from "../utils/darkroomTextures";

// The room's shell: plastered front and right walls (the rear and left walls
// belong to the wet side and printing station), a suspended tile ceiling, a
// vinyl tile floor, skirting, a light-trap vent, a clock, and soft occlusion
// where surfaces meet so the box reads as a room rather than six planes.

const { width: W, front: FRONT, back: BACK, floor: F, ceiling: C } = ROOM_ENVELOPE;
const D = BACK - FRONT, H = C - F, MID = (FRONT + BACK) / 2;

/** Each wall's frame: origin at the wall's floor-line centre, +z into the room, +x along the wall. */
const WALLS: { name: string; at: [number, number, number]; yaw: number; length: number }[] = [
  { name: "front", at: [0, F, FRONT], yaw: 0, length: W },
  { name: "back", at: [0, F, BACK], yaw: Math.PI, length: W },
  { name: "left", at: [-W / 2, F, MID], yaw: Math.PI / 2, length: D },
  { name: "right", at: [W / 2, F, MID], yaw: -Math.PI / 2, length: D },
];

function useShellResources(environment: THREE.WebGLRenderTarget, roomBrightness: number) {
  const resources = useMemo(() => {
    const textures = {
      front: plasterTexture([W / 2.6, H / 2.6]), right: plasterTexture([D / 2.6, H / 2.6]),
      ceiling: ceilingTileTexture([W / .6, D / .6]), floor: floorTileTexture([W, D]),
      mat: matTexture([12, 5]), occlusion: occlusionTexture(), clock: clockFaceTexture(),
    };
    const std = (parameters: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(parameters);
    const shade = (opacity: number) => new THREE.MeshBasicMaterial({ color: "#000000", alphaMap: textures.occlusion, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const materials = {
      front: std({ color: "#575953", map: textures.front, roughness: .93 }),
      right: std({ color: "#575953", map: textures.right, roughness: .93 }),
      ceiling: std({ color: "#76756f", map: textures.ceiling, roughness: .95 }),
      floor: std({ color: "#a2a29e", map: textures.floor, roughness: .55, envMap: environment.texture }),
      paint: std({ color: "#242625", roughness: .75 }),
      mat: std({ map: textures.mat, alphaTest: .5, roughness: .8 }),
      vent: std({ color: "#2b2e30", roughness: .6, metalness: .3, envMap: environment.texture }),
      ventDark: std({ color: "#0c0d0e", roughness: .9 }),
      clockCase: std({ color: "#1d1f20", roughness: .4, metalness: .2, envMap: environment.texture }),
      clockFace: std({ map: textures.clock, roughness: .5 }),
      clockGlass: std({ color: "#ffffff", roughness: .05, transparent: true, opacity: .08, depthWrite: false, envMap: environment.texture }),
      floorShade: shade(.62), wallShade: shade(.4), cornerShade: shade(.32),
    };
    return { textures, materials };
  }, [environment]);
  useDisposeResources(resources);
  useRoomReflections(resources.materials, roomBrightness);
  return resources;
}

type Resources = ReturnType<typeof useShellResources>;

function Occlusion({ resources }: { resources: Resources }) {
  const { materials: m } = resources;
  return <group name="room-occlusion">
    {WALLS.map(wall => <group key={wall.name} position={wall.at} rotation={[0, wall.yaw, 0]}>
      {/* Floor junction, on the floor and the foot of the wall. */}
      <mesh position={[0, .004, .2]} rotation={[-Math.PI / 2, 0, Math.PI]} material={m.floorShade}><planeGeometry args={[wall.length, .4]} /></mesh>
      <mesh position={[0, .17, .004]} material={m.wallShade}><planeGeometry args={[wall.length, .34]} /></mesh>
      {/* Ceiling junction. */}
      <mesh position={[0, H - .004, .25]} rotation={[Math.PI / 2, 0, 0]} material={m.wallShade}><planeGeometry args={[wall.length, .5]} /></mesh>
      <mesh position={[0, H - .2, .004]} rotation={[0, 0, Math.PI]} material={m.wallShade}><planeGeometry args={[wall.length, .4]} /></mesh>
      {/* Vertical room corners. */}
      {[-1, 1].map(side => <mesh key={side} position={[side * (wall.length / 2 - .15), H / 2, .004]} rotation={[0, 0, side * Math.PI / 2]} material={m.cornerShade}><planeGeometry args={[H, .3]} /></mesh>)}
    </group>)}
  </group>;
}

export function RoomShell({ environment, roomBrightness }: { environment: THREE.WebGLRenderTarget; roomBrightness: number }) {
  const resources = useShellResources(environment, roomBrightness);
  const { materials: m } = resources;
  return <group name="room-shell">
    <mesh receiveShadow position={[0, F + H / 2, FRONT]} material={m.front}><planeGeometry args={[W, H]} /></mesh>
    <mesh receiveShadow position={[W / 2, F + H / 2, MID]} rotation={[0, -Math.PI / 2, 0]} material={m.right}><planeGeometry args={[D, H]} /></mesh>
    <mesh receiveShadow position={[0, C, MID]} rotation={[Math.PI / 2, 0, 0]} material={m.ceiling}><planeGeometry args={[W, D]} /></mesh>
    <mesh receiveShadow position={[0, F, MID]} rotation={[-Math.PI / 2, 0, 0]} material={m.floor}><planeGeometry args={[W, D]} /></mesh>
    <Box at={[0, F + .06, FRONT + .01]} size={[W, .12, .02]} material={m.paint} />
    <Box at={[W / 2 - .01, F + .06, MID]} size={[.02, .12, D]} material={m.paint} />
    {/* Perforated anti-fatigue mat where the viewer stands at the light table. */}
    <mesh receiveShadow position={[0, F + .007, 2]} material={m.mat}><boxGeometry args={[3.6, .012, 1.5]} /></mesh>
    <Occlusion resources={resources} />

    {/* Light-trapped ventilation louvre high on the front wall. */}
    <group name="light-trap-vent" position={[2.6, 2.45, FRONT]}>
      <Box at={[0, 0, .025]} size={[.56, .34, .05]} material={m.vent} />
      <Box at={[0, 0, .051]} size={[.48, .26, .002]} material={m.ventDark} />
      {[-.1, -.05, 0, .05, .1].map(y => <Box key={y} at={[0, y, .055]} size={[.48, .006, .045]} rotation={[-.7, 0, 0]} material={m.vent} />)}
    </group>

    {/* Wall clock above the camera cabinet. */}
    <group name="wall-clock" position={[W / 2, 2.15, 2.9]} rotation={[0, -Math.PI / 2, 0]}>
      <Cylinder at={[0, 0, .022]} radius={.17} height={.044} material={m.clockCase} rotation={[Math.PI / 2, 0, 0]} segments={48} />
      <mesh position={[0, 0, .0445]} material={m.clockFace}><circleGeometry args={[.15, 48]} /></mesh>
      <mesh position={[0, 0, .05]} material={m.clockGlass}><circleGeometry args={[.155, 48]} /></mesh>
    </group>
  </group>;
}
