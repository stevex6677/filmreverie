import { RoomLighting } from "./RoomLighting";
import { RoomShell } from "./RoomShell";
import { ViewingBench } from "./ViewingBench";
import { WetSide } from "./WetSide";
import { PrintingStation } from "./PrintingStation";
import { useDarkroomEnvironment } from "./DarkroomParts";
import { ROOM_ENVELOPE } from "../utils/cameraBounds";
import { getTableIllumination } from "../shaders/tableIllumination";

interface DarkroomRoomProps {
  benchWidth?: number;
  cabinetOnly?: boolean;
  brightness?: number;
  roomBrightness: number;
  immediate: boolean;
}

export const DarkroomRoom: React.FC<DarkroomRoomProps> = ({ cabinetOnly = false, brightness = 1.0, roomBrightness, immediate, benchWidth = 4.4 }) => {
  const environment = useDarkroomEnvironment();

  return (
    <group position={[0, 0, 0]}>
      <RoomLighting brightness={roomBrightness} immediate={immediate} fixturesVisible={!cabinetOnly} />
      <group visible={!cabinetOnly}>
      {/* Short-range distributed bounce from the diffuser onto nearby objects. */}
      {[-1.45, 0, 1.45].map(x => (
        <pointLight key={x} name="table-spill" position={[x, -0.27, -0.10]} color="#edf2f7"
          intensity={getTableIllumination(brightness).spillIntensity} distance={1.2} decay={2} />
      ))}

      {/* Red safelight on the front wall: bakelite housing with a ruby filter. */}
      <group position={[-3.6, 2.7, ROOM_ENVELOPE.front]}>
        <mesh castShadow receiveShadow position={[0, 0, .006]}>
          <boxGeometry args={[.1, .14, .012]} />
          <meshStandardMaterial color="#211b17" roughness={.35} metalness={.1} />
        </mesh>
        <mesh castShadow position={[0, 0, .05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[.012, .012, .08, 12]} />
          <meshStandardMaterial color="#6d7275" roughness={.4} metalness={.8} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0, .066]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[.085, .04, .04, 32]} />
          <meshStandardMaterial color="#211b17" roughness={.35} metalness={.1} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0, .126]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[.1, .085, .09, 32]} />
          <meshStandardMaterial color="#211b17" roughness={.35} metalness={.1} />
        </mesh>
        {/* Self-lit filter, so its own lamp does not wash it out. */}
        <mesh position={[0, 0, .1715]}>
          <circleGeometry args={[.088, 32]} />
          <meshBasicMaterial color="#e0240c" />
        </mesh>
        {/* Ruby red safelight illumination casting across darkroom */}
        <pointLight position={[0, 0, .1]} color="#ff2600" intensity={1.8} distance={6.0} decay={2} />
      </group>

      <RoomShell environment={environment} roomBrightness={roomBrightness} />
      <WetSide environment={environment} roomBrightness={roomBrightness} />
      <PrintingStation environment={environment} roomBrightness={roomBrightness} />
      <ViewingBench environment={environment} roomBrightness={roomBrightness} width={benchWidth} />
      </group>
    </group>
  );
};
