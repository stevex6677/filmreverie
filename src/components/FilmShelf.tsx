import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { FILM_PACKAGING, FilmPackaging, getPackaging } from '../data/filmPackaging';
import { StoredRoll } from '../storage/rollRepository';
import { FilmShelfState } from '../utils/useFilmShelf';
import { packagingMaterial } from '../utils/packagingMaterial';
import { placeholderPackaging, SHELF_CAPACITY } from '../utils/shelfLayout';
import { ShelfCoverFrame, type ShelfCoverSource } from './ShelfCoverFrame';
import { woodTexture } from '../utils/darkroomTextures';

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
    top: packagingMaterial(!entry.singleRollArtwork && entry.top ? textures[entry.box.asset] : undefined, entry.top, owned, entry.bodyColor),
    side: entry.bodyColor
      ? packagingMaterial(undefined, undefined, owned, entry.bodyColor)
      : new THREE.MeshStandardMaterial({ color: owned ? '#d9aa40' : '#666561', roughness: .85 }),
    body: packagingMaterial(undefined, undefined, owned, entry.bodyColor ?? '#c3942c'),
    cartridge: packagingMaterial(entry.cartridge ? textures[entry.cartridge.asset] : undefined, entry.cartridgePanel, owned, '#161719'),
  }), [entry, textures, owned]);
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials]);
  const small = entry.format === '135';
  const stacked = entry.cartridgePlacement === 'on-box';
  const cartridgeGeometry = useMemo(() => {
    if (!small) return null;
    const geometry = new THREE.CylinderGeometry(12.6, 12.6, 37, 40, 1, true, -1.45, 2.9);
    if (entry.cartridgeProjection === 'photographic') {
      // Undo the photographed cylinder's horizontal foreshortening and bowed
      // label edges before the real 3D surface supplies its own perspective.
      const uv = geometry.getAttribute('uv');
      const span = 2 * Math.sin(1.45), edgeCos = Math.cos(1.45);
      const topSag = entry.cartridgeCurvature?.[0] ?? 0;
      const bottomSag = entry.cartridgeCurvature?.[1] ?? 0;
      for (let i = 0; i < uv.count; i++) {
        const theta = (uv.getX(i) - .5) * 2.9, v = uv.getY(i);
        const sag = (bottomSag + (topSag - bottomSag) * v) * (Math.cos(theta) - edgeCos) / (1 - edgeCos);
        uv.setXY(i, .5 + Math.sin(theta) / span, v - sag);
      }
    }
    return geometry;
  }, [small, entry.cartridgeProjection, entry.cartridgeCurvature]);
  useEffect(() => () => cartridgeGeometry?.dispose(), [cartridgeGeometry]);
  const arrangement = shelfArrangement(w, small && !stacked, owned && !standalone, d);
  const boxX = arrangement.boxX;
  return <group position={[0, standalone ? 0 : SHELF_FLOOR, 0]}>
    <group name="film-box" position={[boxX, 0, 0]} rotation={[0, SHELF_FILM_YAW, 0]} scale={WORLD_UNITS_PER_MM}>
      <group position={[0, h / 2, 0]}>
        <mesh castShadow receiveShadow material={materials.body}><boxGeometry args={[w, h, d]} /></mesh>
        <mesh position={[0, 0, d / 2 + .08]} material={materials.front}><planeGeometry args={[w, h]} /></mesh>
        <mesh position={[0, h / 2 + .08, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.top}><planeGeometry args={[w, d]} /></mesh>
        <mesh position={[w / 2 + .08, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={materials.side}><planeGeometry args={[entry.bodyColor ? d : d * .90, entry.bodyColor ? h : h * .94]} /></mesh>
      </group>
    </group>
    {small && <group name="film-cartridge" position={[arrangement.filmX, stacked ? mm(h) : 0, 0]} rotation={[0, SHELF_FILM_YAW, 0]} scale={WORLD_UNITS_PER_MM}>
      <group position={[0, 21.25, 0]} rotation={[0, -.06, 0]}>
        <mesh castShadow><cylinderGeometry args={[CARTRIDGE_MM.diameter / 2, CARTRIDGE_MM.diameter / 2, CARTRIDGE_MM.bodyHeight, 32]} /><meshStandardMaterial color="#111313" roughness={.35} metalness={.45} /></mesh>
        <mesh material={materials.cartridge} geometry={cartridgeGeometry!} />
        {[-20.5, 20.5].map(y => <mesh key={y} position={[0, y, 0]} castShadow><cylinderGeometry args={[CARTRIDGE_MM.capDiameter / 2, CARTRIDGE_MM.capDiameter / 2, 1.5, 32]} /><meshStandardMaterial color="#151719" roughness={.3} metalness={.6} /></mesh>)}
        <mesh position={[0, 22.75, 0]} castShadow><cylinderGeometry args={[5.5, 5.5, 6, 24]} /><meshStandardMaterial color="#0b0d0e" roughness={.36} metalness={.3} /></mesh>
        <mesh position={[0, 25.76, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.5, 5.4, 24]} /><meshStandardMaterial color="#333638" roughness={.3} metalness={.65} /></mesh>
      </group>
    </group>}
    <group position={[arrangement.filmX, (stacked ? mm(h) : 0) + .0003, 0]} rotation={[0, SHELF_FILM_YAW, 0]}><mesh rotation={[-Math.PI / 2, 0, 0]} scale={[mm(small ? 35 : w + 10), mm(small ? 35 : d + 10), 1]}><circleGeometry args={[.5, 32]} /><meshBasicMaterial color="#080807" transparent opacity={.34} depthWrite={false} /></mesh></group>
  </group>;
}

function CellLabel({ position, roll, slot, active, portal, shelf, focused, onApproach, readOnly }: {
  focused: boolean; onApproach?: (point?: { x: number; y: number }) => void; readOnly: boolean;
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
      {(roll && focused) || onApproach ? <button className={`shelf-roll-target ${onApproach ? 'shelf-approach-target' : ''}`} aria-label={onApproach ? "View film shelf" : `${readOnly ? 'Show published roll' : 'Show saved roll'} ${roll!.name}`} aria-haspopup={onApproach ? undefined : "dialog"} aria-keyshortcuts={onApproach ? undefined : "ArrowDown"} aria-expanded={onApproach ? undefined : shelf.selection?.id === roll?.id} aria-current={active ? 'true' : undefined}
        onKeyDown={event => { if (event.key === 'ArrowDown' && roll && !onApproach) { event.preventDefault(); event.stopPropagation(); shelf.show(roll, event.currentTarget, true); } }}
        onPointerDown={event => { event.stopPropagation(); const p = pointer.current; p.ids.add(event.pointerId); p.x = event.clientX; p.y = event.clientY; p.type = event.pointerType; p.moved = p.ids.size > 1; }}
        onPointerMove={event => { if (pointer.current.ids.size && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 7) pointer.current.moved = true; }}
        onPointerUp={event => pointer.current.ids.delete(event.pointerId)} onPointerCancel={() => { pointer.current.ids.clear(); pointer.current.moved = true; }}
        onClick={event => { event.stopPropagation(); if (event.detail > 0 && pointer.current.moved) return; if (onApproach) { onApproach(event.detail ? { x: event.clientX, y: event.clientY } : undefined); return; } if (!roll) return; shelf.show(roll, event.currentTarget, true); }}>
        {!onApproach && <><span className="shelf-roll-caption">{roll?.name}</span>{active && <span className="shelf-active-dot" aria-label="On the light table" />}</>}
      </button> : null}
    </div>
  </Html>;
}

export function FilmShelf({ shelf, activeId, interactive, portal, focused, onApproach, textures, readOnly = false, coverSource }: {
  focused: boolean; onApproach: (point?: { x: number; y: number }) => void;
  shelf: FilmShelfState; activeId: string; interactive: boolean; portal: RefObject<HTMLDivElement>; textures: Record<string, THREE.Texture>;
  readOnly?: boolean; coverSource?: ShelfCoverSource;
}) {
  const wood = useMemo(() => {
    const textures = { rows: woodTexture('#7a5c40', 101), columns: woodTexture('#74573c', 107, true), back: woodTexture('#3a2a1d', 109, true) };
    textures.back.repeat.set(6, 1);
    return {
      textures,
      rows: new THREE.MeshStandardMaterial({ map: textures.rows, roughness: .62 }),
      columns: new THREE.MeshStandardMaterial({ map: textures.columns, roughness: .62 }),
      back: new THREE.MeshStandardMaterial({ map: textures.back, color: '#8a8580', roughness: .8 }),
      channel: new THREE.MeshStandardMaterial({ color: '#7f8386', roughness: .35, metalness: .8 }),
    };
  }, []);
  useEffect(() => () => [...Object.values(wood.textures), wood.rows, wood.columns, wood.back, wood.channel].forEach(item => item.dispose()), [wood]);
  const cells = Array.from({ length: SHELF_CAPACITY }, (_, index) => {
    const slot = shelf.page * SHELF_CAPACITY + index;
    return { slot, position: [(index % 4 - 1.5) * WIDTH, (1.5 - Math.floor(index / 4)) * HEIGHT, DEPTH / 2] as [number, number, number], roll: shelf.rolls.find(r => r.shelfSlot === slot) };
  });
  return <group position={SHELF_ORIGIN}>
    <mesh position={[0, 0, -DEPTH / 2]} receiveShadow material={wood.back}><boxGeometry args={[SHELF_WIDTH, SHELF_HEIGHT, mm(6)]} /></mesh>
    {[-2, -1, 0, 1, 2].map(i => <mesh key={`row-${i}`} position={[0, i * HEIGHT, 0]} castShadow receiveShadow material={wood.rows}><boxGeometry args={[SHELF_WIDTH, mm(Math.abs(i) === 2 ? 18 : 10), DEPTH]} /></mesh>)}
    {[-2, -1, 0, 1, 2].map(i => <mesh key={`col-${i}`} position={[i * WIDTH, 0, 0]} castShadow receiveShadow material={wood.columns}><boxGeometry args={[mm(Math.abs(i) === 2 ? 18 : 8), HEIGHT * 4, DEPTH]} /></mesh>)}
    {[-WIDTH * 2, WIDTH * 2].flatMap(x => [-HEIGHT * 2, HEIGHT * 2].map(y => <mesh key={`${x}-${y}`} position={[x, y, DEPTH / 2 + .001]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.009, .009, .004, 12]} /><meshStandardMaterial color="#8f8065" roughness={.35} metalness={.8} /></mesh>))}
    {cells.map(({ slot, position, roll }) => <group key={slot}>
      <group name={`shelf-cell:${slot}`} position={[position[0], position[1], 0]}><FilmPackage entry={roll ? getPackaging(roll.stockId, roll.format) : placeholderPackaging(slot)} owned={!!roll} textures={textures} />{roll && <ShelfCoverFrame roll={roll} coverSource={coverSource} />}</group>
      {interactive && (!shelf.selection?.pinned || shelf.selection.id === roll?.id) && <CellLabel focused={focused} position={position} roll={roll} slot={slot} active={roll?.id === activeId} portal={portal} shelf={shelf} readOnly={readOnly} />}
    </group>)}
    {interactive && !focused && <CellLabel focused={false} position={[0, 0, DEPTH / 2]} slot={-1} active={false} portal={portal} shelf={shelf} onApproach={onApproach} readOnly={readOnly} />}
    {/* A narrow light strip brightens only the cabinet; no spill on the table. */}
    <mesh position={[0, HEIGHT * 2 - mm(12), DEPTH / 2 - mm(4)]}><boxGeometry args={[SHELF_WIDTH - mm(40), mm(2), mm(4)]} /><meshBasicMaterial color="#d1c7aa" /></mesh>
    <mesh position={[0, HEIGHT * 2 - mm(11.5), DEPTH / 2 - mm(4)]} material={wood.channel}><boxGeometry args={[SHELF_WIDTH - mm(36), mm(3), mm(8)]} /></mesh>
  </group>;
}
