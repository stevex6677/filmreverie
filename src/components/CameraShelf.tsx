import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box3, Euler, Matrix4, Quaternion, Raycaster, Texture, Vector2, Vector3 } from 'three';
import type { RefObject } from 'react';
import { mountModel, studioEnvironment } from '../../standalone/model-viewer/model-core.js';
import { PRIMARY_CAMERA } from '../data/cameras';
import { mm, CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, CAMERA_SHELF_YAW, PRIMARY_CAMERA_SLOT, CAMERA_PRESENTATION_YAW } from '../data/physicalScale';
import { useCameraModel } from '../utils/useCameraModel';
import { FilmPackage } from './FilmShelf';
import { getPackaging } from '../data/filmPackaging';
import { roomCameraModel } from '../utils/roomCameraModel';

export function CameraShelf({ focused, interactive, load, portal, onApproach, onOpen, onSettled, textures }: {
  focused: boolean; interactive: boolean; load: boolean; portal: RefObject<HTMLDivElement>;
  onApproach: () => void; onOpen: () => void;
  onSettled?: () => void; textures: Record<string, Texture>;
}) {
  const { gl, camera } = useThree();
  const { model, error, retry } = useCameraModel(load);
  const mounted = useMemo(() => {
    if (!model) return null;
    const result = mountModel(model, PRIMARY_CAMERA.rotation, mm(PRIMARY_CAMERA.widthMm));
    const environment = studioEnvironment(gl), presentation = roomCameraModel(result.object, environment.texture);
    return { ...result, object: presentation.object, environment, dispose: presentation.dispose };
  }, [model, gl]);
  useEffect(() => () => { mounted?.environment.dispose(); mounted?.dispose(); }, [mounted]);
  const rendered = useRef(0);
  useFrame(() => { if (mounted && rendered.current < 2 && ++rendered.current === 2) onSettled?.(); });
  useEffect(() => { if (error) onSettled?.(); }, [error, onSettled]);
  const focusTarget = useCallback((node: HTMLButtonElement | null) => { if (node && focused) node.focus({ preventScroll: true }); }, [focused]);
  useEffect(() => {
    gl.domElement.dataset.cameraModelWidth = mounted ? String(mounted.size.x) : '';
    gl.domElement.dataset.cameraModelSize = mounted?.size.toArray().join(',') ?? '';
    gl.domElement.dataset.cameraModelMeshes = mounted ? String(mounted.object.children.length) : '';
  }, [gl, mounted]);
  const pointer = useRef({ x: 0, y: 0, moved: false, contacts: new Set<number>() });
  useEffect(() => {
    // A drag can transfer capture to the canvas, and inspection unmounts the
    // label. Neither should leave a contact attached to its next appearance.
    pointer.current.contacts.clear(); pointer.current.moved = false;
  }, [interactive, focused]);
  const live = useRef({ interactive, focused, mounted, onApproach, onOpen }); live.current = { interactive, focused, mounted, onApproach, onOpen };
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
      else if (state.mounted) {
        const slot = PRIMARY_CAMERA_SLOT;
        const center = new Vector3(slot.x, slot.y + mm(21) + state.mounted.size.y / 2, slot.z);
        const objectRay = localRay.clone().applyMatrix4(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
          .applyMatrix4(new Matrix4().makeRotationY(-CAMERA_PRESENTATION_YAW));
        const bounds = new Box3().setFromCenterAndSize(new Vector3(), state.mounted.size.clone().addScalar(mm(12)));
        if (objectRay.intersectsBox(bounds)) state.onOpen();
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
  const slot = PRIMARY_CAMERA_SLOT;
  return <group name="camera-collection-cabinet" position={CAMERA_SHELF_ORIGIN} rotation={[0, CAMERA_SHELF_YAW, 0]}>
    <mesh position={[0, h / 2, 0]} receiveShadow><boxGeometry args={[w, h, mm(14)]} /><meshStandardMaterial color="#242823" roughness={.9} /></mesh>
    {[mm(10), h / 2, h - mm(10)].map(y => <mesh key={y} position={[0, y, d / 2]} castShadow receiveShadow><boxGeometry args={[w, mm(20), d]} /><meshStandardMaterial color="#806246" roughness={.7} /></mesh>)}
    {[-1, 1].map(side => <mesh key={side} position={[side * (w / 2 - mm(9)), h / 2, d / 2]} castShadow><boxGeometry args={[mm(18), h, d]} /><meshStandardMaterial color="#70553e" roughness={.75} /></mesh>)}
    {[h / 2, h].map(y => <group key={y}>
      <mesh position={[0, y - mm(14), d * .68]}><boxGeometry args={[w - mm(55), mm(3), mm(6)]} /><meshBasicMaterial color="#efe2c6" /></mesh>
      <pointLight position={[0, y - mm(70), d * .83]} color="#fff1d7" intensity={1.4} distance={2.8} decay={2} />
    </group>)}
    {/* A few inert display props, with shared film-shelf textures and real package sizes. */}
    <group name="camera-shelf-film-props">
      <group position={[mm(-270), mm(21), mm(150)]} rotation={[0, .1, 0]}>
        <FilmPackage entry={getPackaging('portra-400', '135')} owned textures={textures} standalone />
      </group>
      <group position={[mm(150), mm(21), mm(165)]} rotation={[0, -.06, 0]}>
        <FilmPackage entry={getPackaging('ektar-100', '135')} owned textures={textures} standalone />
      </group>
      <group position={[mm(210), h / 2 + mm(11), mm(130)]} rotation={[0, .12, 0]}>
        <FilmPackage entry={getPackaging('provia-100', '120')} owned textures={textures} standalone />
      </group>
    </group>
    {mounted && <group position={[slot.x, slot.y + mm(21) + mounted.size.y / 2, slot.z]} rotation={[0, CAMERA_PRESENTATION_YAW, 0]}>
      <primitive object={mounted.object} dispose={null} />
    </group>}
    <mesh position={[slot.x, slot.y + mm(20.5), slot.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[mm(Math.min(125, CAMERA_SHELF_MM.depth / 2 - 5)), 48]} /><meshBasicMaterial color="#080a08" transparent opacity={.2} depthWrite={false} />
    </mesh>
    {interactive && focused && <>
      <Html position={[slot.x, slot.y + mm(30), d + mm(5)]} center portal={{ current: portal.current ?? gl.domElement.parentElement! }} zIndexRange={[3, 2]}
        calculatePosition={(object, view, size) => {
          const point = new Vector3().setFromMatrixPosition(object.matrixWorld).project(view);
          const canvasRect = gl.domElement.getBoundingClientRect(), overlayRect = portal.current?.getBoundingClientRect() ?? canvasRect;
          // The mobile canvas starts below the header; its portal covers the
          // whole app. Convert into that portal and keep the nameplate below
          // the camera rather than covering its small silhouette.
          const projectedX = (point.x + 1) * size.width / 2 + canvasRect.left - overlayRect.left;
          const labelX = projectedX + (focused && size.height < 450 ? Math.min(160, size.width * .2) : 0);
          const x = focused ? Math.max(100, Math.min(overlayRect.width - 100, labelX)) : labelX;
          let y = (1 - point.y) * size.height / 2 + canvasRect.top - overlayRect.top + (focused ? (size.width < 700 ? 28 : 40) : 0);
          // Returning from inspection can leave a very short landscape view.
          // Keep the projected nameplate above controls when their bounds meet.
          const toolbar = focused ? document.querySelector('.camera-collection-toolbar')?.getBoundingClientRect() : null;
          if (toolbar && x + 100 > toolbar.left - overlayRect.left && x - 100 < toolbar.right - overlayRect.left) {
            y = Math.min(y, toolbar.top - overlayRect.top - 38);
          }
          return [x, y];
        }}>
        <button ref={focusTarget} className="camera-shelf-target" aria-label={`Inspect ${PRIMARY_CAMERA.name}`}
          onPointerDown={event => {
            const p = pointer.current; p.contacts.add(event.pointerId); p.x = event.clientX; p.y = event.clientY; p.moved = p.contacts.size > 1;
            // The projected label can move as the resumed room camera refits
            // after rotation. Keep release/click on this button; ShelfNavigation
            // transfers capture to the canvas once an actual drag begins.
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => { const p = pointer.current; if (p.contacts.size && Math.hypot(p.x - event.clientX, p.y - event.clientY) > 7) p.moved = true; }}
          onPointerUp={event => { pointer.current.contacts.delete(event.pointerId); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { pointer.current.contacts.clear(); pointer.current.moved = true; }}
          onClick={event => { event.stopPropagation(); if (!event.detail || !pointer.current.moved) onOpen(); }}>
          <span>{PRIMARY_CAMERA.name}</span>
          <small>{PRIMARY_CAMERA.introduced} · Inspect camera ↗</small>
        </button>
        {focused && !mounted && <div className="camera-shelf-status" role="status">{error || 'Loading camera…'}{error && <button onClick={retry}>Retry model</button>}</div>}
      </Html>
    </>}
  </group>;
}
