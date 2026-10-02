import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchGestures, GestureIntent } from '../../src/utils/touchGestures';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';
import { FULL_ROLL_FIXTURE, fitRollView, anchoredZoom, clampFocusPan } from '../../src/utils/rollLayout';
import { touchLoupePlacement } from '../../src/utils/touchLoupe';
import { MAX_ROOM_ZOOM } from '../../src/utils/cameraBounds';
const p=(id:number,x:number,y=100)=>({id,x,y});
afterEach(()=>vi.useRealTimers());
describe('M15 touch gestures and shared viewer',()=>{
  it('crosses strips by one frame, clamps ends and does not navigate on a vertical drag',()=>{
    let state=viewerReducer(createInitialViewerState('inspect',FULL_ROLL_FIXTURE),{type:'OPEN_FRAME',frameIndex:5});
    const intents:GestureIntent[]=[];
    const gesture=new TouchGestures(i=>{intents.push(i);if(i.type==='swipe')state=viewerReducer(state,{type:'OPEN_FRAME',frameIndex:state.activeFrameIndex+(i.direction==='right'?1:-1)});});
    gesture.down(p(1,200),'swipe');gesture.move(p(1,120));gesture.up(p(1,100));
    expect(state.activeFrameIndex).toBe(6);expect(state.inspectionLevel).toBe('frame');
    gesture.down(p(1,200),'swipe');gesture.move(p(1,150,240));gesture.up(p(1,150,260));expect(intents).toHaveLength(1);
    state=viewerReducer(state,{type:'OPEN_FRAME',frameIndex:35});gesture.down(p(1,200),'swipe');gesture.move(p(1,120));gesture.up(p(1,100));expect(state.activeFrameIndex).toBe(35);
  });
  it('a second contact cancels pending taps, anchors a pinch and rebases the remaining finger without swiping',()=>{
    vi.useFakeTimers();const intents:GestureIntent[]=[];const g=new TouchGestures(i=>intents.push(i));
    g.down(p(1,100),'swipe');g.up(p(1,100));g.down(p(1,100),'swipe');g.down(p(2,200),'swipe');g.move(p(2,300));
    const pinch=intents[0];expect(pinch.type).toBe('pinch');if(pinch.type!=='pinch')throw Error();
    expect(pinch.ratio).toBe(.5);expect(pinch.from.x).toBe(150);expect(pinch.to.x).toBe(200);
    const anchored=anchoredZoom(2,1,{x:0,z:0},{x:.5,z:.25});expect(anchored).toEqual({x:.25,z:.125});
    g.up(p(2,300));g.move(p(1,110));g.up(p(1,110));vi.runAllTimers();
    expect(intents.map(i=>i.type)).toEqual(['pinch','pan']);expect(intents[1]).toEqual({type:'pan',dx:10,dy:0,x:110,y:100});
  });
  it('double tap is exclusive and cancellation cannot leave delayed actions',()=>{
    vi.useFakeTimers();const intents:GestureIntent[]=[];const g=new TouchGestures(i=>intents.push(i));
    g.down(p(1,100),'pan');g.up(p(1,100),1000);g.down(p(1,102),'pan');g.up(p(1,102),1100);vi.runAllTimers();expect(intents.map(i=>i.type)).toEqual(['doubleTap']);
    g.down(p(1,100),'pan');g.up(p(1,100),2000);g.cancel();vi.runAllTimers();expect(intents).toHaveLength(1);expect(g.contacts.size).toBe(0);
  });
  it('loupe owns one finger while two fingers can only transform the underlying view',()=>{
    const intents:GestureIntent[]=[];const g=new TouchGestures(i=>intents.push(i));g.down(p(1,100),'loupe');g.move(p(1,130));g.down(p(2,200),'loupe');g.move(p(2,240));g.up(p(2,240));g.move(p(1,140));g.up(p(1,140));expect(intents.map(i=>i.type)).toEqual(['loupe','loupe','pinch','pan']);
  });
  it('two fingers in room mode only pinch the standing eye\'s lens',()=>{
    const intents:GestureIntent[]=[];const g=new TouchGestures(i=>intents.push(i));g.down(p(1,100),'room');g.down(p(2,200),'room');g.move(p(2,300));g.up(p(2,300));g.up(p(1,100));expect(intents.map(i=>i.type)).toEqual(['pinch']);
    let s=viewerReducer(createInitialViewerState('room'),{type:'ZOOM_ROOM',factor:2});expect(s.savedRoomPose.zoom).toBe(2);expect(s.savedRoomPose.yaw).toBe(0);
    s=viewerReducer(s,{type:'ZOOM_ROOM',factor:100});expect(s.savedRoomPose.zoom).toBe(MAX_ROOM_ZOOM);
    s=viewerReducer(s,{type:'FACE_TABLE'});expect(s.savedRoomPose.zoom).toBe(1);
  });
  it('direct touch interrupts inspection travel but retains guarded room journeys',()=>{
    let s=viewerReducer(createInitialViewerState('inspect',FULL_ROLL_FIXTURE),{type:'INPUT_TOUCH',active:true});
    s=viewerReducer(s,{type:'OPEN_FRAME',frameIndex:8});s=viewerReducer(s,{type:'TOUCH_VIEW',zoom:.3,x:.2,z:.1});expect(s.isTransitioning).toBe(false);expect(s.activeFrameIndex).toBe(8);expect(s.inspectPan).toEqual(clampFocusPan(s.roll,8,.3,s.viewportAspect,.2,.1));
    s=viewerReducer(s,{type:'RETURN_TO_ROOM'});expect(viewerReducer(s,{type:'TOUCH_VIEW',zoom:.2,x:0,z:0})).toBe(s);
  });
  it('rotation preserves magnification relative to Fit and preserves pinned loupe and crop detail position',()=>{
    let s=viewerReducer(createInitialViewerState('inspect',FULL_ROLL_FIXTURE),{type:'INPUT_TOUCH',active:true});s=viewerReducer(s,{type:'OPEN_FRAME',frameIndex:6});s=viewerReducer(s,{type:'SET_TRANSITIONING',isTransitioning:false});s=viewerReducer(s,{type:'TOUCH_VIEW',zoom:s.inspectZoom/2,x:.3,z:.1});s=viewerReducer(s,{type:'SET_LOUPE_POSITION',x:.4,y:.2});
    const old=s,ratio=s.inspectZoom/fitRollView(s.roll,'frame',6,s.viewportAspect).zoom;s=viewerReducer(s,{type:'VIEWPORT',aspect:.65});expect(s.inspectZoom/fitRollView(s.roll,'frame',6,.65).zoom).toBeCloseTo(ratio);expect(s.inspectPan).toEqual(clampFocusPan(s.roll,6,s.inspectZoom,.65,old.inspectPan.x,old.inspectPan.z));expect(s.loupe).toEqual(old.loupe);
    s=viewerReducer(s,{type:'CAMERA_MOTION',moving:true});s=viewerReducer(s,{type:'CAMERA_MOTION',moving:false});expect(s.loupe).toEqual(old.loupe);
    s=viewerReducer(s,{type:'FIT_VIEW'});expect(s.inspectZoom).toBe(fitRollView(s.roll,'frame',6,.65).zoom);
  });
  it('touch loupe stays on screen and avoids its sample at all four corners',()=>{
    for(const [x,y] of [[3,3],[372,3],[3,480],[372,480],[180,240]]){const r=touchLoupePlacement(x,y,375,490);expect(r.x-r.radius).toBeGreaterThanOrEqual(0);expect(r.x+r.radius).toBeLessThanOrEqual(375);expect(r.y-r.radius).toBeGreaterThanOrEqual(0);expect(r.y+r.radius).toBeLessThanOrEqual(490);expect(Math.hypot(r.x-x,r.y-y)).toBeGreaterThan(r.radius+20);}
    expect(touchLoupePlacement(-20,200,375,490).visible).toBe(false);
  });
  it('scales the touch lens with the film while retaining usable placement at extreme zoom',()=>{
    const normal=touchLoupePlacement(195,330,390,672,58),zoomed=touchLoupePlacement(195,330,390,672,116);
    expect(zoomed.radius).toBe(normal.radius*2);
    for(const [w,h] of [[390,672],[1180,698],[844,290],[390,390]]){
      const r=touchLoupePlacement(w/2,h/2,w,h,1000);
      expect(r.visible).toBe(true);expect(r.x-r.radius).toBeGreaterThanOrEqual(0);expect(r.x+r.radius).toBeLessThanOrEqual(w);expect(r.y-r.radius).toBeGreaterThanOrEqual(0);expect(r.y+r.radius).toBeLessThanOrEqual(h);
      expect(Math.hypot(r.x-w/2,r.y-h/2)).toBeGreaterThan(r.radius+20);
    }
  });
});
