import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ROOM_ENVELOPE } from "../utils/cameraBounds";

export function RoomLighting({ brightness, immediate, fixturesVisible = true }: { brightness: number; immediate: boolean; fixturesVisible?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const output = useRef(brightness);
  const target = useMemo(() => { const object = new THREE.Object3D(); object.position.set(0, -1.7, 2.7); return object; }, []);
  useFrame((_, delta) => {
    output.current = immediate ? brightness : THREE.MathUtils.lerp(output.current, brightness, 1 - Math.exp(-delta * 9));
    group.current?.traverse(object => {
      if (object instanceof THREE.Light) object.intensity = object.userData.maximum * output.current;
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.userData.luminous) object.material.emissiveIntensity = 3 * output.current;
    });
  });
  return <group ref={group}>
    <primitive object={target} />
    <spotLight position={[0, ROOM_ENVELOPE.ceiling - .23, 2.7]} target={target} angle={1.15} penumbra={.8} color="#fff0d9" intensity={10 * brightness} distance={8} decay={2} castShadow shadow-autoUpdate={false} shadow-needsUpdate shadow-mapSize={[512,512]} shadow-bias={-.0005} shadow-normalBias={.025} userData={{maximum:10}} />
    <hemisphereLight args={["#e6dfce", "#393b41", 1.1 * brightness]} userData={{ maximum: 1.1 }} />
    <mesh visible={fixturesVisible} position={[0, ROOM_ENVELOPE.ceiling - .014, 2.8]}><boxGeometry args={[7.6, .028, .028]} /><meshStandardMaterial color="#838379" metalness={.3} roughness={.6} /></mesh>
    {[-2.6, 0, 2.6].map(x => <group key={x} position={[x, ROOM_ENVELOPE.ceiling - .035, 2.7]}>
      <mesh visible={fixturesVisible}><boxGeometry args={[.48, .07, 1.45]} /><meshStandardMaterial color="#282b2c" roughness={.5} metalness={.5} /></mesh>
      <mesh visible={fixturesVisible} position={[0, -.04, 0]} userData={{ luminous: true }}><boxGeometry args={[.38, .012, 1.3]} /><meshStandardMaterial color="#ece6d7" emissive="#fff2d9" emissiveIntensity={3 * brightness} /></mesh>
      <pointLight position={[0, -.18, 0]} color="#fff0d9" intensity={14 * brightness} distance={8} decay={2} userData={{ maximum: 14 }} />
    </group>)}
  </group>;
}
