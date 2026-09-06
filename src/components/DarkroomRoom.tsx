import React from "react";

export const DarkroomRoom: React.FC = () => {
  const floorY = -1.15;
  const ceilingY = 2.4;
  const roomW = 7.6;
  const roomD = 6.2;
  const wallH = ceilingY - floorY;

  return (
    <group position={[0, 0, 0]}>
      {/* --- LIGHTING --- */}
      {/* Visible, warm-toned darkroom ambient so walls, floor, and bench are clearly defined */}
      <ambientLight color="#323846" intensity={0.75} />

      {/* Front directional light matching M1 viewing illumination */}
      <directionalLight
        position={[0, 2, 4]}
        color="#e2e8f0"
        intensity={0.8}
      />

      {/* Light table forward glow on workbench surface */}
      <pointLight
        position={[0, -0.2, 0.4]}
        color="#edf2f7"
        intensity={0.65}
        distance={3.2}
        decay={2}
      />

      {/* --- RED SAFELIGHT FIXTURE (Back Wall) --- */}
      <group position={[-1.6, 0.95, -1.05]}>
        {/* Wall bracket & fixture housing */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.34, 0.24, 0.14]} />
          <meshStandardMaterial color="#1a1c20" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Luminous ruby-red filter lens */}
        <mesh position={[0, 0, 0.071]}>
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
      <mesh position={[0, (floorY + ceilingY) / 2, -1.1]}>
        <planeGeometry args={[roomW, wallH]} />
        <meshStandardMaterial color="#21242c" roughness={0.88} />
      </mesh>

      {/* Back Wall Baseboard Trim */}
      <mesh position={[0, floorY + 0.06, -1.08]}>
        <boxGeometry args={[roomW, 0.12, 0.04]} />
        <meshStandardMaterial color="#16181e" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Wall-Mounted Equipment Shelf */}
      <mesh position={[0, 1.35, -0.98]}>
        <boxGeometry args={[4.6, 0.04, 0.24]} />
        <meshStandardMaterial color="#191b22" roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Left Wall */}
      <mesh
        position={[-roomW / 2, (floorY + ceilingY) / 2, 1.2]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[roomD, wallH]} />
        <meshStandardMaterial color="#1c1e26" roughness={0.9} />
      </mesh>

      {/* Right Wall */}
      <mesh
        position={[roomW / 2, (floorY + ceilingY) / 2, 1.2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[roomD, wallH]} />
        <meshStandardMaterial color="#1c1e26" roughness={0.9} />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, ceilingY, 1.2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color="#16181f" roughness={0.95} />
      </mesh>

      {/* Darkroom Floor */}
      <mesh position={[0, floorY, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color="#1e2129" roughness={0.75} metalness={0.15} />
      </mesh>

      {/* Subtle floor seams/runner for depth */}
      <mesh position={[0, floorY + 0.001, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW * 0.9, roomD * 0.9]} />
        <meshStandardMaterial
          color="#20232c"
          roughness={0.8}
          wireframe={true}
          transparent={true}
          opacity={0.06}
        />
      </mesh>

      {/* --- PHYSICAL WORKBENCH SUPPORTING THE VIEWING TABLE --- */}
      <group position={[0, 0, 0]}>
        {/* Solid Workbench Top (extends beneath and in front of the table) */}
        {/* Table is width 3.6, height 1.6 from Y = -0.80 to +0.80 */}
        <mesh position={[0, -0.83, -0.2]}>
          <boxGeometry args={[4.4, 0.06, 1.4]} />
          <meshStandardMaterial
            color="#272b35"
            roughness={0.55}
            metalness={0.25}
          />
        </mesh>

        {/* Workbench Edge Trim / Apron */}
        <mesh position={[0, -0.87, 0.49]}>
          <boxGeometry args={[4.42, 0.04, 0.04]} />
          <meshStandardMaterial color="#1f222a" roughness={0.5} metalness={0.5} />
        </mesh>

        {/* 4 Heavy Steel Legs from benchtop down to floor */}
        {/* Front-Left Leg */}
        <mesh position={[-2.05, (floorY - 0.86) / 2, 0.4]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#1b1d24" roughness={0.45} metalness={0.65} />
        </mesh>
        {/* Front-Left Foot Pad */}
        <mesh position={[-2.05, floorY + 0.015, 0.4]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#14151a" roughness={0.7} metalness={0.8} />
        </mesh>

        {/* Front-Right Leg */}
        <mesh position={[2.05, (floorY - 0.86) / 2, 0.4]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#1b1d24" roughness={0.45} metalness={0.65} />
        </mesh>
        {/* Front-Right Foot Pad */}
        <mesh position={[2.05, floorY + 0.015, 0.4]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#14151a" roughness={0.7} metalness={0.8} />
        </mesh>

        {/* Back-Left Leg */}
        <mesh position={[-2.05, (floorY - 0.86) / 2, -0.8]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#1b1d24" roughness={0.45} metalness={0.65} />
        </mesh>
        {/* Back-Left Foot Pad */}
        <mesh position={[-2.05, floorY + 0.015, -0.8]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#14151a" roughness={0.7} metalness={0.8} />
        </mesh>

        {/* Back-Right Leg */}
        <mesh position={[2.05, (floorY - 0.86) / 2, -0.8]}>
          <boxGeometry args={[0.09, -0.86 - floorY, 0.09]} />
          <meshStandardMaterial color="#1b1d24" roughness={0.45} metalness={0.65} />
        </mesh>
        {/* Back-Right Foot Pad */}
        <mesh position={[2.05, floorY + 0.015, -0.8]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#14151a" roughness={0.7} metalness={0.8} />
        </mesh>

        {/* Horizontal Stretcher Rails connecting legs */}
        <mesh position={[0, -0.96, -0.8]}>
          <boxGeometry args={[4.1, 0.04, 0.04]} />
          <meshStandardMaterial color="#1a1c22" roughness={0.5} metalness={0.6} />
        </mesh>
        <mesh position={[-2.05, -0.96, -0.2]}>
          <boxGeometry args={[0.04, 0.04, 1.2]} />
          <meshStandardMaterial color="#1a1c22" roughness={0.5} metalness={0.6} />
        </mesh>
        <mesh position={[2.05, -0.96, -0.2]}>
          <boxGeometry args={[0.04, 0.04, 1.2]} />
          <meshStandardMaterial color="#1a1c22" roughness={0.5} metalness={0.6} />
        </mesh>

        {/* Lower Storage Shelf (grounded relationship to floor) */}
        <mesh position={[0, floorY + 0.12, -0.2]}>
          <boxGeometry args={[4.1, 0.03, 1.2]} />
          <meshStandardMaterial color="#21242c" roughness={0.7} metalness={0.2} />
        </mesh>

        {/* --- DRAFTING CONSOLE STAND & RISER ARCHITECTURE --- */}
        {/* Left Console Base Rail on Workbench */}
        <mesh position={[-1.82, -0.78, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.76]} />
          <meshStandardMaterial color="#1a1c23" roughness={0.4} metalness={0.7} />
        </mesh>
        {/* Right Console Base Rail on Workbench */}
        <mesh position={[1.82, -0.78, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.76]} />
          <meshStandardMaterial color="#1a1c23" roughness={0.4} metalness={0.7} />
        </mesh>

        {/* Front Neoprene Cushion Feet */}
        <mesh position={[-1.75, -0.78, 0.34]}>
          <boxGeometry args={[0.10, 0.04, 0.08]} />
          <meshStandardMaterial color="#111215" roughness={0.9} />
        </mesh>
        <mesh position={[1.75, -0.78, 0.34]}>
          <boxGeometry args={[0.10, 0.04, 0.08]} />
          <meshStandardMaterial color="#111215" roughness={0.9} />
        </mesh>

        {/* Left Heavy Angled Support Cheek */}
        <mesh position={[-1.82, -0.15, -0.12]} rotation={[-0.436, 0, 0]}>
          <boxGeometry args={[0.05, 1.25, 0.14]} />
          <meshStandardMaterial color="#22252e" roughness={0.45} metalness={0.6} />
        </mesh>
        {/* Right Heavy Angled Support Cheek */}
        <mesh position={[1.82, -0.15, -0.12]} rotation={[-0.436, 0, 0]}>
          <boxGeometry args={[0.05, 1.25, 0.14]} />
          <meshStandardMaterial color="#22252e" roughness={0.45} metalness={0.6} />
        </mesh>

        {/* Left Heavy Rear Riser Strut (Connecting Workbench to Back of Console) */}
        <mesh position={[-1.25, -0.225, -0.515]} rotation={[0.23, 0, 0]}>
          <cylinderGeometry args={[0.032, 0.035, 1.18, 16]} />
          <meshStandardMaterial color="#1b1e25" roughness={0.35} metalness={0.8} />
        </mesh>
        {/* Left Strut Bench Mount Collar */}
        <mesh position={[-1.25, -0.78, -0.65]}>
          <cylinderGeometry args={[0.055, 0.055, 0.04, 16]} />
          <meshStandardMaterial color="#14161b" roughness={0.6} metalness={0.7} />
        </mesh>

        {/* Right Heavy Rear Riser Strut (Connecting Workbench to Back of Console) */}
        <mesh position={[1.25, -0.225, -0.515]} rotation={[0.23, 0, 0]}>
          <cylinderGeometry args={[0.032, 0.035, 1.18, 16]} />
          <meshStandardMaterial color="#1b1e25" roughness={0.35} metalness={0.8} />
        </mesh>
        {/* Right Strut Bench Mount Collar */}
        <mesh position={[1.25, -0.78, -0.65]}>
          <cylinderGeometry args={[0.055, 0.055, 0.04, 16]} />
          <meshStandardMaterial color="#14161b" roughness={0.6} metalness={0.7} />
        </mesh>

        {/* Console Transverse Cross-Brace Bar */}
        <mesh position={[0, -0.225, -0.515]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 2.52, 16]} />
          <meshStandardMaterial color="#191b22" roughness={0.4} metalness={0.75} />
        </mesh>

        {/* Workbench Power Cable Grommet & Cable Drop */}
        <mesh position={[1.65, -0.795, -0.55]}>
          <cylinderGeometry args={[0.04, 0.04, 0.015, 16]} />
          <meshStandardMaterial color="#111215" roughness={0.8} />
        </mesh>
        <mesh position={[1.65, -0.50, -0.45]} rotation={[0.3, 0, 0.15]}>
          <cylinderGeometry args={[0.012, 0.012, 0.65, 12]} />
          <meshStandardMaterial color="#18191c" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
};
