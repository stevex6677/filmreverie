import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { ViewerAction, ViewerState, viewerReducer } from '../state/viewerState';
import { tableInputCamera, tablePointAt } from '../utils/tableCamera';
import { fitRollView } from '../utils/rollLayout';

/** Capture angle gestures before film, loupe, and ordinary table navigation. */
export function TableAngleNavigation({ state, dispatch, blocked }: { state: ViewerState; dispatch: React.Dispatch<ViewerAction>; blocked: boolean }) {
  const { gl } = useThree();
  const live = useRef(state); live.current = state;
  const cancelGesture = useRef(() => {});
  useEffect(() => { cancelGesture.current(); }, [state.adjustingView, state.focusMode, state.roomMode, state.loupe.inspecting]);
  useEffect(() => {
    const canvas = gl.domElement;
    const contacts = new Map<number, { x: number; y: number }>();
    let suppressClick = false, multiple = false;
    const send = (action: ViewerAction) => { live.current = viewerReducer(live.current, action); dispatch(action); };
    const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const center = () => {
      const points = [...contacts.values()];
      return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
    };
    const distance = () => {
      const points = [...contacts.values()];
      return points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    };
    const down = (event: PointerEvent) => {
      const s = live.current;
      if (blocked || s.roomMode !== 'inspect' || s.focusMode || s.loupe.inspecting || s.isTransitioning || event.button !== 0) return;
      if (!s.adjustingView && !(event.pointerType === 'mouse' && event.shiftKey) && !contacts.size) { suppressClick = false; return; }
      consume(event); suppressClick = true;
      if (!contacts.size) multiple = false;
      else multiple = true;
      contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
      send({ type: 'SET_ANGLE_DRAGGING', active: true });
      try { canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic input. */ }
    };
    const move = (event: PointerEvent) => {
      if (!contacts.has(event.pointerId)) return;
      consume(event);
      const previous = center(), previousDistance = distance();
      contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = center(), s = live.current;
      if (contacts.size === 1 && !multiple) {
        send({ type: 'ADJUST_TABLE_ANGLE', yaw: (next.x - previous.x) * .005, tilt: (next.y - previous.y) * .005 });
      } else if (contacts.size === 2 && previousDistance > 8 && distance() > 8) {
        const max = Math.max(3.6, fitRollView(s.roll, 'roll', 0, s.viewportAspect).zoom);
        const zoom = Math.max(.12 * s.roll.scale, Math.min(max, s.inspectZoom * previousDistance / distance()));
        const ratio = zoom / s.inspectZoom;
        const camera = tableInputCamera(s.inspectZoom, s.inspectPan, s.tableAngle, s.viewportAspect);
        const from = tablePointAt(camera, canvas, previous.x, previous.y), to = tablePointAt(camera, canvas, next.x, next.y);
        if (from && to) send({ type: 'TOUCH_VIEW', zoom, x: from.x + (s.inspectPan.x - to.x) * ratio, z: from.z + (s.inspectPan.z - to.z) * ratio });
      }
    };
    const up = (event: PointerEvent) => {
      if (!contacts.has(event.pointerId)) return;
      consume(event); contacts.delete(event.pointerId);
      if (!contacts.size) send({ type: 'SET_ANGLE_DRAGGING', active: false });
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const cancel = () => {
      const ids = [...contacts.keys()]; contacts.clear();
      if (ids.length) send({ type: 'SET_ANGLE_DRAGGING', active: false });
      ids.forEach(id => { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); });
    };
    cancelGesture.current = cancel;
    const lost = (event: PointerEvent) => { if (contacts.has(event.pointerId)) cancel(); };
    const click = (event: MouseEvent) => {
      if (suppressClick || live.current.adjustingView) { consume(event); suppressClick = false; }
    };
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
      cancel();
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('click', click, true);
      canvas.removeEventListener('lostpointercapture', lost);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [gl, dispatch, blocked]);
  return null;
}
