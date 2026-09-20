import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ViewerAction, ViewerState, viewerReducer } from '../state/viewerState';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { anchoredZoom, fitRollView, lightTableSize, mapRollPoint } from '../utils/rollLayout';
import { tableInputCamera, tablePointAt, TOP_DOWN } from '../utils/tableCamera';
import { GestureIntent, TouchGestures } from '../utils/touchGestures';
import { roomHitTarget } from '../utils/roomHitTarget';

export function TouchNavigation({
  state,
  dispatch,
  blocked,
  livePose,
}: {
  state: ViewerState;
  dispatch: React.Dispatch<ViewerAction>;
  blocked: boolean;
  livePose?: React.MutableRefObject<{ zoom: number; pan: { x: number; z: number }; active: boolean }>;
}) {
  const { camera, gl } = useThree();
  const live = useRef(state); live.current = state;
  useEffect(() => {
    const canvas = gl.domElement;
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_SURFACE_Y);
    const at = (x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1, 1-(y-r.top)/r.height*2), camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    const captures = new Map<number, HTMLElement>();
    const accepts = (target: EventTarget | null) => target === canvas || (target instanceof Element && !!target.closest('.shelf-approach-target, .camera-shelf-target'));
    const release = (id: number) => { const owner = captures.get(id); captures.delete(id); if (owner?.hasPointerCapture(id)) owner.releasePointerCapture(id); };
    let pinchSession: {
      startDistance: number;
      startCenter: { x: number; y: number };
      startZoom: number;
      startPan: { x: number; z: number };
      anchor: { x: number; z: number };
    } | null = null;
    const emit = (intent: GestureIntent) => {
      const s = live.current;
      if (blocked || s.shelfFocused) return;
      if (intent.type === 'look') { dispatch({ type: 'LOOK_ROOM', yaw: intent.dx*.0035, pitch: -intent.dy*.0035 }); return; }
      if (s.roomMode === 'room') {
        if (intent.type === 'tap') {
          const target = roomHitTarget(camera, canvas, intent.x, intent.y, lightTableSize(s.roll));
          if (target) dispatch({ type: target === 'table' ? 'APPROACH_TABLE' : target === 'camera' ? 'APPROACH_CAMERA_SHELF' : 'APPROACH_SHELF' });
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const center = at(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const renderedZoom = center ? camera.position.distanceTo(center) : s.inspectZoom;
      const renderedPan = center ? { x: center.x, z: center.z } : s.inspectPan;
      // Touch starts from the current rendered pose, including during a flight.
      const zoom = s.isTransitioning ? renderedZoom : s.inspectZoom;
      const pan = s.isTransitioning ? renderedPan : s.inspectPan;
      const inputCamera = s.isTransitioning ? camera : tableInputCamera(zoom, pan, s.focusMode ? TOP_DOWN : s.tableAngle, s.viewportAspect);
      const tableAt = (x: number, y: number) => tablePointAt(inputCamera, canvas, x, y);
      const view = (z: number, p: {x:number;z:number}) => {
        const max = s.focusMode ? fitRollView(s.roll,'frame',s.activeFrameIndex,s.viewportAspect).zoom : Math.max(3.6, fitRollView(s.roll,'roll',0,s.viewportAspect).zoom);
        const next = Math.max(.12*s.roll.scale, Math.min(max,z));
        if (livePose) {
          livePose.current.zoom = next;
          livePose.current.pan = p;
          livePose.current.active = true;
        }
        const action:ViewerAction={type:'TOUCH_VIEW',zoom:next,x:p.x,z:p.z};
        // Browsers dispatch both contacts before React renders. Accumulate the
        // two updates immediately so neither half of the pinch is dropped.
        live.current=viewerReducer(s,action);dispatch(action);
      };
      if (intent.type === 'pan') {
        const from = tableAt(intent.x - intent.dx, intent.y - intent.dy), to = tableAt(intent.x, intent.y);
        if (from && to) view(zoom, { x: pan.x + from.x - to.x, z: pan.z + from.z - to.z });
      }
      if (intent.type === 'pinch') {
        const pts = [...gesture.contacts.values()];
        if (pts.length !== 2) return;
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const currentCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (currentDist <= 8) return;

        if (!pinchSession) {
          const anchor = tableAt(currentCenter.x, currentCenter.y);
          if (!anchor) return;
          pinchSession = {
            startDistance: currentDist,
            startCenter: currentCenter,
            startZoom: zoom,
            startPan: pan,
            anchor,
          };
        }

        const max = s.focusMode ? fitRollView(s.roll,'frame',s.activeFrameIndex,s.viewportAspect).zoom : Math.max(3.6,fitRollView(s.roll,'roll',0,s.viewportAspect).zoom);
        const min = 0.12 * s.roll.scale;
        const ratio = pinchSession.startDistance / currentDist;
        const next = Math.max(min, Math.min(max, pinchSession.startZoom * ratio));
        const anchored = anchoredZoom(pinchSession.startZoom, next, pinchSession.startPan, pinchSession.anchor);

        // Filter out alternating single-finger micro-jitter on the centroid
        const dx = currentCenter.x - pinchSession.startCenter.x;
        const dy = currentCenter.y - pinchSession.startCenter.y;
        const dist = Math.hypot(dx, dy);
        let panX = anchored.x, panZ = anchored.z;
        if (dist > 8) {
          const factor = (dist - 8) / dist;
          const from = tablePointAt(inputCamera, canvas, pinchSession.startCenter.x, pinchSession.startCenter.y);
          const to = tablePointAt(inputCamera, canvas, pinchSession.startCenter.x + dx * factor, pinchSession.startCenter.y + dy * factor);
          if (from && to) {
            panX += from.x - to.x;
            panZ += from.z - to.z;
          }
        }

        if (next === min || next === max) {
          // Rebase when hitting bounds so reversing direction is instantaneous
          const rebaseAnchor = tableAt(currentCenter.x, currentCenter.y) || pinchSession.anchor;
          pinchSession = {
            startDistance: currentDist,
            startCenter: currentCenter,
            startZoom: next,
            startPan: { x: panX, z: panZ },
            anchor: rebaseAnchor,
          };
        }

        view(next, { x: panX, z: panZ });
      }
      if (intent.type === 'swipe') dispatch({type:'OPEN_FRAME',frameIndex:s.activeFrameIndex+(intent.direction==='right'?1:-1)});
      if (intent.type === 'loupe') {
        const p=at(intent.x,intent.y); if(p) dispatch({type:'SET_LOUPE_POSITION',x:p.x,y:TABLE_CENTER_Z-p.z});
      }
      if (intent.type === 'tap') {
        if (s.focusMode) { canvas.dispatchEvent(new CustomEvent('film-reveal-controls', {bubbles:true})); return; }
        const p=at(intent.x,intent.y); if(!p)return;
        const mapped=mapRollPoint(s.roll,{x:p.x,y:TABLE_CENTER_Z-p.z});
        if(mapped.isWithinFrame) dispatch({type:'OPEN_FRAME',frameIndex:mapped.frameIndex});
      }
      if (intent.type === 'doubleTap') {
        const fit=fitRollView(s.roll,s.inspectionLevel,s.activeFrameIndex,s.viewportAspect);
        if(s.inspectZoom < fit.zoom*.92) dispatch({type:'FIT_VIEW'});
        else { const p=tableAt(intent.x,intent.y); if(!p)return; const next=Math.max(.12*s.roll.scale,fit.zoom/2);view(next,anchoredZoom(zoom,next,pan,p)); }
      }
    };
    const gesture = new TouchGestures(emit);
    let priorSample={x:0,y:0};
    let magnified = false;
    let capturedTouchClick = false;
    const point=(e:PointerEvent)=>({id:e.pointerId,x:e.clientX,y:e.clientY});
    const consume=(e:PointerEvent)=>{e.preventDefault();e.stopImmediatePropagation();};
    const down=(e:PointerEvent)=>{
      if (!accepts(e.target) || live.current.shelfFocused) return;
      if(e.pointerType!=='touch'&&e.pointerType!=='pen'){dispatch({type:'TOUCH_POINTER',active:false});return;}
      capturedTouchClick = true;
      consume(e); if(blocked)return;
      dispatch({type:'INPUT_TOUCH',active:true});
      dispatch({type:'TOUCH_POINTER',active:true});
      const s=live.current,fit=fitRollView(s.roll,'frame',s.activeFrameIndex,s.viewportAspect);
      if(!gesture.contacts.size)priorSample={x:s.loupe.worldX,y:s.loupe.worldY};
      else if(gesture.contacts.size===1&&s.loupe.isActive){const action:ViewerAction={type:'SET_LOUPE_POSITION',...priorSample};live.current=viewerReducer(s,action);dispatch(action);}
      if (gesture.contacts.size === 1) pinchSession = null;
      magnified=s.inspectZoom < fit.zoom*(magnified?.97:.92);
      gesture.down(point(e),s.roomMode==='room'?'room':s.loupe.isActive?'loupe':s.inspectionLevel==='frame'&&!magnified?'swipe':'pan');
      const owner = e.target as HTMLElement; captures.set(e.pointerId, owner);
      try { owner.setPointerCapture(e.pointerId); } catch {}
    };
    const move=(e:PointerEvent)=>{if(!gesture.contacts.has(e.pointerId)&&!accepts(e.target))return;if(e.pointerType==='mouse'&&live.current.touchPointer)dispatch({type:'TOUCH_POINTER',active:false});if(gesture.contacts.has(e.pointerId)){consume(e);gesture.move(point(e));}};
    const up=(e:PointerEvent)=>{if(gesture.contacts.has(e.pointerId)){consume(e);gesture.up(point(e));release(e.pointerId);if(gesture.contacts.size<2)pinchSession=null;if(!gesture.contacts.size&&livePose)livePose.current.active=false;}};
    const cancel=()=>{pinchSession=null;if(livePose)livePose.current.active=false;const ids=[...gesture.contacts.keys()];gesture.cancel();ids.forEach(release);};
    const lost=(e:PointerEvent)=>{if(gesture.contacts.has(e.pointerId)){if(gesture.contacts.size<=1)cancel();else{gesture.up(point(e));release(e.pointerId);pinchSession=null;}}};
    const click=(e:MouseEvent)=>{if(capturedTouchClick&&accepts(e.target)&&((e as PointerEvent).pointerType==='touch'||(e as PointerEvent).pointerType==='pen')){capturedTouchClick=false;e.preventDefault();e.stopImmediatePropagation();}};
    // Preserve the loupe's priority on the canvas; share these handlers with
    // the room's cabinet overlay without intercepting table/loupe gestures.
    const shelfDown=(e:PointerEvent)=>{if(e.target!==canvas)down(e);};
    const shelfMove=(e:PointerEvent)=>{if(e.target!==canvas)move(e);};
    const shelfUp=(e:PointerEvent)=>{if(e.target!==canvas)up(e);};
    const shelfClick=(e:MouseEvent)=>{if(e.target!==canvas)click(e);};
    canvas.addEventListener('pointerdown',down,true);document.addEventListener('pointerdown',shelfDown,true);canvas.addEventListener('pointermove',move,true);document.addEventListener('pointermove',shelfMove,true);canvas.addEventListener('pointerup',up,true);document.addEventListener('pointerup',shelfUp,true);
    canvas.addEventListener('click',click,true);document.addEventListener('click',shelfClick,true);document.addEventListener('lostpointercapture',lost,true);
    window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);window.addEventListener('pointercancel',cancel);document.addEventListener('visibilitychange',cancel);
    return()=>{cancel();canvas.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerdown',shelfDown,true);canvas.removeEventListener('pointermove',move,true);document.removeEventListener('pointermove',shelfMove,true);canvas.removeEventListener('pointerup',up,true);document.removeEventListener('pointerup',shelfUp,true);canvas.removeEventListener('click',click,true);document.removeEventListener('click',shelfClick,true);document.removeEventListener('lostpointercapture',lost,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);window.removeEventListener('pointercancel',cancel);document.removeEventListener('visibilitychange',cancel);};
  },[camera,gl,blocked,dispatch]);
  return null;
}
