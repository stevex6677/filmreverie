import { useMemo } from "react";
import * as THREE from "three";
import { ROOM_ENVELOPE } from "../utils/cameraBounds";
import { Box, Cylinder, Part, useDisposeResources, useRoomReflections } from "./DarkroomParts";
import { lathe, roundedPlane, sweptRect, tube, type V3 } from "../utils/darkroomGeometry";
import { labelTexture, matTexture, negativeStripTexture, plasterTexture, printTexture, seeded, signTexture, tileTexture, timerDialTexture, woodTexture } from "../utils/darkroomTextures";

// The wet side along the rear wall: stainless sink with a tray line, tiled
// splashback, chemistry shelf, drying line and safelight, plus the entrance.
// Local frames face into the room: +x is the viewer's right, +z leaves the wall.

const F = ROOM_ENVELOPE.floor;
const RIM = -.76, SINK_FLOOR = -.93, SINK = { length: 2.8, depth: .74, z: .39 };
const TRAY = { width: .5, depth: .4, height: .068 };
const WIRE_Y = 1.25;

/** A hanging 35 mm strip with a gentle lengthwise curl and slight cupping. */
function filmStripGeometry(length: number, seed: number) {
  const geometry = new THREE.PlaneGeometry(.035, length, 2, 16), position = geometry.attributes.position, random = seeded(seed);
  const curl = .008 + random() * .012, phase = random() * Math.PI;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), t = position.getY(i) / length + .5;
    position.setZ(i, curl * Math.sin(t * Math.PI + phase) + .0025 * (x / .0175) ** 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function apronGeometry() {
  const geometry = new THREE.PlaneGeometry(.52, .86, 6, 10), position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), t = position.getY(i) / .86 + .5;
    position.setX(i, x * (t > .62 ? 1 - .42 * (t - .62) / .38 : 1));
    position.setZ(i, .025 * Math.sin(t * Math.PI) + .01 * Math.cos(x * 9) + (1 - t) * .015);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function useWetSideResources(environment: THREE.WebGLRenderTarget, roomBrightness: number) {
  const resources = useMemo(() => {
    const textures = {
      tiles: tileTexture([2.9 / .4, .62 / .4]),
      plaster: plasterTexture([ROOM_ENVELOPE.width / 2.6, (ROOM_ENVELOPE.ceiling - ROOM_ENVELOPE.floor) / 2.6]),
      shelf: woodTexture("#6b4a2f", 3), slats: woodTexture("#5d4430", 9),
      door: woodTexture("#5e4129", 17, true),
      dial: timerDialTexture(), mat: matTexture([10, 4]), sign: signTexture(),
      labels: [["DEVELOPER", "WORKING 1+1"], ["STOP BATH", "20 °C"], ["FIXER", "RAPID 1+4"]].map(lines => labelTexture(lines)),
      jugLabels: [["FIXER", "5 LITRE"], ["DEVELOPER", "STOCK"]].map(lines => labelTexture(lines, { paper: "#f4f1e8", accent: "#1f4f8c" })),
      paper: labelTexture(["PHOTO PAPER", "RC PEARL · 8 × 10"], { paper: "#e9e4d8", accent: "#c4561e" }),
      prints: [printTexture(3, .55), printTexture(7, 1), printTexture(12, 1)],
      strips: [[1, true], [2, true], [3, false], [4, true], [5, false]].map(([seed, colour]) => negativeStripTexture(seed as number, colour as boolean)),
    };
    const env = { envMap: environment.texture };
    const std = (parameters: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(parameters);
    const materials = {
      steel: std({ color: "#9aa0a4", metalness: .85, roughness: .3, ...env }),
      brushed: std({ color: "#7d8285", metalness: .7, roughness: .5, ...env }),
      darkSteel: std({ color: "#6d7275", metalness: .8, roughness: .4, ...env }),
      chrome: std({ color: "#d4d9dc", metalness: 1, roughness: .12, ...env }),
      frame: std({ color: "#3a403e", metalness: .35, roughness: .55, ...env }),
      bracket: std({ color: "#1c1e1f", metalness: .4, roughness: .5, ...env }),
      tiles: std({ color: "#ffffff", map: textures.tiles, roughness: .22, metalness: .05, ...env }),
      tileTrim: std({ color: "#cfcabd", roughness: .3, ...env }),
      plaster: std({ color: "#575953", map: textures.plaster, roughness: .93 }),
      shelf: std({ color: "#ffffff", map: textures.shelf, roughness: .62 }),
      slats: std({ color: "#ffffff", map: textures.slats, roughness: .75 }),
      door: std({ color: "#ffffff", map: textures.door, roughness: .5, ...env }),
      paint: std({ color: "#242625", roughness: .75 }),
      black: std({ color: "#0d0d0e", roughness: .9 }),
      rubber: std({ color: "#111111", roughness: .72, side: THREE.DoubleSide }),
      bakelite: std({ color: "#211b17", roughness: .35, metalness: .1, ...env }),
      timer: std({ color: "#30363a", roughness: .42, metalness: .25, ...env }),
      dial: std({ map: textures.dial, emissiveMap: textures.dial, emissive: "#a8dcb0", emissiveIntensity: .3, roughness: .2, ...env }),
      glass: std({ color: "#3e1d0b", roughness: .08, metalness: .05, ...env }),
      accordion: std({ color: "#5a381c", roughness: .45, ...env }),
      clear: std({ color: "#dfe8ea", roughness: .04, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide, ...env }),
      hdpe: std({ color: "#d9d4c6", roughness: .62, side: THREE.DoubleSide }),
      bucket: std({ color: "#5d686a", roughness: .55, side: THREE.DoubleSide }),
      tank: std({ color: "#25282a", roughness: .4, ...env }),
      lid: std({ color: "#7c1f19", roughness: .4, ...env }),
      reel: std({ color: "#c7cdd0", roughness: .3, transparent: true, opacity: .85, ...env }),
      paperBox: std({ color: "#1e1e22", roughness: .6 }),
      paperBoxTop: std({ color: "#ddd8cc", roughness: .7 }),
      bamboo: std({ color: "#c6a46c", roughness: .6 }),
      tongTips: ["#b9322a", "#d4a62a", "#2f5f9e"].map(color => std({ color, roughness: .5 })),
      trays: ["#e2ded3", "#a3372b", "#d9d5ca", "#7f8a8e"].map(color => std({ color, roughness: .38, side: THREE.DoubleSide, ...env })),
      liquids: [["#4a3c22", .62], ["#c9a227", .5], ["#b9c2bd", .32], ["#cfe3ea", .22]].map(([color, opacity]) =>
        std({ color: color as string, roughness: .02, metalness: .1, transparent: true, opacity: opacity as number, depthWrite: false, ...env })),
      water: std({ color: "#dbeff5", roughness: 0, transparent: true, opacity: .35, depthWrite: false, ...env }),
      prints: textures.prints.map(map => std({ map, roughness: .4 })),
      labels: textures.labels.map(map => std({ map, roughness: .7 })),
      jugLabels: textures.jugLabels.map(map => std({ map, roughness: .7 })),
      paperLabel: std({ map: textures.paper, roughness: .7 }),
      strips: textures.strips.map(map => std({ map, alphaTest: .5, side: THREE.DoubleSide, roughness: .22, ...env })),
      mat: std({ map: textures.mat, alphaTest: .5, roughness: .8 }),
      safelightLens: std({ color: "#7a0c04", emissive: "#ff2a12", emissiveIntensity: 1.6, roughness: .25 }),
      sign: std({ color: "#000000", emissiveMap: textures.sign, emissive: "#ffffff", emissiveIntensity: 1.1, roughness: .3 }),
      switchPlate: std({ color: "#e4dfd2", roughness: .45 }),
    };
    const geometries = {
      sink: sweptRect(SINK.length, SINK.depth, .035, [[0, 0], [0, .17], [.022, .17], [.022, .012]], { start: true, end: true }),
      tray: sweptRect(TRAY.width, TRAY.depth, .03, [[.02, 0], [0, TRAY.height - .004], [.002, TRAY.height], [.01, TRAY.height], [.028, .006]], { start: true, end: true }),
      liquid: roundedPlane(TRAY.width - .064, TRAY.depth - .064, .02),
      jug: sweptRect(.17, .12, .028, [[0, 0], [0, .23], [.035, .27], [.06, .275]], { start: true, end: true }),
      bottle: lathe([[0, 0], [.047, 0], [.05, .006], [.05, .14], [.046, .158], [.03, .18], [.017, .195], [.017, .212], [0, .212]]),
      accordion: lathe([[0, 0], [.058, 0], ...Array.from({ length: 15 }, (_, i) => [i % 2 ? .053 : .062, .012 + i * .0125] as [number, number]), [.035, .205], [.017, .215], [.017, .232], [0, .232]]),
      hdpeBottle: lathe([[0, 0], [.04, 0], [.042, .005], [.042, .13], [.022, .165], [.014, .17], [.014, .185], [0, .185]]),
      funnel: lathe([[.072, 0], [.07, .006], [.013, .075], [.012, .135]]),
      bucket: lathe([[0, 0], [.11, 0], [.14, .26], [.146, .262], [.135, .262], [.106, .012], [0, .012]]),
      label: new THREE.CylinderGeometry(.0506, .0506, .085, 20, 1, true, -.95, 1.9),
      strips: [0, 1, 2, 3, 4].map(i => filmStripGeometry(.86, i + 31)),
      apron: apronGeometry(),
      wire: tube([[-1.3, WIRE_Y, .1], [-.65, WIRE_Y - .022, .1], [0, WIRE_Y - .03, .1], [.65, WIRE_Y - .022, .1], [1.3, WIRE_Y, .1]], .0016, 64),
      spout: tube([[.64, -.42, .06], [.64, -.31, .07], [.64, -.27, .17], [.64, -.3, .3], [.64, -.38, .36]], .011),
      cord: tube([[-.9, .03, .08], [-.845, .012, .2], [-.835, -.012, .252], [-.86, -.12, .22], [-.95, -.24, .07], [-1, -.29, .02]], .0035),
      apronStrap: tube([[-.105, .43, .03], [-.05, .52, .012], [0, .55, .01], [.05, .52, .012], [.105, .43, .03]], .006),
    };
    return { textures, materials, geometries };
  }, [environment]);
  useDisposeResources(resources);
  useRoomReflections(resources.materials, roomBrightness);
  return resources;
}

type Resources = ReturnType<typeof useWetSideResources>;
type Mat = THREE.Material;
function Tongs({ material, tip, at, rotation }: { material: Mat; tip: Mat; at: V3; rotation: [number, number, number, string] }) {
  return <group position={at} rotation={rotation as unknown as THREE.Euler}>
    {[-1, 1].map(side => <group key={side} rotation={[0, side * .035, 0]}>
      <Box at={[side * .008, 0, .115]} size={[.012, .004, .23]} material={material} />
      <Box at={[side * .008, -.002, .225]} size={[.015, .008, .025]} material={tip} />
    </group>)}
    <Box at={[0, 0, .006]} size={[.03, .006, .012]} material={material} />
  </group>;
}

function SinkStation({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  const legY = (F + .025 + SINK_FLOOR) / 2, legH = SINK_FLOOR - F - .025, slatY = -1.423;
  const trays = [-1.06, -.5, .06, .64], spin = [.02, -.015, .012, -.025];
  return <group name="sink-station">
    {/* Stainless tub with an upstand against the tiles. */}
    <Part geometry={g.sink} material={m.steel} at={[0, SINK_FLOOR, SINK.z]} />
    <Box at={[0, RIM + .08, .031]} size={[SINK.length, .16, .022]} material={m.steel} />
    <mesh position={[1.2, SINK_FLOOR + .0135, .46]} rotation={[-Math.PI / 2, 0, 0]} material={m.black}><circleGeometry args={[.03, 24]} /></mesh>
    <mesh position={[1.2, SINK_FLOOR + .014, .46]} rotation={[-Math.PI / 2, 0, 0]} material={m.darkSteel}><torusGeometry args={[.032, .006, 8, 24]} /></mesh>

    {/* Welded stand with a slatted lower shelf. */}
    {[-1.34, 0, 1.34].flatMap(x => [.08, .7].map(z => <group key={`${x}-${z}`}>
      <Box at={[x, legY, z]} size={[.04, legH, .04]} material={m.frame} />
      <Cylinder at={[x, F + .0125, z]} radius={.022} height={.025} material={m.darkSteel} segments={12} />
    </group>))}
    {[.08, .7].flatMap(z => [-1.45, SINK_FLOOR - .02].map(y => <Box key={`${z}-${y}`} at={[0, y, z]} size={[2.72, .035, .035]} material={m.frame} />))}
    {[-1.34, 1.34].map(x => <Box key={x} at={[x, -1.45, .39]} size={[.035, .035, .58]} material={m.frame} />)}
    {[0, 1, 2, 3, 4, 5, 6].map(i => <Box key={i} at={[0, slatY, .12 + i * .09]} size={[2.66, .018, .07]} material={m.slats} />)}

    {/* Stock chemistry, a bucket and spare trays below. */}
    {[[-1.08, "fix"], [-.84, "dev"]].map(([x, kind], i) => <group key={kind} position={[x as number, slatY + .009, .42]} rotation={[0, i ? .12 : -.05, 0]}>
      <Part geometry={g.jug} material={m.hdpe} />
      <Cylinder at={[0, .29, 0]} radius={.022} height={.035} material={m.hdpe} segments={16} />
      <Cylinder at={[0, .31, 0]} radius={.025} height={.022} material={m.tongTips[2]} segments={16} />
      <mesh position={[.045, .265, 0]} rotation={[0, 0, Math.PI / 2]} material={m.hdpe}><torusGeometry args={[.035, .009, 8, 16, Math.PI]} /></mesh>
      <mesh position={[0, .12, .0605]} material={m.jugLabels[i]}><planeGeometry args={[.12, .09]} /></mesh>
    </group>)}
    <group position={[.15, slatY + .009, .4]}>
      <Part geometry={g.bucket} material={m.bucket} />
      <mesh position={[0, .25, 0]} rotation={[0, 0, 0]} material={m.darkSteel}><torusGeometry args={[.142, .003, 6, 24, Math.PI]} /></mesh>
    </group>
    {[0, 1, 2].map(i => <Part key={i} geometry={g.tray} material={m.trays[i === 1 ? 3 : 0]} at={[.82, slatY + .009 + i * .024, .4]} rotation={[0, i * .03, 0]} />)}
    <Part geometry={g.hdpeBottle} material={m.hdpe} at={[1.18, slatY + .009, .3]} />

    {/* Developer, stop, fix and wash trays standing in the sink. */}
    {trays.map((x, i) => <group key={x} position={[x, SINK_FLOOR + .012, .4]} rotation={[0, spin[i], 0]}>
      <Part geometry={g.tray} material={m.trays[i]} />
      <mesh position={[0, .046, 0]} geometry={g.liquid} material={m.liquids[i]} />
      {i !== 1 && <mesh position={[.01, .03, -.01]} rotation={[-Math.PI / 2, 0, [.12, 0, -.08, .2][i]]} material={m.prints[i === 0 ? 0 : i === 2 ? 1 : 2]}><planeGeometry args={[.254, .203]} /></mesh>}
      {i < 3 && <Tongs material={m.bamboo} tip={m.tongTips[i]} at={[.16, TRAY.height + .004, .19]} rotation={[.16, Math.PI + .45, 0, "YXZ"]} />}
    </group>)}
  </group>;
}

function Splashback({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  return <group name="splashback">
    <mesh receiveShadow position={[0, RIM + .31, .002]} material={m.tiles}><planeGeometry args={[2.9, .62]} /></mesh>
    <Box at={[0, RIM + .625, .007]} size={[2.92, .022, .014]} material={m.tileTrim} />
    {/* Mixer with a thermometer and a swing spout into the wash tray. */}
    {[.45, .83].map((x, i) => <group key={x}>
      <Cylinder at={[x, -.42, .006]} radius={.03} height={.012} material={m.chrome} rotation={[Math.PI / 2, 0, 0]} />
      <Cylinder at={[x, -.42, .035]} radius={.012} height={.055} material={m.chrome} rotation={[Math.PI / 2, 0, 0]} />
      <Cylinder at={[x, -.39, .06]} radius={.016} height={.03} material={m.chrome} />
      <Box at={[x, -.372, .06]} size={[.07, .012, .016]} material={m.chrome} rotation={[0, i ? .4 : -.4, 0]} />
      <mesh position={[x, -.365, .06]} rotation={[-Math.PI / 2, 0, 0]} material={m.tongTips[i ? 2 : 0]}><circleGeometry args={[.007, 12]} /></mesh>
    </group>)}
    <Cylinder at={[.64, -.42, .06]} radius={.019} height={.42} material={m.chrome} rotation={[0, 0, Math.PI / 2]} />
    <Cylinder at={[.64, -.45, .08]} radius={.03} height={.018} material={m.chrome} rotation={[Math.PI / 2, 0, 0]} />
    <mesh position={[.64, -.45, .09]} material={m.switchPlate}><circleGeometry args={[.025, 24]} /></mesh>
    <Box at={[.648, -.445, .091]} size={[.018, .002, .001]} material={m.tongTips[0]} rotation={[0, 0, .6]} />
    <Part geometry={g.spout} material={m.chrome} />
    <Cylinder at={[.64, -.38, .36]} radius={.013} height={.02} material={m.chrome} />
    <Cylinder at={[.64, (-.39 + SINK_FLOOR + .058) / 2, .36]} radius={.0035} height={-.39 - SINK_FLOOR - .058} material={m.water} segments={8} />
    {/* Outlet for the timer. */}
    <Box at={[-1, -.33, .009]} size={[.075, .115, .018]} material={m.switchPlate} />
    {[-.305, -.355].map(y => <mesh key={y} position={[-1, y, .0185]} material={m.black}><circleGeometry args={[.012, 16]} /></mesh>)}
    <Part geometry={g.cord} material={m.black} />
  </group>;
}

function ChemistryShelf({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  return <group name="chemistry-shelf">
    <Box at={[0, -.016, .12]} size={[2.5, .032, .24]} material={m.shelf} />
    {[-.95, .95].map(x => <group key={x}>
      <Box at={[x, -.13, .003]} size={[.03, .22, .006]} material={m.bracket} />
      <Box at={[x, -.035, .105]} size={[.03, .006, .2]} material={m.bracket} />
      <Box at={[x, -.12, .088]} size={[.012, .006, .235]} material={m.bracket} rotation={[-Math.PI / 4, 0, 0]} />
    </group>)}

    {/* GraLab-style interval timer. */}
    <group position={[-1, 0, .13]}>
      <Box at={[0, .105, 0]} size={[.2, .21, .11]} material={m.timer} />
      <Box at={[0, .213, -.005]} size={[.18, .008, .09]} material={m.timer} />
      <mesh position={[0, .125, .056]} material={m.dial}><circleGeometry args={[.074, 40]} /></mesh>
      <mesh position={[0, .125, .057]} material={m.darkSteel}><torusGeometry args={[.077, .006, 8, 40]} /></mesh>
      {[-.055, .055].map(x => <Cylinder key={x} at={[x, .03, .062]} radius={.011} height={.016} material={m.bakelite} rotation={[Math.PI / 2, 0, 0]} />)}
      <Box at={[0, .03, .058]} size={[.02, .03, .01]} material={m.tongTips[0]} />
    </group>

    {/* Developing tank and a loaded reel. */}
    <group position={[-.66, 0, .12]}>
      <Cylinder at={[0, .0675, 0]} radius={.058} height={.135} material={m.tank} />
      <Cylinder at={[0, .148, 0]} radius={.063} height={.028} material={m.lid} />
      <Cylinder at={[0, .172, 0]} radius={[.018, .032]} height={.022} material={m.tank} />
    </group>
    <group position={[-.53, 0, .19]}>
      {[.002, .036].map(y => <Cylinder key={y} at={[0, y, 0]} radius={.045} height={.004} material={m.reel} />)}
      <Cylinder at={[0, .019, 0]} radius={.012} height={.034} material={m.reel} />
    </group>

    {/* Labelled amber bottles, a collapsible bottle, a graduate and paper. */}
    {[-.37, -.22, -.07].map((x, i) => <group key={x} position={[x, 0, .11]} rotation={[0, [-.12, .05, .18][i], 0]}>
      <Part geometry={g.bottle} material={m.glass} />
      <Cylinder at={[0, .224, 0]} radius={.021} height={.028} material={i === 1 ? m.tongTips[1] : m.tank} />
      <mesh position={[0, .075, 0]} geometry={g.label} material={m.labels[i]} />
    </group>)}
    <group position={[.12, 0, .12]}>
      <Part geometry={g.accordion} material={m.accordion} />
      <Cylinder at={[0, .242, 0]} radius={.02} height={.022} material={m.tank} />
    </group>
    <group position={[.3, 0, .12]}>
      <Cylinder at={[0, .006, 0]} radius={.045} height={.012} material={m.reel} segments={6} />
      <mesh position={[0, .135, 0]} material={m.clear}><cylinderGeometry args={[.026, .026, .24, 20, 1, true]} /></mesh>
      <mesh position={[0, .058, 0]} material={m.liquids[1]}><cylinderGeometry args={[.0245, .0245, .09, 20]} /></mesh>
    </group>
    <group position={[.66, 0, .125]} rotation={[0, -.04, 0]}>
      <Box at={[0, .025, 0]} size={[.29, .05, .235]} material={m.paperBox} />
      <group rotation={[0, .07, 0]}>
        <Box at={[0, .07, 0]} size={[.27, .04, .215]} material={m.paperBoxTop} />
        <mesh position={[0, .0905, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.paperLabel}><planeGeometry args={[.2, .15]} /></mesh>
      </group>
    </group>
    <Part geometry={g.funnel} material={m.hdpe} at={[.98, 0, .12]} />
    <group position={[1.14, 0, .1]}>
      <Part geometry={g.hdpeBottle} material={m.hdpe} />
      <Cylinder at={[0, .195, 0]} radius={.017} height={.02} material={m.tongTips[2]} />
    </group>
  </group>;
}

function DryingLine({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  const strips = [-.95, -.6, -.25, .15, .55];
  return <group name="drying-line">
    {[-1.3, 1.3].map(x => <group key={x}>
      <Cylinder at={[x, WIRE_Y, .006]} radius={.018} height={.012} material={m.darkSteel} rotation={[Math.PI / 2, 0, 0]} />
      <Cylinder at={[x, WIRE_Y, .055]} radius={.005} height={.1} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
    </group>)}
    <Part geometry={g.wire} material={m.steel} />
    {strips.map((x, i) => {
      const wireY = WIRE_Y - .03 * (1 - (x / 1.3) ** 2), random = seeded(i + 51);
      return <group key={x} position={[x, wireY, .1]} rotation={[0, (random() - .5) * .5, (random() - .5) * .02]}>
        <Box at={[0, -.004, 0]} size={[.006, .022, .006]} material={m.steel} />
        <Box at={[0, -.03, 0]} size={[.045, .036, .012]} material={m.steel} />
        <Part geometry={g.strips[i]} material={m.strips[i]} at={[0, -.042 - .43, 0]} />
        <Box at={[0, -.042 - .86 + .01, 0]} size={[.042, .034, .014]} material={m.darkSteel} />
      </group>;
    })}
  </group>;
}

function Safelight({ resources }: { resources: Resources }) {
  const { materials: m } = resources;
  return <group name="wet-safelight" position={[-1.25, .6, 0]}>
    <Box at={[0, 0, .006]} size={[.08, .12, .012]} material={m.bakelite} />
    <Cylinder at={[0, 0, .07]} radius={.01} height={.12} material={m.darkSteel} rotation={[Math.PI / 2, 0, 0]} />
    <group position={[0, -.03, .16]} rotation={[.75, 0, 0]}>
      <Cylinder at={[0, 0, 0]} radius={[.1, .085]} height={.09} material={m.bakelite} rotation={[Math.PI / 2, 0, 0]} />
      <Cylinder at={[0, 0, -.06]} radius={[.085, .04]} height={.04} material={m.bakelite} rotation={[Math.PI / 2, 0, 0]} />
      <mesh position={[0, 0, .046]} material={m.safelightLens}><circleGeometry args={[.088, 32]} /></mesh>
      <pointLight position={[0, 0, .12]} color="#ff2a14" intensity={2.4} distance={3.5} decay={2} />
    </group>
  </group>;
}

export function WetSide({ environment, roomBrightness }: { environment: THREE.WebGLRenderTarget; roomBrightness: number }) {
  const resources = useWetSideResources(environment, roomBrightness);
  const { materials: m } = resources;
  return <group>
    {/* Painted rear wall with a skirting board. */}
    <mesh receiveShadow position={[0, (F + ROOM_ENVELOPE.ceiling) / 2, ROOM_ENVELOPE.back]} rotation={[0, Math.PI, 0]} material={m.plaster}>
      <planeGeometry args={[ROOM_ENVELOPE.width, ROOM_ENVELOPE.ceiling - F]} />
    </mesh>
    <Box at={[0, F + .06, ROOM_ENVELOPE.back - .01]} size={[ROOM_ENVELOPE.width, .12, .02]} material={m.paint} />
    <group name="wet-side" position={[1.9, 0, ROOM_ENVELOPE.back]} rotation={[0, Math.PI, 0]}>
      <SinkStation resources={resources} />
      <Splashback resources={resources} />
      <ChemistryShelf resources={resources} />
      <DryingLine resources={resources} />
      <Safelight resources={resources} />
      {/* Perforated rubber mat in front of the sink. */}
      <mesh receiveShadow position={[-.25, F + .014, 1.12]} material={m.mat}><boxGeometry args={[1.6, .012, .64]} /></mesh>
    </group>
    <DarkroomDoor resources={resources} />
  </group>;
}

function DarkroomDoor({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  const W = 1.1, H = 2.14;
  return <group name="darkroom-door" position={[-.8, F, ROOM_ENVELOPE.back]} rotation={[0, Math.PI, 0]}>
    <mesh position={[0, H / 2, .001]} material={m.black}><planeGeometry args={[W + .04, H]} /></mesh>
    {[-1, 1].map(side => <Box key={side} at={[side * (W / 2 + .065), (H + .09) / 2, .016]} size={[.09, H + .09, .032]} material={m.paint} />)}
    <Box at={[0, H + .045, .016]} size={[W + .22, .09, .032]} material={m.paint} />
    {/* Veneered leaf set back in the casing, with kick plate and brush seal. */}
    <Box at={[0, .012 + (H - .02) / 2, 0]} size={[W, H - .02, .045]} material={m.door} />
    <Box at={[0, .13, .024]} size={[W - .1, .2, .003]} material={m.brushed} />
    <Box at={[0, .012, .018]} size={[W - .02, .024, .012]} material={m.black} />
    <Box at={[0, .006, .05]} size={[W + .14, .012, .12]} material={m.darkSteel} />
    {/* Lever handle, escutcheon, hinges and overhead closer. */}
    <group position={[-W / 2 + .08, 1.02, 0]}>
      <Cylinder at={[0, 0, .028]} radius={.03} height={.01} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      <Cylinder at={[0, 0, .05]} radius={.008} height={.045} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      <Box at={[.055, 0, .072]} size={[.13, .017, .02]} material={m.steel} />
      <Cylinder at={[0, -.12, .026]} radius={.018} height={.007} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      <Box at={[0, -.122, .03]} size={[.004, .014, .002]} material={m.black} />
    </group>
    {[.25, 1.06, 1.88].map(y => <group key={y}>
      <Cylinder at={[W / 2 + .004, y, .02]} radius={.009} height={.1} material={m.darkSteel} segments={12} />
      <Box at={[W / 2 - .012, y, .0235]} size={[.024, .095, .002]} material={m.darkSteel} />
    </group>)}
    <Box at={[.3, H - .1, .05]} size={[.3, .055, .055]} material={m.darkSteel} />
    <Box at={[.03, H - .03, .065]} size={[.25, .014, .016]} material={m.darkSteel} rotation={[0, 0, .22]} />
    <Box at={[-.1, H + .03, .045]} size={[.06, .03, .025]} material={m.darkSteel} />
    {/* Lit warning sign, light switch and a rubber apron by the door. */}
    <group position={[0, H + .3, 0]}>
      <Box at={[0, 0, .03]} size={[.48, .14, .06]} material={m.bakelite} />
      <mesh position={[0, 0, .0605]} material={m.sign}><planeGeometry args={[.44, .12]} /></mesh>
    </group>
    <Box at={[-.79, 1.15, .006]} size={[.08, .12, .012]} material={m.switchPlate} />
    <Box at={[-.79, 1.16, .015]} size={[.012, .03, .01]} material={m.switchPlate} rotation={[.3, 0, 0]} />
    <group position={[-.97, 1.25, 0]}>
      <Cylinder at={[0, .55, .02]} radius={.007} height={.04} material={m.steel} rotation={[Math.PI / 2, 0, 0]} />
      <Part geometry={g.apron} material={m.rubber} at={[0, 0, .012]} />
      <Part geometry={g.apronStrap} material={m.rubber} />
    </group>
  </group>;
}
