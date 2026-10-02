import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ROOM_ENVELOPE } from "../utils/cameraBounds";
import { Box, Cylinder, Part, useDisposeResources, useRoomReflections } from "./DarkroomParts";
import { lathe, sweptRect, tube } from "../utils/darkroomGeometry";
import { contactSheetTexture, corkTexture, labelTexture, ledTexture, negativeStripTexture, plasterTexture, printTexture, testStripTexture, trimmerTexture, woodTexture } from "../utils/darkroomTextures";

// The printing (dry) side along the left wall: a workbench against the wall
// with a colour-head enlarger, masking easel, timer, trimmer, paper and
// negatives, a pin board of test strips and a safelight above.
// Local frame: +x is the viewer's right facing the wall, +z leaves the wall.

const F = ROOM_ENVELOPE.floor;
const ROOM_DEPTH = ROOM_ENVELOPE.back - ROOM_ENVELOPE.front;
const TOP = -.76, SHELF = -1.394;
const BENCH = { length: 2.8, depth: .76, z: .41 };
/** Enlarger baseboard centre on the bench, carriage height and head offset from the column. */
const ENLARGER = { x: .78, z: .4, carriage: .64, head: .08 };
const BASE = .024;

function bellowsGeometry() {
  // A square pleated bellows: a four-sided lathe turned to face the axes.
  const points: [number, number][] = [[.05, 0]];
  for (let i = 0; i <= 12; i++) points.push([i % 2 ? .074 : .066, .004 + i * .0092]);
  points.push([.05, .118]);
  const geometry = lathe(points, 4).rotateY(Math.PI / 4);
  return geometry.toNonIndexed();
}

function usePrintingResources(environment: THREE.WebGLRenderTarget, roomBrightness: number) {
  const resources = useMemo(() => {
    const sleeveStrips = [6, 7, 8, 9, 10].map(seed => {
      const texture = negativeStripTexture(seed, false); texture.repeat.set(1, .27); return texture;
    });
    const textures = {
      plaster: plasterTexture([ROOM_DEPTH / 2.6, (ROOM_ENVELOPE.ceiling - F) / 2.6]),
      top: woodTexture("#6e5034", 29), ply: woodTexture("#8c6f4c", 37), frame: woodTexture("#5b3e27", 43),
      cork: corkTexture([2.2, 1.3]), contact: contactSheetTexture(5), trimmer: trimmerTexture(), led: ledTexture("12.5"),
      tests: [21, 22, 23, 24].map(seed => testStripTexture(seed)),
      prints: [printTexture(17, 1), printTexture(19, .8)],
      note: labelTexture(["GRADE 2½", "f/8 · 12 s · +2 sky"], { paper: "#f1ecd9", accent: "#2f5f9e" }),
      paperLabels: [
        labelTexture(["VC RC PAPER", "GLOSSY · 8 × 10"], { paper: "#e9e4d8", accent: "#c4561e" }),
        labelTexture(["FIBRE BASE", "GRADE 2 · 8 × 10"], { paper: "#e6e2d4", accent: "#2f5f9e" }),
        labelTexture(["VC RC PAPER", "PEARL · 11 × 14"], { paper: "#e9e4d8", accent: "#c4561e" }),
      ],
      sleeveStrips,
    };
    const env = { envMap: environment.texture };
    const std = (parameters: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(parameters);
    const materials = {
      plaster: std({ color: "#575953", map: textures.plaster, roughness: .93 }),
      paint: std({ color: "#242625", roughness: .75 }),
      top: std({ color: "#ffffff", map: textures.top, roughness: .55, ...env }),
      ply: std({ color: "#ffffff", map: textures.ply, roughness: .8 }),
      boardFrame: std({ color: "#ffffff", map: textures.frame, roughness: .6 }),
      frame: std({ color: "#2f3436", metalness: .35, roughness: .55, ...env }),
      darkSteel: std({ color: "#6d7275", metalness: .8, roughness: .4, ...env }),
      chrome: std({ color: "#d4d9dc", metalness: 1, roughness: .12, ...env }),
      aluminium: std({ color: "#b8bcbe", metalness: .8, roughness: .35, ...env }),
      enamel: std({ color: "#c3beb1", metalness: .1, roughness: .42, ...env }),
      enamelDark: std({ color: "#8f8a7e", metalness: .1, roughness: .5, ...env }),
      laminate: std({ color: "#55534e", roughness: .7, ...env }),
      black: std({ color: "#151515", metalness: .2, roughness: .55, ...env }),
      bellows: std({ color: "#121212", roughness: .85, flatShading: true }),
      lensGlass: std({ color: "#0b0f12", metalness: .6, roughness: .05, ...env }),
      redFilter: std({ color: "#b0140a", emissive: "#3a0200", roughness: .15, transparent: true, opacity: .82, ...env }),
      dials: ["#d8b21c", "#b8236b", "#1c8fb3"].map(color => std({ color, roughness: .4 })),
      easel: std({ color: "#d2cdbf", roughness: .5, ...env }),
      paper: std({ color: "#f2efe8", roughness: .9 }),
      cork: std({ color: "#ffffff", map: textures.cork, roughness: .95 }),
      contact: std({ map: textures.contact, roughness: .5 }),
      tests: textures.tests.map(map => std({ map, roughness: .45 })),
      prints: textures.prints.map(map => std({ map, roughness: .45 })),
      note: std({ map: textures.note, roughness: .8 }),
      pins: ["#c0392b", "#e2b53e", "#2f6db5", "#f2efe8"].map(color => std({ color, roughness: .3, ...env })),
      timer: std({ color: "#2e3235", roughness: .45, metalness: .25, ...env }),
      led: std({ color: "#000000", emissiveMap: textures.led, emissive: "#ffffff", emissiveIntensity: .9, roughness: .2, ...env }),
      buttons: ["#9a1d14", "#3c4144"].map(color => std({ color, roughness: .5 })),
      plastic: std({ color: "#e6e2d6", roughness: .5 }),
      cable: std({ color: "#111111", roughness: .7 }),
      trimmer: std({ map: textures.trimmer, roughness: .6 }),
      paperBox: std({ color: "#1e1e22", roughness: .6 }),
      paperBoxTop: std({ color: "#ddd8cc", roughness: .7 }),
      paperLabels: textures.paperLabels.map(map => std({ map, roughness: .7 })),
      trays: ["#e2ded3", "#7f8a8e", "#a3372b"].map(color => std({ color, roughness: .38, side: THREE.DoubleSide, ...env })),
      crate: std({ color: "#3b4144", roughness: .6, side: THREE.DoubleSide }),
      sleeve: std({ color: "#eef0ea", roughness: .35, transparent: true, opacity: .45, depthWrite: false, ...env }),
      sleeveStrips: textures.sleeveStrips.map(map => std({ map, alphaTest: .5, roughness: .25 })),
      notebook: std({ color: "#26324a", roughness: .7 }),
      pages: std({ color: "#ece8dc", roughness: .9 }),
      pencil: std({ color: "#d9a521", roughness: .5 }),
      bakelite: std({ color: "#211b17", roughness: .35, metalness: .1, ...env }),
      // Self-lit, so the safelight's own lamp does not wash the filter out.
      safelightLens: new THREE.MeshBasicMaterial({ color: "#d8220b" }),
    };
    const H = ENLARGER.carriage, HZ = ENLARGER.head;
    const geometries = {
      head: new RoundedBoxGeometry(.24, .16, .27, 3, .016),
      carriage: new RoundedBoxGeometry(.1, .15, .085, 2, .01),
      timer: new RoundedBoxGeometry(.17, .07, .13, 3, .012),
      bellows: bellowsGeometry(),
      lens: lathe([[0, 0], [.024, 0], [.024, .006], [.019, .008], [.019, .022], [.021, .023], [.021, .04], [.017, .042], [.015, .048], [0, .048]]),
      cup: lathe([[0, 0], [.034, 0], [.038, .1], [.035, .1], [.031, .004], [0, .004]], 20),
      tray: sweptRect(.5, .4, .03, [[.02, 0], [0, .064], [.002, .068], [.01, .068], [.028, .006]], { start: true, end: true }),
      crate: sweptRect(.42, .32, .025, [[0, 0], [0, .18], [.008, .18], [.008, .008]], { start: true }),
      // Lamp cord from the head to the timer, and the timer to the power strip.
      lampCord: tube([[ENLARGER.x + .06, TOP + H + .04, ENLARGER.z + HZ - .14], [ENLARGER.x + .09, TOP + H - .02, ENLARGER.z - .16], [ENLARGER.x + .12, TOP + .35, ENLARGER.z - .2],
        [ENLARGER.x + .17, TOP + .03, ENLARGER.z - .2], [1.08, TOP + .006, .3], [1.18, TOP + .008, .4], [1.21, TOP + .03, .44]], .0042, 64),
      mainsCord: tube([[1.17, TOP + .03, .44], [1.14, TOP + .006, .32], [1.1, TOP + .008, .13], [1.05, TOP + .07, .06], [1.01, TOP + .17, .05]], .0042),
    };
    return { textures, materials, geometries };
  }, [environment]);
  useDisposeResources(resources);
  useRoomReflections(resources.materials, roomBrightness);
  return resources;
}

type Resources = ReturnType<typeof usePrintingResources>;

function Workbench({ resources }: { resources: Resources }) {
  const { materials: m } = resources;
  const legX = BENCH.length / 2 - .07, legZ = [BENCH.z - BENCH.depth / 2 + .05, BENCH.z + BENCH.depth / 2 - .05];
  const under = TOP - .04, legTop = under, legBottom = F + .02;
  return <group name="printing-bench">
    {/* Oiled hardwood top with a back upstand, on a welded steel frame. */}
    <Box at={[0, TOP - .02, BENCH.z]} size={[BENCH.length, .04, BENCH.depth]} material={m.top} />
    <Box at={[0, TOP + .045, BENCH.z - BENCH.depth / 2 + .007]} size={[BENCH.length, .09, .014]} material={m.top} />
    {[-legX, legX].flatMap(x => legZ.map(z => <group key={`${x}-${z}`}>
      <Box at={[x, (legTop + legBottom) / 2, z]} size={[.045, legTop - legBottom, .045]} material={m.frame} />
      <Cylinder at={[x, F + .01, z]} radius={.02} height={.02} material={m.darkSteel} segments={12} />
    </group>))}
    {legZ.flatMap(z => [under - .03, SHELF - .035].map(y => <Box key={`${z}-${y}`} at={[0, y, z]} size={[2 * legX, y > -1 ? .06 : .035, .035]} material={m.frame} />))}
    {[-legX, legX].flatMap(x => [under - .03, SHELF - .035].map(y => <Box key={`${x}-${y}`} at={[x, y, BENCH.z]} size={[.035, y > -1 ? .06 : .035, legZ[1] - legZ[0]]} material={m.frame} />))}
    <Box at={[0, SHELF - .009, BENCH.z]} size={[2 * legX - .02, .018, legZ[1] - legZ[0] + .03]} material={m.ply} />
  </group>;
}

function Enlarger({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  const H = ENLARGER.carriage, HZ = ENLARGER.head, column = -.2;
  return <group name="enlarger" position={[ENLARGER.x, TOP, ENLARGER.z]}>
    {/* Baseboard and the column's foot casting. */}
    <Box at={[0, BASE / 2, 0]} size={[.46, BASE, .56]} material={m.laminate} />
    <Box at={[0, BASE + .0225, column]} size={[.16, .045, .11]} material={m.black} />
    {[-.055, .055].map(x => <Cylinder key={x} at={[x, BASE + .047, column + .03]} radius={.008} height={.006} material={m.chrome} segments={12} />)}
    {/* Extruded column with a rack, and the counterbalanced carriage. */}
    <Box at={[0, BASE + .045 + .5, column]} size={[.055, 1, .045]} material={m.aluminium} />
    <Box at={[0, BASE + 1.055, column]} size={[.062, .02, .052]} material={m.black} />
    <Box at={[0, BASE + .55, column + .0245]} size={[.014, .9, .004]} material={m.darkSteel} />
    <Part geometry={g.carriage} material={m.enamel} at={[0, H, column]} />
    <group position={[.06, H, column]}>
      <Cylinder at={[0, 0, 0]} radius={.03} height={.012} material={m.black} rotation={[0, 0, Math.PI / 2]} />
      <Box at={[.008, -.018, 0]} size={[.006, .036, .01]} material={m.chrome} />
      <Cylinder at={[.018, -.034, 0]} radius={.006} height={.022} material={m.black} rotation={[0, 0, Math.PI / 2]} segments={12} />
    </group>
    <Cylinder at={[-.058, H - .03, column]} radius={.014} height={.018} material={m.black} rotation={[0, 0, Math.PI / 2]} segments={12} />
    {[-.035, .035].map(x => <Box key={x} at={[x, H + .02, (column + HZ - .135) / 2]} size={[.014, .028, HZ - .135 - column]} material={m.aluminium} />)}

    {/* Colour head with yellow, magenta and cyan filtration dials. */}
    <Part geometry={g.head} material={m.enamel} at={[0, H + .03, HZ]} />
    {[-.06, -.03, 0, .03, .06].map(z => <Box key={z} at={[0, H + .111, HZ + z]} size={[.15, .003, .012]} material={m.black} />)}
    {[-.07, 0, .07].map((x, i) => <group key={x} position={[x, H + .045, HZ + .135]}>
      <mesh material={m.dials[i]} position={[0, 0, .002]}><torusGeometry args={[.023, .0035, 8, 32]} /></mesh>
      <Cylinder at={[0, 0, .01]} radius={.018} height={.02} material={m.black} rotation={[Math.PI / 2, 0, 0]} />
      <Box at={[0, .011, .0205]} size={[.003, .012, .002]} material={m.paper} />
    </group>)}
    <Box at={[0, H - .025, HZ + .137]} size={[.05, .014, .012]} material={m.black} />
    {/* Mixing box, negative stage with a carrier, bellows and lens. */}
    <Box at={[0, H - .075, HZ]} size={[.17, .05, .17]} material={m.enamelDark} />
    <Box at={[0, H - .111, HZ]} size={[.2, .022, .19]} material={m.black} />
    <Box at={[-.07, H - .111, HZ]} size={[.3, .006, .075]} material={m.darkSteel} />
    <Box at={[-.222, H - .111, HZ]} size={[.018, .014, .05]} material={m.black} />
    <Box at={[.11, H - .1, HZ + .05]} size={[.03, .008, .012]} material={m.chrome} />
    <Part geometry={g.bellows} material={m.bellows} at={[0, H - .24, HZ]} />
    <Box at={[0, H - .246, HZ]} size={[.11, .012, .11]} material={m.black} />
    {[-1, 1].map(side => <Cylinder key={side} at={[side * .072, H - .246, HZ]} radius={.017} height={.014} material={m.black} rotation={[0, 0, Math.PI / 2]} segments={16} />)}
    <Part geometry={g.lens} material={m.black} at={[0, H - .252, HZ]} rotation={[Math.PI, 0, 0]} />
    <mesh position={[0, H - .275, HZ]} material={m.chrome}><torusGeometry args={[.0215, .0018, 6, 32]} /></mesh>
    <mesh position={[0, H - .3005, HZ]} rotation={[Math.PI / 2, 0, 0]} material={m.lensGlass}><circleGeometry args={[.014, 24]} /></mesh>
    {/* Red swing filter, parked to one side. */}
    <Cylinder at={[.03, H - .29, HZ + .025]} radius={.004} height={.02} material={m.black} segments={8} />
    <Box at={[.05, H - .3, HZ + .04]} size={[.04, .003, .008]} material={m.black} rotation={[0, -.6, 0]} />
    <mesh position={[.075, H - .302, HZ + .058]} rotation={[Math.PI / 2, 0, 0]} material={m.redFilter}><circleGeometry args={[.024, 24]} /></mesh>

    {/* Masking easel holding a sheet of paper, with a grain focuser on it. */}
    <group position={[0, BASE, HZ]}>
      <Box at={[0, .007, 0]} size={[.36, .014, .3]} material={m.easel} />
      <mesh position={[0, .0145, .005]} rotation={[-Math.PI / 2, 0, 0]} material={m.paper}><planeGeometry args={[.254, .203]} /></mesh>
      <Box at={[0, .02, -.14]} size={[.36, .012, .02]} material={m.black} />
      {[-.13, .13].map(x => <Cylinder key={x} at={[x, .022, -.152]} radius={.006} height={.03} material={m.chrome} rotation={[0, 0, Math.PI / 2]} segments={12} />)}
      {[-.1, .11].map(z => <Box key={z} at={[0, .0165, z]} size={[.3, .004, .016]} material={m.black} />)}
      {[-.135, .135].map(x => <Box key={x} at={[x, .0165, .005]} size={[.016, .004, .23]} material={m.black} />)}
      <group position={[.05, .0145, .03]} rotation={[0, -.5, 0]}>
        <Cylinder at={[0, .004, 0]} radius={.028} height={.008} material={m.black} />
        <Cylinder at={[0, .035, 0]} radius={.016} height={.055} material={m.black} />
        <Cylinder at={[0, .072, .012]} radius={.012} height={.035} material={m.black} rotation={[.7, 0, 0]} />
      </group>
    </group>
  </group>;
}

function BenchTools({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  return <group name="printing-tools">
    {/* Enlarging timer, wired between the lamp and a wall power strip. */}
    <group position={[1.2, TOP, .52]} rotation={[0, -.3, 0]}>
      <Part geometry={g.timer} material={m.timer} at={[0, .035, 0]} />
      <mesh position={[0, .042, .0655]} material={m.led}><planeGeometry args={[.1, .036]} /></mesh>
      {[-.05, 0, .05].map((x, i) => <Cylinder key={x} at={[x, .072, .035]} radius={.009} height={.006} material={m.buttons[i === 0 ? 0 : 1]} segments={16} />)}
    </group>
    <Part geometry={g.lampCord} material={m.cable} />
    <Part geometry={g.mainsCord} material={m.cable} />
    <group position={[1.12, TOP + .17, 0]}>
      <Box at={[0, 0, .02]} size={[.4, .06, .04]} material={m.plastic} />
      {[-.11, 0, .11].map(x => <mesh key={x} position={[x, 0, .0405]} material={m.black}><circleGeometry args={[.016, 20]} /></mesh>)}
      <Box at={[-.11, 0, .05]} size={[.034, .034, .022]} material={m.black} />
      <Box at={[.175, 0, .042]} size={[.016, .02, .006]} material={m.buttons[0]} />
    </group>

    {/* Paper trimmer with a sliding cutting head. */}
    <group position={[-.98, TOP, .48]} rotation={[0, .06, 0]}>
      <Box at={[0, .007, 0]} size={[.42, .014, .32]} material={m.black} />
      <mesh position={[0, .0145, -.01]} rotation={[-Math.PI / 2, 0, 0]} material={m.trimmer}><planeGeometry args={[.4, .28]} /></mesh>
      {[-.2, .2].map(x => <Box key={x} at={[x, .025, .145]} size={[.02, .03, .02]} material={m.black} />)}
      <Cylinder at={[0, .03, .145]} radius={.007} height={.4} material={m.chrome} rotation={[0, 0, Math.PI / 2]} segments={12} />
      <Box at={[.08, .03, .145]} size={[.045, .028, .032]} material={m.buttons[0]} />
    </group>

    {/* Boxes of printing paper. */}
    <group position={[-.46, TOP, .3]} rotation={[0, -.08, 0]}>
      {[0, 1].map(i => <group key={i} position={[0, i * .08, 0]} rotation={[0, i * .09, 0]}>
        <Box at={[0, .025, 0]} size={[.29, .05, .235]} material={m.paperBox} />
        <Box at={[0, .062, 0]} size={[.295, .028, .24]} material={m.paperBoxTop} />
        <mesh position={[0, .0765, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.paperLabels[i]}><planeGeometry args={[.2, .15]} /></mesh>
      </group>)}
    </group>

    {/* Dodging and burning wands in a cup. */}
    <group position={[-.2, TOP, .17]}>
      <Part geometry={g.cup} material={m.timer} />
      {[[-.25, .1, "disc"], [.2, -.15, "oval"], [.05, .3, "card"]].map(([tilt, turn, kind]) => <group key={kind as string} rotation={[tilt as number, 0, turn as number]} position={[0, .01, 0]}>
        <Cylinder at={[0, .14, 0]} radius={.0015} height={.26} material={m.darkSteel} segments={6} />
        {kind === "card"
          ? <Box at={[0, .28, 0]} size={[.05, .035, .002]} material={m.black} />
          : <Cylinder at={[0, .28, 0]} radius={kind === "disc" ? .02 : .014} height={.002} material={m.black} rotation={[Math.PI / 2, 0, 0]} segments={20} />}
      </group>)}
    </group>

    {/* A sleeve of negatives, the print log and a stray test strip. */}
    <group position={[.2, TOP, .55]} rotation={[0, .12, 0]}>
      {resources.materials.sleeveStrips.map((material, i) => <mesh key={i} position={[0, .0012, -.12 + i * .05]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} material={material}><planeGeometry args={[.035, .23]} /></mesh>)}
      <mesh position={[0, .002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.sleeve}><planeGeometry args={[.25, .3]} /></mesh>
    </group>
    <group position={[-.16, TOP, .6]} rotation={[0, .3, 0]}>
      <Box at={[0, .006, 0]} size={[.15, .012, .21]} material={m.notebook} />
      <Box at={[.002, .006, 0]} size={[.146, .009, .2]} material={m.pages} />
      <Cylinder at={[.03, .016, .01]} radius={.0035} height={.17} material={m.pencil} rotation={[Math.PI / 2, 0, .2]} segments={6} />
    </group>
    <mesh position={[-.6, TOP + .001, .67]} rotation={[-Math.PI / 2, 0, .5 + Math.PI / 2]} material={m.tests[3]}><planeGeometry args={[.065, .26]} /></mesh>
  </group>;
}

function PinBoard({ resources }: { resources: Resources }) {
  const { materials: m } = resources;
  const W = 1.2, H = .72;
  const pinned: { material: THREE.Material; at: [number, number]; size: [number, number]; tilt: number }[] = [
    { material: m.contact, at: [-.33, -.02], size: [.254, .203], tilt: .03 },
    { material: m.tests[0], at: [-.1, -.05], size: [.065, .26], tilt: -.04 },
    { material: m.tests[1], at: [-.01, -.03], size: [.065, .26], tilt: .02 },
    { material: m.tests[2], at: [.08, -.06], size: [.065, .26], tilt: .05 },
    { material: m.prints[0], at: [.31, .08], size: [.203, .254], tilt: -.02 },
    { material: m.prints[1], at: [.35, -.2], size: [.16, .128], tilt: .04 },
    { material: m.note, at: [-.33, .23], size: [.12, .09], tilt: -.06 },
  ];
  return <group name="pin-board" position={[-.62, TOP + .62, 0]}>
    <Box at={[0, 0, .006]} size={[W, H, .012]} material={m.boardFrame} />
    <mesh position={[0, 0, .0125]} material={m.cork}><planeGeometry args={[W - .07, H - .07]} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <Box at={[0, side * (H - .035) / 2, .015]} size={[W, .035, .03]} material={m.boardFrame} />
      <Box at={[side * (W - .035) / 2, 0, .015]} size={[.035, H - .07, .03]} material={m.boardFrame} />
    </group>)}
    {pinned.map(({ material, at, size, tilt }, i) => <group key={i} position={[at[0], at[1], .014 + i * .0004]} rotation={[0, 0, tilt]}>
      <mesh material={material}><planeGeometry args={size} /></mesh>
      <mesh position={[0, size[1] / 2 - .012, .005]} material={m.pins[i % m.pins.length]}><sphereGeometry args={[.006, 10, 8]} /></mesh>
    </group>)}
  </group>;
}

function StoredSupplies({ resources }: { resources: Resources }) {
  const { materials: m, geometries: g } = resources;
  return <group name="printing-storage" position={[0, SHELF, 0]}>
    <group position={[-.85, 0, .42]} rotation={[0, .05, 0]}>
      <Box at={[0, .035, 0]} size={[.38, .07, .3]} material={m.paperBox} />
      <Box at={[0, .08, 0]} size={[.385, .025, .305]} material={m.paperBoxTop} />
      <mesh position={[0, .0926, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.paperLabels[2]}><planeGeometry args={[.24, .18]} /></mesh>
    </group>
    {[0, 1, 2].map(i => <Part key={i} geometry={g.tray} material={m.trays[i]} at={[-.1, i * .024, .42]} rotation={[0, i * .04 - .03, 0]} />)}
    <group position={[.75, 0, .4]} rotation={[0, -.06, 0]}>
      <Part geometry={g.crate} material={m.crate} />
      <Box at={[-.08, .06, -.02]} size={[.14, .12, .14]} material={m.paperBoxTop} />
      <Box at={[.1, .045, .04]} size={[.12, .09, .1]} material={m.paperBox} />
    </group>
  </group>;
}

function Safelight({ resources }: { resources: Resources }) {
  const { materials: m } = resources;
  // High on the wall, clear of the screening prints that hang along this wall.
  return <group name="printing-safelight" position={[.1, 2.2, 0]}>
    <Box at={[0, 0, .006]} size={[.08, .12, .012]} material={m.bakelite} />
    <Cylinder at={[0, 0, .07]} radius={.01} height={.12} material={m.darkSteel} rotation={[Math.PI / 2, 0, 0]} />
    <group position={[0, -.03, .16]} rotation={[1.0, 0, 0]}>
      <Cylinder at={[0, 0, 0]} radius={[.1, .085]} height={.09} material={m.bakelite} rotation={[Math.PI / 2, 0, 0]} />
      <Cylinder at={[0, 0, -.06]} radius={[.085, .04]} height={.04} material={m.bakelite} rotation={[Math.PI / 2, 0, 0]} />
      <mesh position={[0, 0, .046]} material={m.safelightLens}><circleGeometry args={[.088, 32]} /></mesh>
      <pointLight position={[0, 0, .12]} color="#ff3414" intensity={4} distance={4.5} decay={2} />
    </group>
  </group>;
}

export function PrintingStation({ environment, roomBrightness }: { environment: THREE.WebGLRenderTarget; roomBrightness: number }) {
  const resources = usePrintingResources(environment, roomBrightness);
  const { materials: m } = resources;
  const roomZ = (ROOM_ENVELOPE.front + ROOM_ENVELOPE.back) / 2;
  return <group name="printing-station" position={[-ROOM_ENVELOPE.width / 2, 0, roomZ]} rotation={[0, Math.PI / 2, 0]}>
    {/* Painted left wall with a skirting board. */}
    <mesh receiveShadow position={[0, (F + ROOM_ENVELOPE.ceiling) / 2, 0]} material={m.plaster}>
      <planeGeometry args={[ROOM_DEPTH, ROOM_ENVELOPE.ceiling - F]} />
    </mesh>
    <Box at={[0, F + .06, .01]} size={[ROOM_DEPTH, .12, .02]} material={m.paint} />
    <Workbench resources={resources} />
    <Enlarger resources={resources} />
    <BenchTools resources={resources} />
    <PinBoard resources={resources} />
    <StoredSupplies resources={resources} />
    <Safelight resources={resources} />
  </group>;
}
