import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ViewerAction, ViewerState, viewerReducer } from '../state/viewerState';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { anchoredZoom, fitRollView, mapRollPoint } from '../utils/rollLayout';
import { GestureIntent, TouchGestures } from '../utils/touchGestures';

export function TouchNavigation({ state, dispatch, blocked }: { state: ViewerState; dispatch: React.Dispatch<ViewerAction>; blocked: boolean }) {
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
    const emit = (intent: GestureIntent) => {
      const s = live.current;
      if (blocked || s.transitionKind === 'journey') return;
      if (intent.type === 'look') { dispatch({ type: 'LOOK_ROOM', yaw: intent.dx*.0035, pitch: -intent.dy*.0035 }); return; }
      if (s.roomMode === 'room') {
        if (intent.type === 'tap') {
          const p = at(intent.x, intent.y);
          if (p && Math.abs(p.x) < 1.85 && Math.abs(p.z - TABLE_CENTER_Z) < .8) dispatch({type:'APPROACH_TABLE'});
        }
        return;
      }
      const renderedZoom = camera.position.y - TABLE_SURFACE_Y;
      const renderedPan = { x: camera.position.x, z: camera.position.z };
      // Touch starts from the current rendered pose, including during a flight.
      const zoom = s.isTransitioning ? renderedZoom : s.inspectZoom;
      const pan = s.isTransitioning ? renderedPan : s.inspectPan;
      const wpp = 2 * zoom * Math.tan(Math.PI/8) / canvas.clientHeight;
      const tableAt=(x:number,y:number)=>{const r=canvas.getBoundingClientRect();return {x:pan.x+(x-r.left-r.width/2)*wpp,z:pan.z+(y-r.top-r.height/2)*wpp};};
      const view = (z: number, p: {x:number;z:number}) => {
        const max = s.focusMode ? fitRollView(s.roll,'frame',s.activeFrameIndex,s.viewportAspect).zoom : Math.max(3.6, fitRollView(s.roll,'roll',0,s.viewportAspect).zoom);
        const next = Math.max(.12*s.roll.scale, Math.min(max,z));
        const action:ViewerAction={type:'TOUCH_VIEW',zoom:next,x:p.x,z:p.z};
        // Browsers dispatch both contacts before React renders. Accumulate the
        // two updates immediately so neither half of the pinch is dropped.
        live.current=viewerReducer(s,action);dispatch(action);
      };
      if (intent.type === 'pan') view(zoom, {x:pan.x-intent.dx*wpp,z:pan.z-intent.dy*wpp});
      if (intent.type === 'pinch') {
        const p = tableAt(intent.from.x,intent.from.y);
        const max = s.focusMode ? fitRollView(s.roll,'frame',s.activeFrameIndex,s.viewportAspect).zoom : Math.max(3.6,fitRollView(s.roll,'roll',0,s.viewportAspect).zoom);
        const next = Math.max(.12*s.roll.scale,Math.min(max,zoom*intent.ratio));
        const anchored = anchoredZoom(zoom,next,pan,p);
        const nextWpp=2*next*Math.tan(Math.PI/8)/canvas.clientHeight;
        view(next,{x:anchored.x-(intent.to.x-intent.from.x)*nextWpp,z:anchored.z-(intent.to.y-intent.from.y)*nextWpp});
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
        else { const p=tableAt(intent.x,intent.y); const next=Math.max(.12*s.roll.scale,fit.zoom/2);view(next,anchoredZoom(zoom,next,pan,p)); }
      }
    };
    const gesture = new TouchGestures(emit);
    let priorSample={x:0,y:0};
    let magnified = false;
    const point=(e:PointerEvent)=>({id:e.pointerId,x:e.clientX,y:e.clientY});
    const consume=(e:PointerEvent)=>{e.preventDefault();e.stopImmediatePropagation();};
    const down=(e:PointerEvent)=>{
      if(e.pointerType!=='touch'&&e.pointerType!=='pen'){dispatch({type:'TOUCH_POINTER',active:false});return;}
      consume(e); if(blocked||live.current.transitionKind==='journey')return;
      dispatch({type:'INPUT_TOUCH',active:true});
      dispatch({type:'TOUCH_POINTER',active:true});
      const s=live.current,fit=fitRollView(s.roll,'frame',s.activeFrameIndex,s.viewportAspect);
      if(!gesture.contacts.size)priorSample={x:s.loupe.worldX,y:s.loupe.worldY};
      else if(gesture.contacts.size===1&&s.loupe.isActive){const action:ViewerAction={type:'SET_LOUPE_POSITION',...priorSample};live.current=viewerReducer(s,action);dispatch(action);}
      magnified=s.inspectZoom < fit.zoom*(magnified?.97:.92);
      gesture.down(point(e),s.roomMode==='room'?'room':s.loupe.isActive?'loupe':s.inspectionLevel==='frame'&&!magnified?'swipe':'pan');
      canvas.setPointerCapture(e.pointerId);
    };
    const move=(e:PointerEvent)=>{if(e.pointerType==='mouse'&&live.current.touchPointer)dispatch({type:'TOUCH_POINTER',active:false});if(gesture.contacts.has(e.pointerId)){consume(e);gesture.move(point(e));}};
    const up=(e:PointerEvent)=>{if(gesture.contacts.has(e.pointerId)){consume(e);gesture.up(point(e));if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}};
    const cancel=()=>{const ids=[...gesture.contacts.keys()];gesture.cancel();ids.forEach(id=>{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);});};
    const lost=(e:PointerEvent)=>{if(gesture.contacts.has(e.pointerId))cancel();};
    const click=(e:MouseEvent)=>{if((e as PointerEvent).pointerType==='touch'||(e as PointerEvent).pointerType==='pen'){e.preventDefault();e.stopImmediatePropagation();}};
    canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);
    canvas.addEventListener('click',click,true);canvas.addEventListener('lostpointercapture',lost);
    window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);window.addEventListener('pointercancel',cancel);document.addEventListener('visibilitychange',cancel);
    return()=>{cancel();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('click',click,true);canvas.removeEventListener('lostpointercapture',lost);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);window.removeEventListener('pointercancel',cancel);document.removeEventListener('visibilitychange',cancel);};
  },[camera,gl,blocked,dispatch]);
  return null;
}
