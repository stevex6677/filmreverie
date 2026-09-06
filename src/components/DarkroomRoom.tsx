import React from "react";

export const DarkroomRoom: React.FC = () => {
  const floorY = -0.75;
  const ceilingY = 2.45;
  const roomW = 8.0;
  const roomD = 7.0;
  const wallH = ceilingY - floorY;

  return (
    <group position={[0, 0, 0]}>
      {/* Red Darkroom Safelight on Back Wall */}
      <group position={[-1.6, 1.4, -2.8]}>
        {/* Safelight fixture housing */}
        <mesh>
          <boxGeometry args={[0.32, 0.22, 0.16]} />
          <meshStandardMaterial color="#1a1a1e" roughness={0.7} metalness={0.3} />
        </mesh>
        {/* Red glowing safelight diffuser lens */}
        <mesh position={[0, 0, 0.081]}>
          <planeGeometry args={[0.26, 0.16]} />
          <meshStandardMaterial
            color="#ff2200"
            emissive="#ff2a00"
            emissiveIntensity={1.2}
            roughness={0.2}
          />
        </mesh>
        {/* Red point light for ambient darkroom mood */}
        <pointLight color="#ff3300" intensity={0.7} distance={5.5} decay={2} />
      </group>

      {/* Subtle overhead fill for navigation */}
      <ambientLight color="#181a20" intensity={0.4} />
      <directionalLight position={[2, 3, 2]} color="#64748b" intensity={0.25} />

      {/* Floor */}
      <mesh position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color="#16171a" roughness={0.8} metalness={0.15} />
      </mesh>

      {/* Back Wall */}
      <mesh position={[0, (floorY + ceilingY) / 2, -roomD / 2]}>
        <planeGeometry args={[roomW, wallH]} />
        <meshStandardMaterial color="#1a1c22" roughness={0.9} />
      </mesh>

      {/* Left Wall */}
      <mesh position={[-roomW / 2, (floorY + ceilingY) / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[roomD, wallH]} />
        <meshStandardMaterial color="#17181d" roughness={0.9} />
      </mesh>

      {/* Right Wall */}
      <mesh position={[roomW / 2, (floorY + ceilingY) / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[roomD, wallH]} />
        <meshStandardMaterial color="#17181d" roughness={0.9} />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, ceilingY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color="#101114" roughness={0.95} />
      </mesh>

      {/* Workbench Sturdy Legs & Frame supporting the viewing table */}
      <group position={[0, 0, 0]}>
        {/* 4 Sturdy Legs */}
        <mesh position={[-1.7, (floorY) / 2, -0.7]}>
          <boxGeometry args={[0.08, -floorY, 0.08]} />
          <meshStandardMaterial color="#1e2025" roughness={0.5} metalness={0.7} />
        </mesh>
        <mesh position={[1.7, (floorY) / 2, -0.7]}>
          <boxGeometry args={[0.08, -floorY, 0.08]} />
          <meshStandardMaterial color="#1e2025" roughness={0.5} metalness={0.7} />
        </mesh>
        <mesh position={[-1.7, (floorY) / 2, 0.7]}>
          <boxGeometry args={[0.08, -floorY, 0.08]} />
          <meshStandardMaterial color="#1e2025" roughness={0.5} metalness={0.7} />
        </mesh>
        <mesh position={[1.7, (floorY) / 2, 0.7]}>
          <boxGeometry args={[0.08, -floorY, 0.08]} />
          <meshStandardMaterial color="#1e2025" roughness={0.5} metalness={0.7} />
        </mesh>

        {/* Lower storage shelf */}
        <mesh position={[0, floorY + 0.18, 0]}>
          <boxGeometry args={[3.4, 0.04, 1.4]} />
          <meshStandardMaterial color="#17181c" roughness={0.7} metalness={0.2} />
        </mesh>
      </group>
    </group>
  );
};
