import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { ViewerAction, ViewerState, viewerReducer } from '../state/viewerState';
import { TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { LOUPE_LENS_HEIGHT, LOUPE_RADIUS } from '../utils/loupeView';

/** One gesture owner for the physical object and the close-eye view. */
export function LoupeNavigation({ state, dispatch, blocked }: { state: ViewerState; dispatch: React.Dispatch<ViewerAction>; blocked: boolean }) {
  const { camera, gl } = useThree();
  const live = useRef(state); live.current = state;
  useEffect(() => {
    const canvas = gl.domElement;
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
      const rect = canvas.getBoundingClientRect();
      const [x,y,r] = (canvas.dataset.loupeDisplay ?? '').split(',').map(Number);
      const hit = Math.hypot(e.clientX-rect.left-x,e.clientY-rect.top-y) <= r;
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
        const wpp = LOUPE_RADIUS * s.loupe.scale / (radius * s.loupe.magnification);
        // Ignore contact separation completely; centroid translation still moves.
        send({ type: 'MOVE_LOUPE', dx: -dx*wpp, dy: dy*wpp });
      } else if (owner === 'loupe') {
        const wpp = 2 * (camera.position.y-TABLE_SURFACE_Y-.008-LOUPE_LENS_HEIGHT*s.loupe.scale) * Math.tan(Math.PI/8) / canvas.clientHeight;
        send({ type: 'MOVE_LOUPE', dx: dx*wpp, dy: -dy*wpp });
      } else if (owner === 'table') {
        const rect = canvas.getBoundingClientRect();
        const ratio = contacts.size === 2 && oldDistance > 8 && distance() > 8 ? oldDistance/distance() : 1;
        const zoom = s.inspectZoom * ratio;
        const wpp = 2*s.inspectZoom*Math.tan(Math.PI/8)/rect.height;
        const anchor = { x: s.inspectPan.x+(old.x-rect.left-rect.width/2)*wpp, z: s.inspectPan.z+(old.y-rect.top-rect.height/2)*wpp };
        send({ type: 'TOUCH_VIEW', zoom, x: anchor.x+(s.inspectPan.x-anchor.x)*ratio-dx*wpp*ratio, z: anchor.z+(s.inspectPan.z-anchor.z)*ratio-dy*wpp*ratio });
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
