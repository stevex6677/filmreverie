import { RoomLighting } from "./RoomLighting";
import { RoomZones } from "./RoomZones";
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
  const floorY = ROOM_ENVELOPE.floor;
  const ceilingY = ROOM_ENVELOPE.ceiling;
  const roomW = ROOM_ENVELOPE.width;
  const roomD = ROOM_ENVELOPE.back - ROOM_ENVELOPE.front;
  const roomZ = (ROOM_ENVELOPE.back + ROOM_ENVELOPE.front) / 2;
  const wallH = ceilingY - floorY;

  return (
    <group position={[0, 0, 0]}>
      <RoomLighting brightness={roomBrightness} immediate={immediate} fixturesVisible={!cabinetOnly} />
      <group visible={!cabinetOnly}>
      <RoomZones />
      {/* Short-range distributed bounce from the diffuser onto nearby objects. */}
      {[-1.45, 0, 1.45].map(x => (
        <pointLight key={x} position={[x, -0.27, -0.10]} color="#edf2f7"
          intensity={getTableIllumination(brightness).spillIntensity} distance={1.2} decay={2} />
      ))}

      {/* --- RED SAFELIGHT FIXTURE (Back Wall) --- */}
      <group position={[-3.6, 2.7, -1.30]}>
        {/* Wall bracket & fixture housing */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.34, 0.24, 0.14]} />
          <meshStandardMaterial color="#1a1c20" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Luminous ruby-red filter lens */}
        <mesh castShadow receiveShadow position={[0, 0, 0.071]}>
          <planeGeometry args={[0.28, 0.18]} />
          <meshStandardMaterial
            color="#ff1e00"
            emissive="#ff2800"
            emissiveIntensity={2.0}
            roughness={0.2}
          />
        </mesh>
        {/* Ruby red safelight illumination casting across darkroom */}
        <pointLight
          color="#ff2600"
          intensity={1.8}
          distance={6.0}
          decay={2}
        />
      </group>

      {/* --- ENCLOSED DARKROOM WALLS & BOUNDARIES --- */}
      {/* Back Wall */}
      <mesh castShadow receiveShadow position={[0, (floorY + ceilingY) / 2, ROOM_ENVELOPE.front]}>
        <planeGeometry args={[roomW, wallH]} />
        <meshStandardMaterial color="#494b48" roughness={0.88} />
      </mesh>

      {/* Back Wall Baseboard Trim */}
      <mesh castShadow receiveShadow position={[0, floorY + 0.06, ROOM_ENVELOPE.front + .02]}>
        <boxGeometry args={[roomW, 0.12, 0.04]} />
        <meshStandardMaterial color="#16181e" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Chemicals, timer and drying clips beside the rear entrance, in place
          of the removed box-storage unit. Faces into the room. */}
      <group name="door-processing-equipment" position={[1.9, 0, ROOM_ENVELOPE.back - 1.15]} rotation={[0, Math.PI, 0]}>
      {/* Wall-Mounted Equipment Shelf */}
      <mesh castShadow receiveShadow position={[0, 1.35, -0.98]}>
        <boxGeometry args={[2.7, 0.04, 0.24]} />
        <meshStandardMaterial color="#191b22" roughness={0.7} metalness={0.3} />
      </mesh>

      {/* --- EQUIPMENT ON WALL SHELF --- */}
      {/* 1. Classic Darkroom Interval Timer (GraLab 300 style) */}
      <group position={[-0.85, 1.51, -0.96]}>
        {/* Timer main rectangular housing */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.22, 0.24, 0.12]} />
          <meshStandardMaterial color="#2d3748" roughness={0.5} metalness={0.3} />
        </mesh>
        {/* Circular luminous dial face */}
        <mesh castShadow receiveShadow position={[0, 0.02, 0.061]}>
          <circleGeometry args={[0.08, 24]} />
          <meshStandardMaterial
            color="#e2e8f0"
            emissive="#a7f3d0"
            emissiveIntensity={0.25}
            roughness={0.3}
          />
        </mesh>
        {/* Dual rocker power/focus switches */}
        <mesh castShadow receiveShadow position={[-0.05, -0.07, 0.065]}>
          <boxGeometry args={[0.025, 0.035, 0.015]} />
          <meshStandardMaterial color="#dc2626" roughness={0.4} />
        </mesh>
        <mesh castShadow receiveShadow position={[0.05, -0.07, 0.065]}>
          <boxGeometry args={[0.025, 0.035, 0.015]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
      </group>

      {/* 2. Chemical Reagent Amber Jugs (Developer, Stop Bath, Fixer) */}
      <group position={[0.75, 1.49, -0.96]}>
        {/* Developer Jug */}
        <group position={[-0.28, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.22, 16]} />
            <meshStandardMaterial color="#78350f" roughness={0.25} metalness={0.1} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.022, 0.03, 0.04, 12]} />
            <meshStandardMaterial color="#1f2937" roughness={0.5} />
          </mesh>
          {/* Label */}
          <mesh castShadow receiveShadow position={[0, 0, 0.056]}>
            <planeGeometry args={[0.07, 0.10]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.8} />
          </mesh>
        </group>
        {/* Stop Bath Jug */}
        <group position={[0, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.22, 16]} />
            <meshStandardMaterial color="#78350f" roughness={0.25} metalness={0.1} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.022, 0.03, 0.04, 12]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.5} />
          </mesh>
          {/* Label */}
          <mesh castShadow receiveShadow position={[0, 0, 0.056]}>
            <planeGeometry args={[0.07, 0.10]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.8} />
          </mesh>
        </group>
        {/* Fixer Jug */}
        <group position={[0.28, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.22, 16]} />
            <meshStandardMaterial color="#78350f" roughness={0.25} metalness={0.1} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.022, 0.03, 0.04, 12]} />
            <meshStandardMaterial color="#2563eb" roughness={0.5} />
          </mesh>
          {/* Label */}
          <mesh castShadow receiveShadow position={[0, 0, 0.056]}>
            <planeGeometry args={[0.07, 0.10]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* 3. Film Drying Wire with Hanging Clips (Upper Left Wall) */}
      <group position={[-.15, 2.05, -0.92]}>
        <mesh castShadow receiveShadow position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.002, 0.002, 1.8, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.35} roughness={0.3} />
        </mesh>
        {/* Film clips & hanging test negative strips */}
        {[-0.6, -0.2, 0.2, 0.6].map((clipX, i) => (
          <group key={i} position={[clipX, 0, 0]}>
            {/* Wooden/metal clip */}
            <mesh castShadow receiveShadow position={[0, -0.03, 0]}>
              <boxGeometry args={[0.02, 0.06, 0.015]} />
              <meshStandardMaterial color="#d97706" roughness={0.6} />
            </mesh>
            {/* Hanging film strip */}
            <mesh castShadow receiveShadow position={[0, -0.22, 0]}>
              <planeGeometry args={[0.06, 0.32]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.2}
                metalness={0.1}
                transparent={true}
                opacity={0.7}
              />
            </mesh>
          </group>
        ))}
      </group>

      </group>

      {/* Left Wall */}
      <mesh
        position={[-roomW / 2, (floorY + ceilingY) / 2, roomZ]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[roomD, wallH]} />
        <meshStandardMaterial color="#414647" roughness={0.9} />
      </mesh>

      {/* Right Wall */}
      <mesh
        position={[roomW / 2, (floorY + ceilingY) / 2, roomZ]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[roomD, wallH]} />
        <meshStandardMaterial color="#414647" roughness={0.9} />
      </mesh>

      <mesh castShadow receiveShadow position={[0, (floorY + ceilingY) / 2, ROOM_ENVELOPE.back]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[roomW, wallH]} /><meshStandardMaterial color="#454744" roughness={.95} />
      </mesh>
      {/* Ceiling */}
      <mesh castShadow receiveShadow position={[0, ceilingY, roomZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color="#555750" roughness={0.95} />
      </mesh>

      {/* Darkroom Floor */}
      <mesh castShadow receiveShadow position={[0, floorY, roomZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color="#454846" roughness={0.85} metalness={0.25} />
      </mesh>

      {/* Subtle floor seams/runner for depth */}
      <mesh castShadow receiveShadow position={[0, floorY + 0.001, roomZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW * 0.9, roomD * 0.9]} />
        <meshStandardMaterial
          color="#20232c"
          roughness={0.8}
          wireframe={true}
          transparent={true}
          opacity={0.06}
        />
      </mesh>

      {/* --- PHYSICAL WORKBENCH SUPPORTING THE FLAT VIEWING TABLE --- */}
      <group position={[0, 0, 0]}>
        {/* Solid Workbench Top (extends beneath and around the flat light table) */}
        <mesh castShadow receiveShadow position={[0, -0.83, -0.10]}>
          <boxGeometry args={[benchWidth, 0.06, 2.0]} />
          <meshStandardMaterial
            color="#272b35"
            roughness={0.55}
            metalness={0.25}
          />
        </mesh>

        {/* Workbench Edge Trim / Apron */}
        <mesh castShadow receiveShadow position={[0, -0.87, 0.89]}>
          <boxGeometry args={[benchWidth + .02, 0.04, 0.04]} />
          <meshStandardMaterial color="#222630" roughness={0.45} metalness={0.55} />
        </mesh>

        {/* 4 Heavy Steel Legs from benchtop down to floor */}
        {/* Front-Left Leg */}
        <mesh castShadow receiveShadow position={[-1.88, (floorY - 0.86) / 2, 0.75]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#4a5568" roughness={0.25} metalness={0.35} />
        </mesh>
        {/* Front-Left Foot Pad */}
        <mesh castShadow receiveShadow position={[-1.88, floorY + 0.015, 0.75]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#2d3748" roughness={0.3} metalness={0.35} />
        </mesh>

        {/* Front-Right Leg */}
        <mesh castShadow receiveShadow position={[1.88, (floorY - 0.86) / 2, 0.75]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#4a5568" roughness={0.25} metalness={0.35} />
        </mesh>
        {/* Front-Right Foot Pad */}
        <mesh castShadow receiveShadow position={[1.88, floorY + 0.015, 0.75]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#2d3748" roughness={0.3} metalness={0.35} />
        </mesh>

        {/* Back-Left Leg */}
        <mesh castShadow receiveShadow position={[-1.88, (floorY - 0.86) / 2, -0.95]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#4a5568" roughness={0.25} metalness={0.35} />
        </mesh>
        {/* Back-Left Foot Pad */}
        <mesh castShadow receiveShadow position={[-1.88, floorY + 0.015, -0.95]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#2d3748" roughness={0.3} metalness={0.35} />
        </mesh>

        {/* Back-Right Leg */}
        <mesh castShadow receiveShadow position={[1.88, (floorY - 0.86) / 2, -0.95]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#4a5568" roughness={0.25} metalness={0.35} />
        </mesh>
        {/* Back-Right Foot Pad */}
        <mesh castShadow receiveShadow position={[1.88, floorY + 0.015, -0.95]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#2d3748" roughness={0.3} metalness={0.35} />
        </mesh>

        {/* Horizontal Stretcher Rails connecting legs */}
        <mesh castShadow receiveShadow position={[0, -1.28, -0.95]}>
          <boxGeometry args={[3.76, 0.04, 0.04]} />
          <meshStandardMaterial color="#2c313d" roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh castShadow receiveShadow position={[-1.88, -1.28, -0.10]}>
          <boxGeometry args={[0.04, 0.04, 1.7]} />
          <meshStandardMaterial color="#2c313d" roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh castShadow receiveShadow position={[1.88, -1.28, -0.10]}>
          <boxGeometry args={[0.04, 0.04, 1.7]} />
          <meshStandardMaterial color="#2c313d" roughness={0.4} metalness={0.7} />
        </mesh>

        {/* Lower Storage Shelf (grounded relationship to floor) */}
        <mesh castShadow receiveShadow position={[0, floorY + 0.18, -0.10]}>
          <boxGeometry args={[3.76, 0.03, 1.7]} />
          <meshStandardMaterial color="#252831" roughness={0.7} metalness={0.3} />
        </mesh>

        {/* Shelf Props: Darkroom Developer Trays on Lower Shelf */}
        <mesh castShadow receiveShadow position={[-0.85, floorY + 0.22, -0.10]}>
          <boxGeometry args={[0.48, 0.05, 0.58]} />
          <meshStandardMaterial color="#dbeafe" roughness={0.4} metalness={0.1} />
        </mesh>
        <mesh castShadow receiveShadow position={[-0.30, floorY + 0.22, -0.10]}>
          <boxGeometry args={[0.48, 0.05, 0.58]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.1} />
        </mesh>
        {/* Shelf Props: Photo Paper Boxes Stack */}
        <mesh castShadow receiveShadow position={[0.75, floorY + 0.23, -0.10]}>
          <boxGeometry args={[0.38, 0.07, 0.48]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.15} />
        </mesh>

        {/* Workbench Power Cable Grommet & Cable Drop */}
        <mesh castShadow receiveShadow position={[1.85, -0.795, -0.65]}>
          <cylinderGeometry args={[0.04, 0.04, 0.015, 16]} />
          <meshStandardMaterial color="#111215" roughness={0.8} />
        </mesh>
        <mesh castShadow receiveShadow position={[1.85, -0.85, -0.65]}>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
          <meshStandardMaterial color="#18191c" roughness={0.7} />
        </mesh>

        {/* Enlarger Station (Classic Beseler-style Vertical Enlarger on Right Workbench Wing) */}
        <group position={[-3.22, -0.75, 1.85]} scale={1.6}>
          {/* Wooden baseboard */}
          <mesh castShadow receiveShadow position={[0, 0, 0]}>
            <boxGeometry args={[0.32, 0.02, 0.42]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.65} metalness={0.15} />
          </mesh>
          {/* Vertical steel support column */}
          <mesh castShadow receiveShadow position={[0.08, 0.46, -0.14]}>
            <cylinderGeometry args={[0.016, 0.016, 0.92, 16]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.35} />
          </mesh>
          {/* Column carriage and arm */}
          <mesh castShadow receiveShadow position={[0.04, 0.52, -0.06]}>
            <boxGeometry args={[0.10, 0.08, 0.16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.7} />
          </mesh>
          {/* Enlarger lamphouse head */}
          <mesh castShadow receiveShadow position={[-0.02, 0.62, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 0.18, 16]} />
            <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.6} />
          </mesh>
          {/* Lamphouse top cap */}
          <mesh castShadow receiveShadow position={[-0.02, 0.73, 0]}>
            <cylinderGeometry args={[0.04, 0.07, 0.04, 16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
          </mesh>
          {/* Bellows stage */}
          <mesh castShadow receiveShadow position={[-0.02, 0.47, 0]}>
            <boxGeometry args={[0.09, 0.08, 0.09]} />
            <meshStandardMaterial color="#18181b" roughness={0.9} />
          </mesh>
          {/* Lens stage & red swing safety filter */}
          <mesh castShadow receiveShadow position={[-0.02, 0.41, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.03, 16]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh castShadow receiveShadow position={[-0.02, 0.38, 0.03]}>
            <cylinderGeometry args={[0.02, 0.02, 0.005, 12]} />
            <meshStandardMaterial color="#ef4444" roughness={0.1} transparent={true} opacity={0.75} />
          </mesh>
        </group>
      </group>
      </group>
    </group>
  );
};
