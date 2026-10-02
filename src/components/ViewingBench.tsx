import { useMemo } from "react";
import * as THREE from "three";
import { ROOM_ENVELOPE, TABLE_CENTER_Z } from "../utils/cameraBounds";
import { Box, Cylinder, useDisposeResources, useRoomReflections } from "./DarkroomParts";
import { binderSpineTexture, labelTexture, linoleumTexture, woodTexture } from "../utils/darkroomTextures";

// The bench under the light table: a dark linoleum top with an oak edge on a
// welded steel frame, and the negative archive on the shelf below.

const F = ROOM_ENVELOPE.floor;
const TOP = -.8, DEPTH = 2, Z = TABLE_CENTER_Z;
const SHELF = F + .195;
const BINDERS: [string, string, string][] = [
  ["NEGATIVES", "2016", "#1f3b5c"], ["NEGATIVES", "2017", "#1f3b5c"], ["NEGATIVES", "2018", "#5c1f24"], ["NEGATIVES", "2019", "#5c1f24"],
  ["NEGATIVES", "2020", "#2e4a2c"], ["NEGATIVES", "2021", "#2e4a2c"], ["CONTACTS", "2016–21", "#2b2b2d"], ["SLIDES", "E-6", "#6b5a2a"],
];

function useBenchResources(environment: THREE.WebGLRenderTarget, roomBrightness: number, width: number) {
  const resources = useMemo(() => {
    const textures = {
      top: linoleumTexture([width / 1.2, DEPTH / 1.2]), edge: woodTexture("#6e5034", 29), ply: woodTexture("#8c6f4c", 37),
      spines: BINDERS.map(([title, year, colour]) => binderSpineTexture([title, year], colour)),
      archive: [labelTexture(["NEGATIVE ARCHIVE", "1998 — 2009"], { paper: "#ece6d4", accent: "#3d3a35" }), labelTexture(["PRINTS 8 × 10", "SELECTS"], { paper: "#ece6d4", accent: "#8c2a1c" })],
    };
    const env = { envMap: environment.texture };
    const std = (parameters: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(parameters);
    const materials = {
      top: std({ color: "#46494b", map: textures.top, roughness: .62, ...env }),
      edge: std({ color: "#ffffff", map: textures.edge, roughness: .5, ...env }),
      ply: std({ color: "#ffffff", map: textures.ply, roughness: .8 }),
      frame: std({ color: "#2f3436", metalness: .35, roughness: .55, ...env }),
      darkSteel: std({ color: "#6d7275", metalness: .8, roughness: .4, ...env }),
      binders: BINDERS.map(([, , colour]) => std({ color: colour, roughness: .55, ...env })),
      spines: textures.spines.map(map => std({ map, roughness: .55 })),
      archive: std({ color: "#8a8b86", roughness: .8 }),
      archiveLid: std({ color: "#7c7d78", roughness: .8 }),
      labels: textures.archive.map(map => std({ map, roughness: .8 })),
    };
    return { textures, materials };
  }, [environment, width]);
  useDisposeResources(resources);
  useRoomReflections(resources.materials, roomBrightness);
  return resources;
}

export function ViewingBench({ environment, roomBrightness, width }: { environment: THREE.WebGLRenderTarget; roomBrightness: number; width: number }) {
  const { materials: m } = useBenchResources(environment, roomBrightness, width);
  const legX = width / 2 - .32, legZ = [Z + .85, Z - .85], under = TOP - .06;
  const legBottom = F + .02, railLength = 2 * legX;
  return <group name="viewing-bench">
    {/* Linoleum top with a solid oak edge. */}
    <Box at={[0, TOP - .03, Z]} size={[width, .06, DEPTH]} material={m.top} />
    <Box at={[0, TOP - .03, Z + DEPTH / 2 + .011]} size={[width + .044, .062, .022]} material={m.edge} />
    {[-1, 1].map(side => <Box key={side} at={[side * (width / 2 + .011), TOP - .03, Z]} size={[.022, .062, DEPTH]} material={m.edge} />)}

    {/* Welded frame: legs with levelling feet, an apron and lower stretchers. */}
    {[-legX, legX].flatMap(x => legZ.map(z => <group key={`${x}-${z}`}>
      <Box at={[x, (under + legBottom) / 2, z]} size={[.06, under - legBottom, .06]} material={m.frame} />
      <Cylinder at={[x, F + .01, z]} radius={.026} height={.02} material={m.darkSteel} segments={12} />
    </group>))}
    {legZ.map(z => <Box key={z} at={[0, under - .035, z]} size={[railLength, .07, .04]} material={m.frame} />)}
    {[-legX, legX].map(x => <Box key={x} at={[x, under - .035, Z]} size={[.04, .07, legZ[0] - legZ[1]]} material={m.frame} />)}
    {legZ.map(z => <Box key={z} at={[0, SHELF - .035, z]} size={[railLength, .04, .04]} material={m.frame} />)}
    {[-legX, legX].map(x => <Box key={x} at={[x, SHELF - .035, Z]} size={[.04, .04, legZ[0] - legZ[1]]} material={m.frame} />)}
    <Box at={[0, SHELF - .009, Z]} size={[railLength - .02, .018, legZ[0] - legZ[1] + .04]} material={m.ply} />

    {/* Negative archive: binders with labelled spines, and archive boxes. */}
    <group name="negative-archive" position={[-legX + .32, SHELF, Z + .45]}>
      {BINDERS.map((_, i) => {
        const lean = i === BINDERS.length - 1 ? -.22 : 0;
        return <group key={i} position={[i * .058 + (lean ? .03 : 0), 0, 0]} rotation={[0, 0, lean]}>
          <Box at={[0, .155, 0]} size={[.052, .31, .29]} material={m.binders[i]} />
          <mesh position={[0, .155, .1455]} material={m.spines[i]}><planeGeometry args={[.05, .3]} /></mesh>
        </group>;
      })}
    </group>
    {[[-.15, .45, 0], [.42, .5, -.04]].map(([x, z, yaw], i) => <group key={i} position={[x, SHELF, Z + z]} rotation={[0, yaw, 0]}>
      <Box at={[0, .13, 0]} size={[.42, .26, .34]} material={m.archive} />
      <Box at={[0, .265, 0]} size={[.43, .03, .35]} material={m.archiveLid} />
      <mesh position={[0, .14, .1705]} material={m.labels[i]}><planeGeometry args={[.2, .15]} /></mesh>
    </group>)}
  </group>;
}
