import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { FILM_PACKAGING, FilmPackaging, getPackaging } from '../data/filmPackaging';
import { StoredRoll } from '../storage/rollRepository';
import { FilmShelfState } from '../utils/useFilmShelf';
import { packagingMaterial } from '../utils/packagingMaterial';
import { placeholderPackaging, SHELF_CAPACITY } from '../utils/shelfLayout';
import { ShelfCoverFrame } from './ShelfCoverFrame';

import { mm, WORLD_UNITS_PER_MM, CARTRIDGE_MM, SHELF_CELL_MM, SHELF_WIDTH, SHELF_HEIGHT, SHELF_FLOOR, SHELF_ORIGIN, SHELF_FILM_YAW, shelfArrangement } from '../data/physicalScale';
export { SHELF_ORIGIN } from '../data/physicalScale';
const WIDTH = mm(SHELF_CELL_MM.width), HEIGHT = mm(SHELF_CELL_MM.height), DEPTH = mm(SHELF_CELL_MM.depth);
const sourceImages = [...new Set(FILM_PACKAGING.flatMap(p => [p.singleRollArtwork ?? p.box.asset, ...(p.cartridge ? [p.cartridge.asset] : [])]))];
export function usePackagingTextures() {
  const { gl } = useThree();
  const [textures, setTextures] = useState<Record<string, THREE.Texture>>({});
  useEffect(() => { gl.domElement.dataset.packagingLoaded = String(Object.keys(textures).length); }, [gl, textures]);
  useEffect(() => {
    let cancelled = false;
    const loaded: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    for (const url of sourceImages) {
      const texture = loader.load(url, ready => {
        if (cancelled) return;
        ready.colorSpace = THREE.SRGBColorSpace;
        ready.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        setTextures(current => ({ ...current, [url]: ready }));
      }, undefined, () => { /* Plain physical package remains usable on failure. */ });
      loaded.push(texture);
    }
    return () => { cancelled = true; loaded.forEach(texture => texture.dispose()); };
  }, [gl]);
  return textures;
}

export function FilmPackage({ entry, owned, textures, standalone = false }: { entry: FilmPackaging; owned: boolean; textures: Record<string, THREE.Texture>; standalone?: boolean }) {
  const [w, h, d] = entry.sizeMm;
  const materials = useMemo(() => ({
    front: packagingMaterial(textures[entry.singleRollArtwork ?? entry.box.asset], entry.singleRollArtwork ? [[0, 0], [1, 0], [1, 1], [0, 1]] : entry.front, owned),
    top: packagingMaterial(entry.singleRollArtwork ? undefined : textures[entry.box.asset], entry.top, owned),
    body: packagingMaterial(undefined, undefined, owned, '#c3942c'),
    cartridge: packagingMaterial(entry.cartridge ? textures[entry.cartridge.asset] : undefined, entry.cartridgePanel, owned, '#161719'),
  }), [entry, textures, owned]);
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials]);
  const small = entry.format === '135';
  const arrangement = shelfArrangement(w, small, owned && !standalone, d);
  const boxX = arrangement.boxX;
  return <group position={[0, standalone ? 0 : SHELF_FLOOR, 0]}>
    <group name="film-box" position={[boxX, 0, 0]} rotation={[0, SHELF_FILM_YAW, 0]} scale={WORLD_UNITS_PER_MM}>
      <group position={[0, h / 2, 0]}>
        <mesh castShadow receiveShadow material={materials.body}><boxGeometry args={[w, h, d]} /></mesh>
        <mesh position={[0, 0, d / 2 + .08]} material={materials.front}><planeGeometry args={[w, h]} /></mesh>
        <mesh position={[0, h / 2 + .08, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.top}><planeGeometry args={[w, d]} /></mesh>
        <mesh position={[w / 2 + .08, 0, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[d * .90, h * .94]} /><meshStandardMaterial color={owned ? '#d9aa40' : '#666561'} roughness={.85} /></mesh>
      </group>
    </group>
    {small && <group name="film-cartridge" position={[arrangement.filmX, 0, 0]} rotation={[0, SHELF_FILM_YAW, 0]} scale={WORLD_UNITS_PER_MM}>
      <group position={[0, 21.25, 0]} rotation={[0, -.06, 0]}>
        <mesh castShadow><cylinderGeometry args={[CARTRIDGE_MM.diameter / 2, CARTRIDGE_MM.diameter / 2, CARTRIDGE_MM.bodyHeight, 32]} /><meshStandardMaterial color="#111313" roughness={.35} metalness={.45} /></mesh>
        <mesh material={materials.cartridge}><cylinderGeometry args={[12.6, 12.6, 37, 40, 1, true, -1.45, 2.9]} /></mesh>
        {[-20.5, 20.5].map(y => <mesh key={y} position={[0, y, 0]} castShadow><cylinderGeometry args={[CARTRIDGE_MM.capDiameter / 2, CARTRIDGE_MM.capDiameter / 2, 1.5, 32]} /><meshStandardMaterial color="#151719" roughness={.3} metalness={.6} /></mesh>)}
        <mesh position={[0, 22.75, 0]} castShadow><cylinderGeometry args={[5.5, 5.5, 6, 24]} /><meshStandardMaterial color="#0b0d0e" roughness={.36} metalness={.3} /></mesh>
        <mesh position={[0, 25.76, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.5, 5.4, 24]} /><meshStandardMaterial color="#333638" roughness={.3} metalness={.65} /></mesh>
      </group>
    </group>}
    <group position={[arrangement.filmX, .0003, 0]} rotation={[0, SHELF_FILM_YAW, 0]}><mesh rotation={[-Math.PI / 2, 0, 0]} scale={[mm(small ? 35 : w + 10), mm(small ? 35 : d + 10), 1]}><circleGeometry args={[.5, 32]} /><meshBasicMaterial color="#080807" transparent opacity={.34} depthWrite={false} /></mesh></group>
  </group>;
}

function CellLabel({ position, roll, slot, active, portal, shelf, focused, onApproach, onEdit }: {
  onEdit: (id: string) => void; focused: boolean; onApproach?: (point?: { x: number; y: number }) => void;
  position: [number, number, number]; roll?: StoredRoll; slot: number; active: boolean; portal: RefObject<HTMLDivElement>; shelf: FilmShelfState;
}) {
  const { gl, size, camera } = useThree();
  const label = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, type: '', moved: false, ids: new Set<number>() });
  useEffect(() => {
    // Shelf drags transfer capture to the canvas, which owns the release.
    // Labels now survive the flight, so discard contacts from the prior view.
    pointer.current.ids.clear(); pointer.current.moved = false;
  }, [focused]);
  const world = useMemo(() => new THREE.Vector3(position[0], position[1], position[2]).add(new THREE.Vector3(...SHELF_ORIGIN)), [position]);
  const sample = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const node = label.current; if (!node) return;
    const center = world.clone().project(camera);
    sample.copy(world).add(new THREE.Vector3((onApproach ? SHELF_WIDTH : WIDTH) / 2, (onApproach ? SHELF_HEIGHT : HEIGHT) / 2, 0)).project(camera);
    const width = Math.max(1, Math.abs(sample.x - center.x) * size.width);
    const height = Math.max(1, Math.abs(sample.y - center.y) * size.height);
    node.style.width = `${width}px`; node.style.height = `${height}px`;
    node.style.visibility = Math.abs(center.x) > 1 + width / size.width || Math.abs(center.y) > 1 + height / size.height || center.z > 1 ? 'hidden' : 'visible';
    if (onApproach) {
      // A full-height cabinet extends above the standing room view. Keep its
      // approach target within the visible cabinet and clear of navigation.
      const x = (center.x + 1) * size.width / 2, y = (1 - center.y) * size.height / 2;
      const left = Math.max(0, x - width / 2), right = Math.min(size.width, x + width / 2);
      const top = Math.max(size.width < 700 ? 70 : 95, y - height / 2), bottom = Math.min(size.height - 90, y + height / 2);
      node.style.width = `${Math.max(1, right - left)}px`; node.style.height = `${Math.max(1, bottom - top)}px`;
      node.style.transform = `translate(${(left + right) / 2 - x}px, ${(top + bottom) / 2 - y}px)`;
      if (right <= left || bottom <= top) node.style.visibility = 'hidden';
    }
  });
  return <Html position={position} portal={{ current: portal.current ?? gl.domElement.parentElement! }} center zIndexRange={[2, 1]} calculatePosition={(object, cam, viewport) => {
    const point = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld).project(cam);
    const rect = gl.domElement.getBoundingClientRect(), root = portal.current?.getBoundingClientRect();
    return [(point.x + 1) * viewport.width / 2 + rect.left - (root?.left ?? 0), (1 - point.y) * viewport.height / 2 + rect.top - (root?.top ?? 0)];
  }}>
    <div ref={label} className={`shelf-cell-label ${roll ? 'is-owned' : 'is-placeholder'}`} data-shelf-slot={onApproach ? undefined : slot} data-packaging={onApproach ? undefined : roll ? getPackaging(roll.stockId, roll.format).id : placeholderPackaging(slot).id} data-owned={onApproach ? undefined : !!roll}>
      {(roll && focused) || onApproach ? <button className={`shelf-roll-target ${onApproach ? 'shelf-approach-target' : ''}`} aria-label={onApproach ? "View film shelf" : `Show saved roll ${roll!.name}`} aria-haspopup={onApproach ? undefined : "dialog"} aria-keyshortcuts={onApproach ? undefined : "ArrowDown"} aria-expanded={onApproach ? undefined : shelf.selection?.id === roll?.id} aria-current={active ? 'true' : undefined}
        onPointerEnter={event => { if (roll && !onApproach && event.pointerType === 'mouse') shelf.show(roll, event.currentTarget); }} onPointerLeave={shelf.leave}
        onFocus={event => { if (roll && !onApproach && event.currentTarget.matches(':focus-visible') && !(event.relatedTarget instanceof Element && event.relatedTarget.closest('.shelf-roll-card'))) shelf.show(roll, event.currentTarget, true); }}
        onKeyDown={event => { if (event.key === 'ArrowDown' && roll && !onApproach) { event.preventDefault(); event.stopPropagation(); shelf.show(roll, event.currentTarget, true); } }}
        onPointerDown={event => { event.stopPropagation(); const p = pointer.current; p.ids.add(event.pointerId); p.x = event.clientX; p.y = event.clientY; p.type = event.pointerType; p.moved = p.ids.size > 1; }}
        onPointerMove={event => { if (pointer.current.ids.size && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 7) pointer.current.moved = true; }}
        onPointerUp={event => pointer.current.ids.delete(event.pointerId)} onPointerCancel={() => { pointer.current.ids.clear(); pointer.current.moved = true; }}
        onClick={event => { event.stopPropagation(); if (event.detail > 0 && pointer.current.moved) return; if (onApproach) { onApproach(event.detail ? { x: event.clientX, y: event.clientY } : undefined); return; } if (!roll) return; if (roll.trashedAt !== null) shelf.show(roll, event.currentTarget, true); else onEdit(roll.id); }}>
        {!onApproach && <><span className="shelf-slot-number">{String(slot + 1).padStart(2, '0')}</span><span className="shelf-roll-caption">{roll?.name}</span>{active && <span className="shelf-active-dot" aria-label="On the light table" />}</>}
      </button> : <span className="shelf-slot-number" aria-hidden="true">{String(slot + 1).padStart(2, '0')}</span>}
    </div>
  </Html>;
}

export function FilmShelf({ shelf, activeId, interactive, portal, focused, onApproach, onEdit, textures }: {
  onEdit: (id: string) => void; focused: boolean; onApproach: (point?: { x: number; y: number }) => void;
  shelf: FilmShelfState; activeId: string; interactive: boolean; portal: RefObject<HTMLDivElement>; textures: Record<string, THREE.Texture>;
}) {
  const wood = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#705841', roughness: .72 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 shelfWood;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nshelfWood = position;');
      shader.fragmentShader = 'varying vec3 shelfWood;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat grain = sin(shelfWood.y * 470.0 + sin(shelfWood.x * 4.0) * 2.5 + shelfWood.z * 150.0); diffuseColor.rgb *= .94 + .06 * grain;');
    };
    return material;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  const cells = Array.from({ length: SHELF_CAPACITY }, (_, index) => {
    const slot = shelf.page * SHELF_CAPACITY + index;
    return { slot, position: [(index % 4 - 1.5) * WIDTH, (1.5 - Math.floor(index / 4)) * HEIGHT, DEPTH / 2] as [number, number, number], roll: shelf.rolls.find(r => r.shelfSlot === slot) };
  });
  return <group position={SHELF_ORIGIN}>
    <mesh position={[0, 0, -DEPTH / 2]} receiveShadow><boxGeometry args={[SHELF_WIDTH, SHELF_HEIGHT, mm(6)]} /><meshStandardMaterial color="#292822" roughness={.95} /></mesh>
    {[-2, -1, 0, 1, 2].map(i => <mesh key={`row-${i}`} position={[0, i * HEIGHT, 0]} castShadow receiveShadow material={wood}><boxGeometry args={[SHELF_WIDTH, mm(Math.abs(i) === 2 ? 18 : 10), DEPTH]} /></mesh>)}
    {[-2, -1, 0, 1, 2].map(i => <mesh key={`col-${i}`} position={[i * WIDTH, 0, 0]} castShadow receiveShadow material={wood}><boxGeometry args={[mm(Math.abs(i) === 2 ? 18 : 8), HEIGHT * 4, DEPTH]} /></mesh>)}
    {[-WIDTH * 2, WIDTH * 2].flatMap(x => [-HEIGHT * 2, HEIGHT * 2].map(y => <mesh key={`${x}-${y}`} position={[x, y, DEPTH / 2 + .001]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.009, .009, .004, 12]} /><meshStandardMaterial color="#8f8065" roughness={.35} metalness={.8} /></mesh>))}
    {cells.map(({ slot, position, roll }) => <group key={slot}>
      <group name={`shelf-cell:${slot}`} position={[position[0], position[1], 0]}><FilmPackage entry={roll ? getPackaging(roll.stockId, roll.format) : placeholderPackaging(slot)} owned={!!roll} textures={textures} />{roll && <ShelfCoverFrame roll={roll} />}</group>
      {interactive && <CellLabel focused={focused} position={position} roll={roll} slot={slot} active={roll?.id === activeId} portal={portal} shelf={shelf} onEdit={onEdit} />}
    </group>)}
    {interactive && !focused && <CellLabel focused={false} position={[0, 0, DEPTH / 2]} slot={-1} active={false} portal={portal} shelf={shelf} onEdit={onEdit} onApproach={onApproach} />}
    {/* A narrow light strip brightens only the cabinet; no spill on the table. */}
    <mesh position={[0, HEIGHT * 2 - mm(12), DEPTH / 2 - mm(4)]}><boxGeometry args={[SHELF_WIDTH - mm(40), mm(2), mm(4)]} /><meshBasicMaterial color="#d1c7aa" /></mesh>
  </group>;
}
