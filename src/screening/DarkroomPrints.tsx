import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RollDefinition } from '../utils/rollLayout';
import type { FilmStockId } from '../data/filmStocks';
import { FILM_LOOK_GLSL, filmLookUniforms, updateFilmLook } from '../shaders/filmLook';
import { DISPLAY_FRAGMENT } from '../shaders/tableIllumination';
import { PHOTO_RADIANCE_GLSL, PHOTO_REFERENCE_OUTPUT } from '../shaders/photoRadiance';
import { filmGrainSeed } from '../data/filmLooks';
import { FILM_UNIT } from '../data/filmFormats';
import { printLayout, PRINT_WALL_X } from './prints';
import type { ScreeningSession } from './session';

// A print shows the positive photograph upright, cropped to the paper, with
// the roll's film look. It is lit evenly, like a print under a viewing lamp,
// and reaches the screen as the photograph's own colors: like film on the
// table, it is encoded for the renderer's ACES tone mapping rather than graded by it.
const printVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const printFragment = `
  uniform sampler2D uTexture;
  uniform vec2 uPhotoCrop;
  uniform vec2 uPhotoOffset;
  uniform float uPhotoRotation;
  uniform float uExposure;
  varying vec2 vUv;
  ${FILM_LOOK_GLSL}
  ${PHOTO_RADIANCE_GLSL}
  void main() {
    // As on the film (see filmShader): crop, then turn the image upright.
    vec2 p = (vUv - 0.5) * uPhotoCrop + uPhotoOffset;
    float c = cos(uPhotoRotation), s = sin(uPhotoRotation);
    vec2 photoUV = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec3 source = texture2D(uTexture, clamp(photoUV, vec2(0.0), vec2(1.0))).rgb;
    gl_FragColor = vec4(photoRadiance(applyFilmLook(source, vUv), uExposure * ${PHOTO_REFERENCE_OUTPUT.toFixed(10)}), 1.0);
    ${DISPLAY_FRAGMENT}
  }
`;

/** Lines of prints on the darkroom's left wall; mounted only for the Darkroom Prints reel. */
export function DarkroomPrints({ roll, textures, stockId, filmStrength, session }: {
  roll: RollDefinition; textures: THREE.Texture[]; stockId: FilmStockId; filmStrength: number; session: ScreeningSession;
}) {
  const layout = useMemo(() => printLayout(roll), [roll]);
  const materials = useMemo(() => layout.prints.map(print => {
    const material = new THREE.ShaderMaterial({ vertexShader: printVertex, fragmentShader: printFragment, uniforms: {
      ...filmLookUniforms(), uTexture: { value: null }, uExposure: { value: .95 },
      uPhotoCrop: { value: new THREE.Vector2(print.crop.x, print.crop.y) }, uPhotoOffset: { value: new THREE.Vector2(print.offset.x, -print.offset.y) }, uPhotoRotation: { value: print.rotation },
    } });
    return material;
  }), [layout]);
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials]);
  layout.prints.forEach((print, i) => {
    materials[i].uniforms.uTexture.value = textures[print.index] ?? null;
    updateFilmLook(materials[i], stockId, roll.frames[print.index]?.filmStrength ?? filmStrength, print.photo.width / FILM_UNIT, print.photo.height / FILM_UNIT, filmGrainSeed(roll.frames[print.index]?.id ?? String(i)));
  });
  const groups = useRef<(THREE.Group | null)[]>([]);
  // A gentle, deterministic sway about the line; none with reduced motion.
  useFrame(() => {
    const { time, reducedMotion } = session.sample;
    groups.current.forEach((group, i) => {
      if (!group) return;
      const phase = i * 1.7;
      group.rotation.z = reducedMotion ? 0 : .018 * Math.sin(time * .9 + phase);
      group.rotation.y = reducedMotion ? 0 : .012 * Math.sin(time * .6 + phase * .7);
    });
  });
  const paper = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: .92 }), []);
  const clip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b98a52', roughness: .7 }), []);
  const wire = useMemo(() => new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: .35, roughness: .35 }), []);
  useEffect(() => () => { paper.dispose(); clip.dispose(); wire.dispose(); }, [paper, clip, wire]);
  const zs = layout.lines.flatMap(line => [line.zFrom, line.zTo]);
  const lampZ = (Math.max(...zs) + Math.min(...zs)) / 2;
  // A spotlight's target must be in the scene graph for its direction to update.
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(PRINT_WALL_X, .5, lampZ);
  return <group name="screening-darkroom-prints">
    {/* A viewing lamp above the line lights the prints and the wall. */}
    <primitive object={target} />
    <spotLight position={[PRINT_WALL_X + 1.6, 2.6, lampZ]} target={target} angle={1.05} penumbra={.8} intensity={9} distance={7} decay={1.4} color="#fff2df" />
    {layout.lines.map((line, i) => <mesh key={`line-${i}`} material={wire} position={[PRINT_WALL_X, line.y, (line.zFrom + line.zTo) / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[.0025, .0025, Math.abs(line.zFrom - line.zTo), 6]} />
    </mesh>)}
    {layout.prints.map((print, i) => <group key={print.index} ref={node => { groups.current[i] = node; }} position={print.hang}>
      {/* Pivot at the clips; the print faces into the room (+x). */}
      <group position={[0, print.center[1] - print.hang[1], 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh material={paper}><planeGeometry args={[print.paper.width, print.paper.height]} /></mesh>
        <mesh material={materials[i]} position={[0, 0, .001]}><planeGeometry args={[print.photo.width, print.photo.height]} /></mesh>
      </group>
      {[-1, 1].map(side => <mesh key={side} material={clip} position={[.004, -.012, side * print.paper.width * .36]}>
        <boxGeometry args={[.012, .05, .018]} />
      </mesh>)}
    </group>)}
  </group>;
}
