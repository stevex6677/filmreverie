import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box3, Euler, Matrix4, MeshStandardMaterial, Quaternion, Raycaster, Texture, Vector2, Vector3 } from 'three';
import type { RefObject } from 'react';
import { mountModel } from '../../standalone/model-viewer/model-core.js';
import { useDarkroomEnvironment } from './DarkroomParts';
import { CAMERAS } from '../data/cameras';
import type { CameraEntry } from '../data/cameras';
import { mm, CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, CAMERA_SHELF_YAW, cameraShelfSlot, CAMERA_PRESENTATION_YAW } from '../data/physicalScale';
import { useCameraModel } from '../utils/useCameraModel';
import type { CameraCollectionProgress } from '../utils/loadCameraModel';
type CameraStatus = { state: 'loading' | 'ready' | 'error'; retry: () => void };
import { FilmPackage } from './FilmShelf';
import { getPackaging } from '../data/filmPackaging';
import { roomCameraModel } from '../utils/roomCameraModel';
import { cameraLabelRow } from '../utils/cameraLabelRow';
import { feltTexture, woodTexture } from '../utils/darkroomTextures';

type MountedCamera = ReturnType<typeof mountModel> & { object: ReturnType<typeof roomCameraModel>['object'] };

function CameraCabinetItem({ entry, index, enabled, focused, interactive, portal, environment, onMounted, onOpen, onStatus }: {
  environment: Texture; entry: CameraEntry; index: number; enabled: boolean; focused: boolean; interactive: boolean;
  portal: RefObject<HTMLDivElement>; onMounted: (index: number, mounted: MountedCamera | null) => void;
  onOpen: (id: string) => void; onStatus: (index: number, status: CameraStatus) => void;
}) {
  const { gl } = useThree();
  const { model, error, retry } = useCameraModel(entry, enabled);
  const mounted = useMemo(() => {
    if (!model) return null;
    const result = mountModel(model, entry.rotation, mm(entry.widthMm));
    const presentation = roomCameraModel(result.object, environment);
    return { ...result, object: presentation.object, dispose: presentation.dispose };
  }, [entry, model, environment]);
  useEffect(() => {
    onMounted(index, mounted);
    return () => onMounted(index, null);
  }, [index, mounted, onMounted]);
  useEffect(() => () => { mounted?.dispose(); }, [mounted]);
  const rendered = useRef(0);
  useEffect(() => {
    rendered.current = 0;
    onStatus(index, { state: error ? 'error' : 'loading', retry });
  }, [mounted, error, index, onStatus, retry]);
  useFrame(() => {
    if (mounted && rendered.current < 2 && ++rendered.current === 2) onStatus(index, { state: 'ready', retry });
  });
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
        const canvasRect = gl.domElement.getBoundingClientRect(), overlayRect = portal.current?.getBoundingClientRect() ?? canvasRect;
        const project = (x: number) => new Vector3(x, object.position.y, object.position.z)
          .applyMatrix4(object.parent!.matrixWorld).project(view);
        const centers = CAMERAS.map((_, i) => (project(cameraShelfSlot(i).x).x + 1) * size.width / 2 + canvasRect.left - overlayRect.left);
        const buttons = Array.from((portal.current ?? gl.domElement.parentElement!).querySelectorAll<HTMLButtonElement>('.camera-shelf-target'));
        const positions = cameraLabelRow(centers, buttons.map(button => button.offsetWidth), overlayRect.width);
        // A shared rail height keeps all labels level, even while the view moves.
        let y = (1 - project(0).y) * size.height / 2 + canvasRect.top - overlayRect.top + 40;
        const toolbar = document.querySelector('.camera-collection-toolbar')?.getBoundingClientRect();
        const height = Math.max(0, ...buttons.map(button => button.offsetHeight));
        if (toolbar) y = Math.min(y, toolbar.top - overlayRect.top - height / 2 - 8);
        if (buttons[index]) buttons[index].style.visibility = positions ? 'visible' : 'hidden';
        return [positions?.[index] ?? centers[index], y];
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
  onSettled?: (progress: CameraCollectionProgress) => void; textures: Record<string, Texture>;
}) {
  const { gl, camera } = useThree();
  const environment = useDarkroomEnvironment();
  const [statuses, setStatuses] = useState<Map<number, CameraStatus>>(new Map());
  const updateStatus = useCallback((index: number, status: CameraStatus) => setStatuses(current => {
    if (current.get(index)?.state === status.state && current.get(index)?.retry === status.retry) return current;
    const next = new Map(current); next.set(index, status); return next;
  }), []);
  useEffect(() => {
    const values = [...statuses.values()];
    const loaded = values.filter(item => item.state === 'ready').length;
    gl.domElement.dataset.cameraModelsReady = String(loaded === CAMERAS.length);
    gl.domElement.dataset.cameraModelsLoaded = String(loaded);
    onSettled?.({ loaded, total: CAMERAS.length, failed: values.filter(item => item.state === 'error').length,
      retry: () => values.filter(item => item.state === 'error').forEach(item => item.retry()) });
  }, [statuses, onSettled, gl]);

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
  const cabinet = useMemo(() => {
    const textures = { shelf: woodTexture('#6a4b31', 113), side: woodTexture('#5e4229', 127, true), edge: woodTexture('#6a4b31', 113), felt: feltTexture([3, 2]) };
    return {
      textures,
      shelf: new MeshStandardMaterial({ map: textures.shelf, roughness: .55, envMap: environment.texture, envMapIntensity: .25 }),
      side: new MeshStandardMaterial({ map: textures.side, roughness: .55, envMap: environment.texture, envMapIntensity: .25 }),
      edge: new MeshStandardMaterial({ map: textures.edge, roughness: .5, envMap: environment.texture, envMapIntensity: .25 }),
      felt: new MeshStandardMaterial({ map: textures.felt, color: '#2f3531', roughness: 1 }),
      channel: new MeshStandardMaterial({ color: '#7f8386', roughness: .35, metalness: .8, envMap: environment.texture, envMapIntensity: .4 }),
    };
  }, [environment]);
  useEffect(() => () => [...Object.values(cabinet.textures), cabinet.shelf, cabinet.side, cabinet.edge, cabinet.felt, cabinet.channel].forEach(item => item.dispose()), [cabinet]);
  return <group name="camera-collection-cabinet" position={CAMERA_SHELF_ORIGIN} rotation={[0, CAMERA_SHELF_YAW, 0]}>
    {/* Wall-hung walnut carcass with a felt display back and a crown. */}
    <mesh position={[0, h / 2, 0]} receiveShadow material={cabinet.felt}><boxGeometry args={[w, h, mm(14)]} /></mesh>
    {[mm(10), h / 2, h - mm(10)].map(y => <group key={y}>
      <mesh position={[0, y, d / 2]} castShadow receiveShadow material={cabinet.shelf}><boxGeometry args={[w, mm(20), d]} /></mesh>
      <mesh position={[0, y, d + mm(2)]} material={cabinet.edge}><boxGeometry args={[w - mm(36), mm(20), mm(4)]} /></mesh>
    </group>)}
    {[-1, 1].map(side => <mesh key={side} position={[side * (w / 2 - mm(9)), h / 2, d / 2]} castShadow material={cabinet.side}><boxGeometry args={[mm(18), h, d]} /></mesh>)}
    <mesh position={[0, h + mm(11), d / 2 + mm(4)]} castShadow material={cabinet.shelf}><boxGeometry args={[w + mm(24), mm(22), d + mm(8)]} /></mesh>
    {[h / 2, h].map(y => <group key={y}>
      <mesh position={[0, y - mm(14), d * .68]}><boxGeometry args={[w - mm(55), mm(3), mm(6)]} /><meshBasicMaterial color="#efe2c6" /></mesh>
      <mesh position={[0, y - mm(12.5), d * .68]} material={cabinet.channel}><boxGeometry args={[w - mm(50), mm(4), mm(10)]} /></mesh>
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
      enabled={load} focused={focused} interactive={interactive} portal={portal} environment={environment.texture}
      onMounted={updateMounted} onOpen={onOpen} onStatus={updateStatus} />)}
  </group>;
}
