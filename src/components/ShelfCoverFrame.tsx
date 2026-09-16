import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mm, WORLD_UNITS_PER_MM, COVER_FRAME_MM, SHELF_FLOOR, SHELF_FRAME_YAW, shelfArrangement } from '../data/physicalScale';
import { getPackaging } from '../data/filmPackaging';
import { frameAspect } from '../data/filmFormats';
import { rollRepository, StoredRoll } from '../storage/rollRepository';
import { photoCropOffset, photoCropScale } from '../utils/photoFraming';

// A small tabletop frame. Its opening preserves the editor's crop, including
// free-sized images, rather than imposing another portrait crop on the cover.
const { width: WIDTH, height: HEIGHT } = COVER_FRAME_MM;
function roundedRectangle(width: number, height: number, radius: number) {
  const shape = new THREE.Shape(), x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y); shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius); shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius); shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function useCover(roll: StoredRoll) {
  const [cover, setCover] = useState<{ texture: THREE.CanvasTexture; aspect: number; revision: string } | null>(null);
  const revision = `${roll.id}/${roll.coverId}/${roll.updatedAt}/${roll.format}/${roll.sizing}`;
  useEffect(() => {
    let cancelled = false, texture: THREE.CanvasTexture | undefined;
    const load = async () => {
      const { blob, frame } = await rollRepository.thumbnail(roll.id, roll.coverId);
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
  }, [roll.id, roll.coverId, roll.updatedAt, roll.format, roll.sizing, revision]);
  return cover?.revision === revision ? cover : null;
}

export function ShelfCoverFrame({ roll }: { roll: StoredRoll }) {
  const cover = useCover(roll);
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
  const shapes = useMemo(() => ({
    outer: roundedRectangle(WIDTH - .6, HEIGHT - .6, 2.5),
    inset: roundedRectangle(WIDTH - 3, HEIGHT - 3, 1.5),
    mat: roundedRectangle(WIDTH - 2 * COVER_FRAME_MM.woodBorder, HEIGHT - 2 * COVER_FRAME_MM.woodBorder, 1),
  }), []);
  const wood = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#795139', roughness: .48 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 frameWood;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nframeWood = position;');
      shader.fragmentShader = 'varying vec3 frameWood;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat grain = sin(frameWood.y * 6.0 + sin(frameWood.x * .12) * 2.0); diffuseColor.rgb *= .92 + .08 * grain;');
    };
    return material;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  const aspect = cover?.aspect ?? frameAspect(roll.format);
  const width = Math.min(COVER_FRAME_MM.openingWidth, COVER_FRAME_MM.openingHeight * aspect), height = width / aspect;
  const entry = getPackaging(roll.stockId, roll.format);
  const arrangement = shelfArrangement(entry.sizeMm[0], roll.format === '135', true, entry.sizeMm[2]);
  return <group name={`cover-frame:${roll.id}`} position={[arrangement.companionX, SHELF_FLOOR + mm(HEIGHT / 2), mm(6)]} rotation={[0, SHELF_FRAME_YAW, 0]} scale={WORLD_UNITS_PER_MM}>
    <mesh castShadow receiveShadow material={wood}>
      <extrudeGeometry args={[shapes.outer, { depth: COVER_FRAME_MM.depth, bevelEnabled: true, bevelThickness: .3, bevelSize: .3, bevelSegments: 3, steps: 1, curveSegments: 8 }]} />
    </mesh>
    <mesh position={[0, 0, 6.35]}><shapeGeometry args={[shapes.inset]} /><meshStandardMaterial color="#39261d" roughness={.6} /></mesh>
    <mesh position={[0, 0, 6.4]}><shapeGeometry args={[shapes.mat]} /><meshStandardMaterial color="#ede6d7" roughness={.95} emissive="#ede6d7" emissiveIntensity={.12} /></mesh>
    {/* The thin reveal between the print and mat reads as a bevel at shelf scale. */}
    <mesh position={[0, 0, 6.45]}><planeGeometry args={[width + .5, height + .5]} /><meshStandardMaterial color="#8c8271" roughness={1} /></mesh>
    <mesh name={`cover-print:${roll.id}`} userData={{ coverId: roll.coverId, ready: !!cover }} position={[0, 0, 6.5]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial key={cover?.texture.uuid ?? 'empty'} map={cover?.texture ?? null} color={cover ? '#ffffff' : '#d4cbb9'} toneMapped={false} />
    </mesh>
    {/* A rear easel and a contact shadow give the frame weight on the shelf. */}
    <mesh position={[0, -HEIGHT / 2 + 31, -10]} rotation={[-.35, 0, 0]} castShadow><boxGeometry args={[17, 65, 1.3]} /><meshStandardMaterial color="#382c21" roughness={.9} /></mesh>
    <mesh position={[0, -HEIGHT / 2 + .05, -3.3]} rotation={[-Math.PI / 2, 0, 0]} scale={[WIDTH + 3.3, 32, 1]}><circleGeometry args={[.5, 32]} /><meshBasicMaterial color="#080807" transparent opacity={.3} depthWrite={false} /></mesh>
  </group>;
}
