import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { ViewerAction, ViewerState, viewerReducer } from '../state/viewerState';
import { tablePointAt, tableInputCamera, TOP_DOWN } from '../utils/tableCamera';
import { fitRollView } from '../utils/rollLayout';
import { TABLE_SURFACE_Y, TABLE_CENTER_Z } from '../utils/cameraBounds';
import { loupeGeometry } from '../utils/loupeView';

/** One gesture owner for the physical object and the close-eye view. */
export function LoupeNavigation({ state, dispatch, blocked }: { state: ViewerState; dispatch: React.Dispatch<ViewerAction>; blocked: boolean }) {
  const { camera, gl } = useThree();
  const live = useRef(state); live.current = state;
  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new Raycaster();
    const contacts = new Map<number, { x: number; y: number }>();
    let owner: 'loupe' | 'table' | 'inspection' | 'parked' = 'table';
    let origin = { x: 0, y: 0 }, moved = false, multiple = false;
    const send = (action: ViewerAction) => { live.current = viewerReducer(live.current, action); dispatch(action); };
    const consume = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const center = () => { const p = [...contacts.values()]; return { x: p.reduce((n,v)=>n+v.x,0)/p.length, y: p.reduce((n,v)=>n+v.y,0)/p.length }; };
    const distance = () => { const p = [...contacts.values()]; return p.length === 2 ? Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y) : 0; };
    const down = (e: PointerEvent) => {
      const s = live.current, touch = e.pointerType !== 'mouse';
      if (blocked || s.roomMode !== 'inspect' || e.button > 0) return;
      const [sampleX, sampleY] = (canvas.dataset.loupeSample ?? '').split(',').map(Number);
      const point = tablePointAt(camera, canvas, e.clientX, e.clientY, TABLE_SURFACE_Y + .008 + loupeGeometry(s.loupe.type).lensHeight * s.loupe.scale);
      let hit = !!point && Math.hypot(point.x - sampleX, point.z - (TABLE_CENTER_Z - sampleY)) <= loupeGeometry(s.loupe.type).radius * s.loupe.scale;
      if (s.loupe.type === 'glass') {
        const rect = canvas.getBoundingClientRect();
        raycaster.setFromCamera(new Vector2((e.clientX-rect.left)/rect.width*2-1, 1-(e.clientY-rect.top)/rect.height*2), camera);
        const intersection = raycaster.ray.intersectSphere(new Sphere(new Vector3(sampleX, TABLE_SURFACE_Y+.008, TABLE_CENTER_Z-sampleY), loupeGeometry('glass').radius*s.loupe.scale), new Vector3());
        hit = !!intersection && intersection.y >= TABLE_SURFACE_Y+.008;
      }
      if (!contacts.size && !s.loupe.inspecting && !(s.loupe.isActive && touch) && !hit) { owner = 'table'; moved = false; return; }
      consume(e);
      if (s.isTransitioning) return;
      send({ type: 'TOUCH_POINTER', active: touch });
      if (touch) send({ type: 'INPUT_TOUCH', active: true });
      if (!contacts.size) {
        origin = { x: e.clientX, y: e.clientY }; moved = false; multiple = false;
        owner = s.loupe.inspecting ? 'inspection' : hit ? s.loupe.isActive ? 'loupe' : 'parked' : 'table';
      } else { multiple = true; if (owner !== 'inspection') owner = 'table'; }
      canvas.dataset.loupeGesture = owner;
      contacts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* Synthetic accessibility input may have no native contact. */ }
    };
    const move = (e: PointerEvent) => {
      if (!contacts.has(e.pointerId)) return;
      consume(e);
      const s = live.current, old = center(), oldDistance = distance();
      contacts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const next = center();
      const wasMoved = moved;
      moved ||= Math.hypot(e.clientX-origin.x,e.clientY-origin.y) > (e.pointerType === 'mouse' ? 6 : 8);
      if ((!moved && !multiple) || s.isTransitioning || contacts.size > 2) return;
      const dx = !wasMoved && !multiple ? next.x-origin.x : next.x-old.x;
      const dy = !wasMoved && !multiple ? next.y-origin.y : next.y-old.y;
      if (owner === 'inspection') {
        const radius = Number(canvas.dataset.loupeDisplay?.split(',')[2]) || 120;
        const wpp = loupeGeometry(s.loupe.type).radius * s.loupe.scale / (radius * s.loupe.magnification);
        // Ignore contact separation completely; centroid translation still moves.
        send({ type: 'MOVE_LOUPE', dx: -dx*wpp, dy: dy*wpp });
      } else if (owner === 'loupe') {
        const height = TABLE_SURFACE_Y + .008 + loupeGeometry(s.loupe.type).lensHeight * s.loupe.scale;
        const from = tablePointAt(camera, canvas, next.x - dx, next.y - dy, height), to = tablePointAt(camera, canvas, next.x, next.y, height);
        if (from && to) send({ type: 'MOVE_LOUPE', dx: to.x - from.x, dy: from.z - to.z });
      } else if (owner === 'table') {
        const ratio = contacts.size === 2 && oldDistance > 8 && distance() > 8 ? oldDistance/distance() : 1;
        const max = s.focusMode ? fitRollView(s.roll, 'frame', s.activeFrameIndex, s.viewportAspect).zoom : Math.max(3.6, fitRollView(s.roll, 'roll', 0, s.viewportAspect).zoom);
        const zoom = Math.max(.12 * s.roll.scale, Math.min(max, s.inspectZoom * ratio));
        const inputCamera = tableInputCamera(s.inspectZoom, s.inspectPan, s.focusMode ? TOP_DOWN : s.tableAngle, s.viewportAspect);
        const from = tablePointAt(inputCamera, canvas, next.x - dx, next.y - dy), to = tablePointAt(inputCamera, canvas, next.x, next.y);
        if (from && to) send({ type: 'TOUCH_VIEW', zoom, x: from.x + (s.inspectPan.x - to.x) * zoom / s.inspectZoom, z: from.z + (s.inspectPan.z - to.z) * zoom / s.inspectZoom });
      }
    };
    const up = (e: PointerEvent) => {
      if (!contacts.has(e.pointerId)) return;
      consume(e); contacts.delete(e.pointerId);
      if (!contacts.size && !moved && !multiple) {
        if (owner === 'loupe') send({ type: 'INSPECT_LOUPE' });
        if (owner === 'inspection') send({ type: 'PULL_BACK_LOUPE' });
        if (owner === 'parked') send({ type: 'SET_LOUPE_ACTIVE', active: true });
      }
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const cancel = () => { const ids = [...contacts.keys()]; contacts.clear(); multiple = true; ids.forEach(id=>{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}); };
    const lost = (e: PointerEvent) => { if (contacts.has(e.pointerId)) cancel(); };
    // R3F clicks must not replay the same gesture as a frame/table click.
    const click = (e: MouseEvent) => { if (live.current.loupe.isActive || owner === 'parked' || moved) consume(e); };
    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true);
    canvas.addEventListener('click', click, true);
    canvas.addEventListener('lostpointercapture', lost);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      cancel(); canvas.removeEventListener('pointerdown',down,true); canvas.removeEventListener('pointermove',move,true); canvas.removeEventListener('pointerup',up,true); canvas.removeEventListener('click',click,true); canvas.removeEventListener('lostpointercapture',lost);
      window.removeEventListener('pointercancel',cancel); window.removeEventListener('blur',cancel); window.removeEventListener('resize',cancel); document.removeEventListener('visibilitychange',cancel);
    };
  }, [camera, gl, blocked, dispatch]);
  return null;
}
