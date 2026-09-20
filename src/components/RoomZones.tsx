import { ROOM_ENVELOPE } from "../utils/cameraBounds";
const Box = ({ at, size, color = "#52565a", metal = 0 }: { at: [number, number, number]; size: [number, number, number]; color?: string; metal?: number }) => <mesh castShadow receiveShadow position={at}><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={metal ? .4 : .8} metalness={Math.min(metal, .35)} /></mesh>;
function Bench({ x }: { x: number }) {
  return <group position={[x, 0, 1.3]}>
    <Box at={[0, -.8, 0]} size={[.82, .08, 2.8]} color="#766a57" />
    {[-.31, .31].flatMap(a => [-1.25, 1.25].map(b => <Box key={`${a}-${b}`} at={[a, -1.27, b]} size={[.06, .86, .06]} color="#343a40" metal={.65} />))}
    <Box at={[0, -1.44, 0]} size={[.7, .05, 2.65]} color="#343a40" />
  </group>;
}
export function RoomZones() {
  const floor = ROOM_ENVELOPE.floor;
  return <group>
    <group position={[0, 0, 1.4]}>
    <Bench x={-3.22} />
    {/* Printing station: paper easel, paper storage, wall-mounted process board. */}
    <Box at={[-3.22, -.735, 2.05]} size={[.6, .035, .55]} color="#c6b78d" />
    <Box at={[-3.22, -.71, 2.05]} size={[.45, .008, .4]} color="#e4dfd3" />
    {[0, 1, 2].map(i => <Box key={i} at={[-3.22, -1.38 + i * .075, 1.5]} size={[.6, .07, .75]} color={i % 2 ? "#bd9760" : "#444b51"} />)}
    <Box at={[-3.76, .45, 1.4]} size={[.04, .75, 1.2]} color="#70675a" />
    {[0, 1, 2].map(i => <Box key={i} at={[-3.73, .47, 1 + i * .36]} size={[.008, .45, .26]} color="#c1baaa" />)}
    </group>
    {/* Complete developing station beneath the chemicals beside the door.
        Turn the long bench along the rear wall; keep its left end clear of the doorway. */}
    <group name="door-developing-bench" position={[1.9, 0, ROOM_ENVELOPE.back - .65]} rotation={[0, Math.PI / 2, 0]}>
    <group position={[-3.22, 0, -1.3]}>
    <Bench x={3.22} />
    {/* Wet bench: deep stainless sink with raised sides, faucet, three trays. */}
    <Box at={[3.22, -.74, .35]} size={[.68, .03, .65]} color="#414b50" metal={.8} />
    {[-1, 1].map(i => <group key={i}><Box at={[3.22 + i * .32, -.65, .35]} size={[.04, .2, .68]} metal={.8} /><Box at={[3.22, -.65, .35 + i * .32]} size={[.68, .2, .04]} metal={.8} /></group>)}
    <Box at={[3.5, -.43, .35]} size={[.035, .42, .035]} metal={.85} /><Box at={[3.39, -.24, .35]} size={[.25, .035, .035]} metal={.85} />
    {[1.12, 1.8, 2.48].map((z, i) => <group key={z}>
      <Box at={[3.22, -.725, z]} size={[.65, .035, .55]} color={["#dad5c7", "#7c9095", "#b2b7b2"][i]} />
      {[-1, 1].map(n => <group key={n}><Box at={[3.22 + n * .31, -.69, z]} size={[.025, .08, .55]} color="#bac1bf" /><Box at={[3.22, -.69, z + n * .26]} size={[.65, .08, .025]} color="#bac1bf" /></group>)}
    </group>)}
    {/* The drying equipment now lives with the chemistry near the door. */}
    </group>
    </group>
    <group position={[0, 0, ROOM_ENVELOPE.back - 5.1]}>
    {/* Closed rear entrance with frame, handle, hinges and threshold. */}
    <Box at={[-.8, floor + 1.15, 5.04]} size={[1.35, 2.3, .1]} color="#252a2c" />
    <Box at={[-.8, floor + 1.13, 4.97]} size={[1.17, 2.15, .045]} color="#605c52" />
    <Box at={[-.33, floor + 1.05, 4.92]} size={[.04, .24, .04]} metal={.8} />
    <Box at={[-.8, floor + .018, 4.9]} size={[1.35, .035, .25]} metal={.7} />
    {[-1.36, -.24].map(x => <Box key={x} at={[x, floor + 1.12, 4.935]} size={[.025, 2.1, .025]} color="#8a8170" />)}
    {/* Box storage removed: clear floor access to the entrance equipment. */}
    </group>
    {/* Floor seams and a flat anti-fatigue mat provide scale under the eye. */}
    <Box at={[0, floor + .009, 2]} size={[3.8, .018, 1.5]} color="#272c2e" />
    {[-3,-1.5,0,1.5,3].map(x => <Box key={x} at={[x, floor + .002, 2]} size={[.008, .003, 6.2]} color="#292d2e" />)}
  </group>;
}
