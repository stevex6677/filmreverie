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
    {/* The wet side and entrance along the rear wall live in WetSide. */}
    {/* Floor seams and a flat anti-fatigue mat provide scale under the eye. */}
    <Box at={[0, floor + .009, 2]} size={[3.8, .018, 1.5]} color="#272c2e" />
    {[-3,-1.5,0,1.5,3].map(x => <Box key={x} at={[x, floor + .002, 2]} size={[.008, .003, 6.2]} color="#292d2e" />)}
  </group>;
}
