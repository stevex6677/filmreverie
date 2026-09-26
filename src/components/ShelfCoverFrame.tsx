import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mm, WORLD_UNITS_PER_MM, COVER_FRAME_MM, SHELF_FLOOR, SHELF_FRAME_YAW, shelfArrangement } from '../data/physicalScale';
import { getPackaging } from '../data/filmPackaging';
import { frameAspect } from '../data/filmFormats';
import { rollRepository, type StoredFrame, type StoredRoll } from '../storage/rollRepository';
import { photoCropOffset, photoCropScale } from '../utils/photoFraming';

export type ShelfCoverSource = (id: string, frameId: string) => Promise<{
  blob: Blob;
  frame: Pick<StoredFrame, 'id' | 'width' | 'height' | 'rotation' | 'cropPosition'>;
  rotation: number;
}>;
const localCoverSource: ShelfCoverSource = (id, frameId) => rollRepository.thumbnail(id, frameId);

// A small tabletop frame. Its opening preserves the editor's crop, including
// free-sized images, rather than imposing another portrait crop on the cover.
function roundedRectangle(width: number, height: number, radius: number) {
  const shape = new THREE.Shape(), x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y); shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius); shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius); shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function roundedRectangleHole(width: number, height: number, radius: number) {
  const path = new THREE.Path(), x = -width / 2, y = -height / 2;
  path.moveTo(x + radius, y);
  path.quadraticCurveTo(x, y, x, y + radius);
  path.lineTo(x, y + height - radius); path.quadraticCurveTo(x, y + height, x + radius, y + height);
  path.lineTo(x + width - radius, y + height); path.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
  path.lineTo(x + width, y + radius); path.quadraticCurveTo(x + width, y, x + width - radius, y);
  path.lineTo(x + radius, y);
  return path;
}

function rectangularHole(width: number, height: number) {
  const path = new THREE.Path(), x = -width / 2, y = -height / 2;
  path.moveTo(x, y);
  path.lineTo(x, y + height);
  path.lineTo(x + width, y + height);
  path.lineTo(x + width, y);
  path.lineTo(x, y);
  return path;
}

function useCover(roll: StoredRoll, coverSource: ShelfCoverSource) {
  const [cover, setCover] = useState<{ texture: THREE.CanvasTexture; aspect: number; revision: string } | null>(null);
  const revision = `${roll.id}/${roll.coverId}/${roll.updatedAt}/${roll.format}/${roll.sizing}`;
  useEffect(() => {
    let cancelled = false, texture: THREE.CanvasTexture | undefined;
    const load = async () => {
      const { blob, frame } = await coverSource(roll.id, roll.coverId);
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image(); image.src = url; await image.decode();
        if (cancelled) return;
        const aspect = frameAspect(roll.format, roll.sizing, frame);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(512 * Math.min(1, aspect)));
        canvas.height = Math.max(1, Math.round(512 / Math.max(1, aspect)));
        const context = canvas.getContext('2d'); if (!context) return;
        const rotated = frame.rotation % 180 !== 0;
        const scale = Math.max(canvas.width / (rotated ? image.height : image.width), canvas.height / (rotated ? image.width : image.height));
        const crop = photoCropScale(frame.width / frame.height, aspect, frame.rotation);
        const offset = photoCropOffset(frame.width / frame.height, aspect, frame.rotation, frame.cropPosition);
        context.translate(canvas.width / 2 - offset.x * canvas.width / crop.x, canvas.height / 2 - offset.y * canvas.height / crop.y);
        context.rotate(frame.rotation * Math.PI / 180);
        context.drawImage(image, -image.width * scale / 2, -image.height * scale / 2, image.width * scale, image.height * scale);
        texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        setCover({ texture, aspect, revision });
      } finally { URL.revokeObjectURL(url); }
    };
    void load().catch(() => { /* Keep the empty mat visible; the roll remains editable. */ });
    return () => { cancelled = true; texture?.dispose(); };
  }, [coverSource, roll.id, roll.coverId, roll.updatedAt, roll.format, roll.sizing, revision]);
  return cover?.revision === revision ? cover : null;
}

export function ShelfCoverFrame({ roll, coverSource = localCoverSource }: { roll: StoredRoll; coverSource?: ShelfCoverSource }) {
  const cover = useCover(roll, coverSource);
  const { gl } = useThree();
  useEffect(() => {
    // Cover thumbnails load independently of the film on the light table.
    const update = (ready: boolean) => {
      const covers = JSON.parse(gl.domElement.dataset.shelfCovers ?? '{}');
      if (ready) covers[roll.id] = roll.coverId; else delete covers[roll.id];
      gl.domElement.dataset.shelfCovers = JSON.stringify(covers);
    };
    update(!!cover);
    return () => update(false);
  }, [gl, roll.id, roll.coverId, cover]);

  const { width: WIDTH, height: HEIGHT, depth: DEPTH, woodBorder, matBorder } = COVER_FRAME_MM;
  const innerW = WIDTH - 2 * woodBorder;
  const innerH = HEIGHT - 2 * woodBorder;
  const maxPhotoW = innerW - 2 * matBorder;
  const maxPhotoH = innerH - 2 * matBorder;

  const aspect = cover?.aspect ?? frameAspect(roll.format);
  const photoW = Math.min(maxPhotoW, maxPhotoH * aspect);
  const photoH = photoW / aspect;

  const frameShape = useMemo(() => {
    const shape = roundedRectangle(WIDTH - .8, HEIGHT - .8, 2.5);
    shape.holes.push(roundedRectangleHole(innerW, innerH, .8));
    return shape;
  }, [WIDTH, HEIGHT, innerW, innerH]);

  const matShape = useMemo(() => {
    const shape = roundedRectangle(innerW + 1.6, innerH + 1.6, .5);
    shape.holes.push(rectangularHole(photoW, photoH));
    return shape;
  }, [innerW, innerH, photoW, photoH]);

  const wood = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#4a2f1b', roughness: .40, metalness: .03 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 frameWood;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nframeWood = position;');
      shader.fragmentShader = 'varying vec3 frameWood;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wx = frameWood.x;
        float wy = frameWood.y;
        float wz = frameWood.z;
        bool isSide = abs(wx) * 115.33 > abs(wy) * 143.03;
        float rail = isSide ? wy : wx;
        float cross = isSide ? wx : wy;
        float wave = sin(rail * 0.08) * 1.5 + sin(rail * 0.22) * 0.6;
        float grainCoord = cross * 1.6 + wave + wz * 0.8;
        float ring = sin(grainCoord);
        float fine = sin(cross * 4.8 + wave * 1.5);
        float micro = sin(cross * 12.0 + rail * 0.3);
        float grain = 0.55 * ring + 0.30 * fine + 0.15 * micro;
        float g = grain * 0.5 + 0.5;
        vec3 deepWalnut = vec3(0.18, 0.11, 0.06);
        vec3 richWalnut = vec3(0.34, 0.21, 0.13);
        vec3 warmAmber  = vec3(0.44, 0.28, 0.17);
        vec3 woodRgb = mix(deepWalnut, richWalnut, smoothstep(0.15, 0.70, g));
        woodRgb = mix(woodRgb, warmAmber, smoothstep(0.65, 0.95, g) * 0.35);
        float mitre = abs(abs(wx) * 115.33 - abs(wy) * 143.03) / 143.03;
        woodRgb *= 0.78 + 0.22 * smoothstep(0.0, 0.02, mitre);
        diffuseColor.rgb = woodRgb;`
      );
    };
    return material;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);

  const entry = getPackaging(roll.stockId, roll.format);
  const arrangement = shelfArrangement(entry.sizeMm[0], roll.format === '135', true, entry.sizeMm[2]);

  return <group name={`cover-frame:${roll.id}`} position={[arrangement.companionX, SHELF_FLOOR + mm(HEIGHT / 2), mm(6)]} rotation={[0, SHELF_FRAME_YAW, 0]} scale={WORLD_UNITS_PER_MM}>
    {/* Sculpted wood moulding with sight-edge inner bevel and outer rounded chamfer */}
    <mesh castShadow receiveShadow material={wood}>
      <extrudeGeometry args={[frameShape, { depth: DEPTH - .6, bevelEnabled: true, bevelThickness: .7, bevelSize: .5, bevelSegments: 3, steps: 1, curveSegments: 8 }]} />
    </mesh>

    {/* Frame backing board */}
    <mesh position={[0, 0, .4]} receiveShadow>
      <boxGeometry args={[innerW + 2, innerH + 2, .8]} />
      <meshStandardMaterial color="#2d2218" roughness={.9} />
    </mesh>

    {/* Subtle dark rebate fillet where wood meets the mat */}
    <mesh position={[0, 0, .85]}>
      <planeGeometry args={[innerW + 1.2, innerH + 1.2]} />
      <meshStandardMaterial color="#1a1109" roughness={.9} />
    </mesh>

    {/* Photo print seated on the backing board */}
    <mesh name={`cover-print:${roll.id}`} userData={{ coverId: roll.coverId, ready: !!cover }} position={[0, 0, .9]}>
      <planeGeometry args={[photoW + 1.2, photoH + 1.2]} />
      <meshBasicMaterial key={cover?.texture.uuid ?? 'empty'} map={cover?.texture ?? null} color={cover ? '#ffffff' : '#d4cbb9'} toneMapped={false} />
    </mesh>

    {/* Mat board (passe-partout) with 45° beveled window cutout */}
    <mesh position={[0, 0, 1.1]} receiveShadow>
      <extrudeGeometry args={[matShape, { depth: .6, bevelEnabled: true, bevelThickness: .25, bevelSize: .2, bevelSegments: 2, steps: 1 }]} />
      <meshStandardMaterial color="#f4efe6" roughness={.92} emissive="#f4efe6" emissiveIntensity={.05} />
    </mesh>

    {/* Protective frame glazing / glass with subtle specular sheen */}
    <mesh position={[0, 0, 2.3]}>
      <planeGeometry args={[innerW + .4, innerH + .4]} />
      <meshStandardMaterial color="#ffffff" transparent opacity={.12} roughness={.06} metalness={.06} depthWrite={false} />
    </mesh>

    {/* Rear easel, hinge bracket, and soft contact shadow */}
    <mesh position={[0, -HEIGHT / 2 + 31, -10]} rotation={[-.35, 0, 0]} castShadow>
      <boxGeometry args={[18, 65, 1.4]} />
      <meshStandardMaterial color="#2d2218" roughness={.88} />
    </mesh>
    <mesh position={[0, -HEIGHT / 2 + 63, -.6]}>
      <boxGeometry args={[12, 6, 1.2]} />
      <meshStandardMaterial color="#7a6544" metalness={.7} roughness={.35} />
    </mesh>
    <mesh position={[0, -HEIGHT / 2 + .05, -3.3]} rotation={[-Math.PI / 2, 0, 0]} scale={[WIDTH + 4, 34, 1]}>
      <circleGeometry args={[.5, 32]} />
      <meshBasicMaterial color="#080807" transparent opacity={.32} depthWrite={false} />
    </mesh>
  </group>;
}
