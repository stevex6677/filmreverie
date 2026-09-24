import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box3, Euler, Matrix4, Quaternion, Raycaster, Texture, Vector2, Vector3 } from 'three';
import type { RefObject } from 'react';
import { mountModel, studioEnvironment } from '../../standalone/model-viewer/model-core.js';
import { CAMERAS } from '../data/cameras';
import type { CameraEntry } from '../data/cameras';
import { mm, CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, CAMERA_SHELF_YAW, cameraShelfSlot, CAMERA_PRESENTATION_YAW } from '../data/physicalScale';
import { useCameraModel } from '../utils/useCameraModel';
import { FilmPackage } from './FilmShelf';
import { getPackaging } from '../data/filmPackaging';
import { roomCameraModel } from '../utils/roomCameraModel';

type MountedCamera = ReturnType<typeof mountModel> & { object: ReturnType<typeof roomCameraModel>['object'] };

function CameraCabinetItem({ entry, index, enabled, focused, interactive, portal, onMounted, onOpen, onSettled }: {
  entry: CameraEntry; index: number; enabled: boolean; focused: boolean; interactive: boolean;
  portal: RefObject<HTMLDivElement>; onMounted: (index: number, mounted: MountedCamera | null) => void;
  onOpen: (id: string) => void; onSettled?: () => void;
}) {
  const { gl } = useThree();
  const { model, error, retry } = useCameraModel(entry, enabled);
  const mounted = useMemo(() => {
    if (!model) return null;
    const result = mountModel(model, entry.rotation, mm(entry.widthMm));
    const environment = studioEnvironment(gl), presentation = roomCameraModel(result.object, environment.texture);
    return { ...result, object: presentation.object, environment, dispose: presentation.dispose };
  }, [entry, model, gl]);
  useEffect(() => {
    onMounted(index, mounted);
    return () => onMounted(index, null);
  }, [index, mounted, onMounted]);
  useEffect(() => () => { mounted?.environment.dispose(); mounted?.dispose(); }, [mounted]);
  const rendered = useRef(0);
  useFrame(() => { if (mounted && rendered.current < 2 && ++rendered.current === 2) onSettled?.(); });
  useEffect(() => { if (error) onSettled?.(); }, [error, onSettled]);
  const focusTarget = useCallback((node: HTMLButtonElement | null) => { if (node && focused && index === 0) node.focus({ preventScroll: true }); }, [focused, index]);
  const pointer = useRef({ x: 0, y: 0, moved: false, contacts: new Set<number>() });
  useEffect(() => { pointer.current.contacts.clear(); pointer.current.moved = false; }, [interactive, focused]);
  const slot = cameraShelfSlot(index), centerY = slot.y + mm(21) + (mounted?.size.y ?? 0) / 2;
  return <>
    {mounted && <group position={[slot.x, centerY, slot.z]} rotation={[0, CAMERA_PRESENTATION_YAW, 0]}>
      <primitive object={mounted.object} dispose={null} />
    </group>}
    <mesh position={[slot.x, slot.y + mm(20.5), slot.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[mm(Math.min(entry.widthMm * .62, 125, CAMERA_SHELF_MM.depth / 2 - 5)), 48]} /><meshBasicMaterial color="#080a08" transparent opacity={.2} depthWrite={false} />
    </mesh>
    {interactive && focused && <Html position={[slot.x, slot.y + mm(30), mm(CAMERA_SHELF_MM.depth + 5)]} center portal={{ current: portal.current ?? gl.domElement.parentElement! }} zIndexRange={[3, 2]}
      calculatePosition={(object, view, size) => {
        const point = new Vector3().setFromMatrixPosition(object.matrixWorld).project(view);
        const canvasRect = gl.domElement.getBoundingClientRect(), overlayRect = portal.current?.getBoundingClientRect() ?? canvasRect;
        const projectedX = (point.x + 1) * size.width / 2 + canvasRect.left - overlayRect.left;
        const labelX = projectedX + (focused && size.height < 450 ? Math.min(160, size.width * .2) : 0);
        const narrow = overlayRect.width < 700;
        const x = narrow ? overlayRect.width * (index % 2 ? .75 : .25)
          : focused ? Math.max(90, Math.min(overlayRect.width - 90, labelX)) : labelX;
        let y = (1 - point.y) * size.height / 2 + canvasRect.top - overlayRect.top + (focused ? (size.width < 700 ? 28 : 40) : 0);
        // Five nameplates need staggered desktop rows and a two-column phone grid.
        // Keep the physical camera positions unchanged.
        y += (narrow ? Math.floor(index / 2) : index % 2) * 58;
        const toolbar = focused ? document.querySelector('.camera-collection-toolbar')?.getBoundingClientRect() : null;
        if (toolbar && x + 90 > toolbar.left - overlayRect.left && x - 90 < toolbar.right - overlayRect.left) y = Math.min(y, toolbar.top - overlayRect.top - 38);
        return [x, y];
      }}>
      <button ref={focusTarget} className="camera-shelf-target" aria-label={`Inspect ${entry.name}`}
        onPointerDown={event => {
          const p = pointer.current; p.contacts.add(event.pointerId); p.x = event.clientX; p.y = event.clientY; p.moved = p.contacts.size > 1;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => { const p = pointer.current; if (p.contacts.size && Math.hypot(p.x - event.clientX, p.y - event.clientY) > 7) p.moved = true; }}
        onPointerUp={event => { pointer.current.contacts.delete(event.pointerId); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { pointer.current.contacts.clear(); pointer.current.moved = true; }}
        onClick={event => { event.stopPropagation(); if (!event.detail || !pointer.current.moved) onOpen(entry.id); }}>
        <span>{entry.name}</span>
        <small>{entry.introduced} · Inspect camera ↗</small>
      </button>
      {!mounted && <div className="camera-shelf-status" role="status">{error || `Loading ${entry.name}…`}{error && <button onClick={retry}>Retry model</button>}</div>}
    </Html>}
  </>;
}

export function CameraShelf({ focused, interactive, load, portal, onApproach, onOpen, onSettled, textures }: {
  focused: boolean; interactive: boolean; load: boolean; portal: RefObject<HTMLDivElement>;
  onApproach: () => void; onOpen: (id: string) => void;
  onSettled?: () => void; textures: Record<string, Texture>;
}) {
  const { gl, camera } = useThree();
  const [mountedCameras, setMountedCameras] = useState<Map<number, MountedCamera>>(new Map());
  const updateMounted = useCallback((index: number, mounted: MountedCamera | null) => setMountedCameras(current => {
    if (current.get(index) === mounted || (!mounted && !current.has(index))) return current;
    const next = new Map(current); if (mounted) next.set(index, mounted); else next.delete(index); return next;
  }), []);
  useEffect(() => {
    const primary = mountedCameras.get(0);
    gl.domElement.dataset.cameraModelWidth = primary ? String(primary.size.x) : '';
    gl.domElement.dataset.cameraModelSize = primary?.size.toArray().join(',') ?? '';
    gl.domElement.dataset.cameraModelWidths = [...mountedCameras].map(([index, mounted]) => `${CAMERAS[index].id}:${mounted.size.x}`).join(',');
    gl.domElement.dataset.cameraModelMeshes = String([...mountedCameras.values()].reduce((count, mounted) => count + mounted.object.children.length, 0));
  }, [gl, mountedCameras]);
  const live = useRef({ interactive, focused, mountedCameras, onApproach, onOpen }); live.current = { interactive, focused, mountedCameras, onApproach, onOpen };
  useEffect(() => {
    const canvas = gl.domElement, ray = new Raycaster();
    const inverse = new Matrix4().compose(new Vector3(...CAMERA_SHELF_ORIGIN), new Quaternion().setFromEuler(new Euler(0, CAMERA_SHELF_YAW, 0)), new Vector3(1, 1, 1)).invert();
    let press: { x: number; y: number; cancelled: boolean } | null = null;
    const contacts = new Set<number>();
    const down = (event: PointerEvent) => {
      // A suppressed compatibility click must not leave the next tap cancelled.
      if (event.isPrimary) { contacts.clear(); press = null; }
      if (!contacts.size) press = { x: event.clientX, y: event.clientY, cancelled: event.button !== 0 };
      contacts.add(event.pointerId); if (contacts.size > 1 && press) press.cancelled = true;
    };
    const move = (event: PointerEvent) => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 7) press.cancelled = true; };
    const cancel = () => { if (press) press.cancelled = true; contacts.clear(); };
    const activate = (event: MouseEvent) => {
      const state = live.current, start = press; press = null;
      if (!state.interactive || !start || start.cancelled || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) return;
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
      const localRay = ray.ray.clone().applyMatrix4(inverse);
      const w = mm(CAMERA_SHELF_MM.width), h = mm(CAMERA_SHELF_MM.height), d = mm(CAMERA_SHELF_MM.depth);
      const shelfHit = localRay.intersectsBox(new Box3(new Vector3(-w / 2, 0, 0), new Vector3(w / 2, h, d)));
      if (!shelfHit) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!state.focused) state.onApproach();
      else for (const [index, mounted] of state.mountedCameras) {
        const slot = cameraShelfSlot(index);
        const center = new Vector3(slot.x, slot.y + mm(21) + mounted.size.y / 2, slot.z);
        const objectRay = localRay.clone().applyMatrix4(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
          .applyMatrix4(new Matrix4().makeRotationY(-CAMERA_PRESENTATION_YAW));
        const bounds = new Box3().setFromCenterAndSize(new Vector3(), mounted.size.clone().addScalar(mm(12)));
        if (objectRay.intersectsBox(bounds)) { state.onOpen(CAMERAS[index].id); break; }
      }
    };
    const up = (event: PointerEvent) => {
      if (!contacts.has(event.pointerId)) return;
      contacts.delete(event.pointerId);
      // Touch/pen taps do not reliably produce a click on iPad after capture
      // or gesture prevention. ShelfNavigation already consumes actual drags.
      if (event.pointerType === 'touch' || event.pointerType === 'pen') activate(event);
    };
    const click = (event: MouseEvent) => activate(event); // Mouse path; touch release already cleared press.
    canvas.addEventListener('pointerdown', down); window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', move);
    canvas.addEventListener('click', click, true); window.addEventListener('pointercancel', cancel);
    return () => { canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointermove', move); canvas.removeEventListener('click', click, true); window.removeEventListener('pointercancel', cancel); };
  }, [gl, camera]);
  const w = mm(CAMERA_SHELF_MM.width), h = mm(CAMERA_SHELF_MM.height), d = mm(CAMERA_SHELF_MM.depth);
  return <group name="camera-collection-cabinet" position={CAMERA_SHELF_ORIGIN} rotation={[0, CAMERA_SHELF_YAW, 0]}>
    <mesh position={[0, h / 2, 0]} receiveShadow><boxGeometry args={[w, h, mm(14)]} /><meshStandardMaterial color="#242823" roughness={.9} /></mesh>
    {[mm(10), h / 2, h - mm(10)].map(y => <mesh key={y} position={[0, y, d / 2]} castShadow receiveShadow><boxGeometry args={[w, mm(20), d]} /><meshStandardMaterial color="#806246" roughness={.7} /></mesh>)}
    {[-1, 1].map(side => <mesh key={side} position={[side * (w / 2 - mm(9)), h / 2, d / 2]} castShadow><boxGeometry args={[mm(18), h, d]} /><meshStandardMaterial color="#70553e" roughness={.75} /></mesh>)}
    {[h / 2, h].map(y => <group key={y}>
      <mesh position={[0, y - mm(14), d * .68]}><boxGeometry args={[w - mm(55), mm(3), mm(6)]} /><meshBasicMaterial color="#efe2c6" /></mesh>
      <pointLight position={[0, y - mm(70), d * .83]} color="#fff1d7" intensity={1.4} distance={2.8} decay={2} />
    </group>)}
    {/* Keep the film props on the lower tier, clear of the camera collection above. */}
    <group name="camera-shelf-film-props">
      <group position={[mm(-270), mm(21), mm(150)]} rotation={[0, .1, 0]}>
        <FilmPackage entry={getPackaging('portra-400', '135')} owned textures={textures} standalone />
      </group>
      <group position={[mm(150), mm(21), mm(165)]} rotation={[0, -.06, 0]}>
        <FilmPackage entry={getPackaging('ektar-100', '135')} owned textures={textures} standalone />
      </group>
      <group position={[mm(-60), mm(21), mm(130)]} rotation={[0, .12, 0]}>
        <FilmPackage entry={getPackaging('provia-100', '120')} owned textures={textures} standalone />
      </group>
    </group>
    {CAMERAS.map((entry, index) => <CameraCabinetItem key={entry.id} entry={entry} index={index}
      enabled={load} focused={focused} interactive={interactive} portal={portal}
      onMounted={updateMounted} onOpen={onOpen} onSettled={index === 0 ? onSettled : undefined} />)}
  </group>;
}
