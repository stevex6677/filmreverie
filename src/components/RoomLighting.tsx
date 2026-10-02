import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ROOM_ENVELOPE } from "../utils/cameraBounds";

/** Surface-mounted LED troffer: a white steel body, aluminium bezel and recessed opal diffuser. */
function Troffer({ visible, length, width }: { visible: boolean; length: number; width: number }) {
  return <group visible={visible}>
    <mesh><boxGeometry args={[width, .07, length]} /><meshStandardMaterial color="#d9d7cf" roughness={.55} metalness={.2} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * (width / 2 - .02), -.037, 0]}><boxGeometry args={[.04, .008, length]} /><meshStandardMaterial color="#b9bcbe" roughness={.3} metalness={.8} /></mesh>
      <mesh position={[0, -.037, side * (length / 2 - .02)]}><boxGeometry args={[width - .08, .008, .04]} /><meshStandardMaterial color="#b9bcbe" roughness={.3} metalness={.8} /></mesh>
    </group>)}
    <mesh position={[0, -.033, 0]} userData={{ luminous: true }}><boxGeometry args={[width - .08, .004, length - .08]} /><meshStandardMaterial color="#ece6d7" emissive="#fff2d9" emissiveIntensity={3} /></mesh>
  </group>;
}

export function RoomLighting({ brightness, immediate, fixturesVisible = true }: { brightness: number; immediate: boolean; fixturesVisible?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const output = useRef(brightness);
  const target = useMemo(() => { const object = new THREE.Object3D(); object.position.set(0, -1.7, 2.7); return object; }, []);
  const wetTarget = useMemo(() => { const object = new THREE.Object3D(); object.position.set(1.1, -.9, 6.45); return object; }, []);
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
    {/* Cable trunking feeding the fixtures, clipped to the ceiling. */}
    <group visible={fixturesVisible}>
      <mesh position={[0, ROOM_ENVELOPE.ceiling - .02, 3.62]}><boxGeometry args={[7.6, .04, .06]} /><meshStandardMaterial color="#d6d3c9" roughness={.6} /></mesh>
      {[-2.6, 0, 2.6].map(x => <mesh key={x} position={[x, ROOM_ENVELOPE.ceiling - .02, 3.5]}><boxGeometry args={[.05, .03, .2]} /><meshStandardMaterial color="#d6d3c9" roughness={.6} /></mesh>)}
    </group>
    {[-2.6, 0, 2.6].map(x => <group key={x} position={[x, ROOM_ENVELOPE.ceiling - .035, 2.7]}>
      <Troffer visible={fixturesVisible} length={1.45} width={.48} />
      <pointLight position={[0, -.18, 0]} color="#fff0d9" intensity={14 * brightness} distance={8} decay={2} userData={{ maximum: 14 }} />
    </group>)}
    {/* Work light over the rear sink; its static shadows ground the wet side. */}
    <primitive object={wetTarget} />
    <group position={[1.3, ROOM_ENVELOPE.ceiling - .035, 5.85]}>
      <group rotation={[0, Math.PI / 2, 0]}><Troffer visible={fixturesVisible} length={1.45} width={.48} /></group>
      <spotLight position={[0, -.2, 0]} target={wetTarget} angle={.62} penumbra={.65} color="#fff0d9" intensity={24 * brightness} distance={8} decay={2} castShadow shadow-autoUpdate={false} shadow-needsUpdate shadow-mapSize={[1024, 1024]} shadow-bias={-.0004} shadow-normalBias={.02} userData={{ maximum: 24 }} />
    </group>
  </group>;
}
