import { describe, it, expect } from 'vitest';
import { createInitialViewerState, viewerReducer, ViewerAction } from '../../src/state/viewerState';
import { FULL_ROLL_FIXTURE, locateFrame } from '../../src/utils/rollLayout';
import { loupeInspectionView } from '../../src/utils/loupeView';

const active = () => viewerReducer(createInitialViewerState(), { type:'SET_LOUPE_ACTIVE', active:true });
const inspecting = () => viewerReducer(viewerReducer(active(), {type:'INSPECT_LOUPE'}), {type:'SET_TRANSITIONING',isTransitioning:false});
describe('M17 three-state physical loupe',()=>{
  it('keeps its physical size relative to film through pickup at every zoom and viewport',()=>{
    for (const roll of [createInitialViewerState().roll,FULL_ROLL_FIXTURE]) {
      let s=createInitialViewerState('inspect',roll);
      const physicalScale=s.loupe.scale;
      for (const aspect of [1.6,820/1180,390/844]) {
        s=viewerReducer(s,{type:'VIEWPORT',aspect});
        for (const zoom of [3,1,.5,.12].map(value=>value*roll.scale)) {
          s=viewerReducer(s,{type:'SET_TABLE_ZOOM',zoom});
          const before=s.inspectZoom;
          s=viewerReducer(s,{type:'SET_LOUPE_ACTIVE',active:true});
          expect(s.loupe.scale).toBe(physicalScale);expect(s.loupe.scale/roll.scale).toBe(1);expect(s.inspectZoom).toBe(before);
          s=viewerReducer(s,{type:'SET_LOUPE_ACTIVE',active:false});
          expect(s.loupe.scale).toBe(physicalScale);
        }
      }
    }
  });
  it('starts parked, activates within the current view and preserves the table framing',()=>{
    let s=createInitialViewerState('inspect',FULL_ROLL_FIXTURE);
    expect(s.loupe.isActive).toBe(false);expect(s.loupe.inspecting).toBe(false);expect(s.loupe.magnification).toBe(4);
    s=viewerReducer(s,{type:'OPEN_FRAME',frameIndex:28});s=viewerReducer(s,{type:'SET_TRANSITIONING',isTransitioning:false});
    const before={zoom:s.inspectZoom,pan:s.inspectPan};
    s=viewerReducer(s,{type:'SET_LOUPE_ACTIVE',active:true});
    const center=locateFrame(s.roll,28);expect(s.loupe.worldX).toBeCloseTo(center.x);expect(s.loupe.worldY).toBeCloseTo(center.y);
    expect({zoom:s.inspectZoom,pan:s.inspectPan}).toEqual(before);
  });
  it('cannot inspect a parked loupe; reverses an approach and returns to active before parking',()=>{
    const parked=createInitialViewerState();expect(viewerReducer(parked,{type:'INSPECT_LOUPE'})).toBe(parked);
    let s=viewerReducer(active(),{type:'INSPECT_LOUPE'});expect(s.loupe.inspecting).toBe(true);
    s=viewerReducer(s,{type:'ESCAPE_INSPECTION'});expect(s.loupe.inspecting).toBe(false);expect(s.loupe.isActive).toBe(true);
    s=viewerReducer(s,{type:'SET_TRANSITIONING',isTransitioning:false});
    s=viewerReducer(s,{type:'ESCAPE_INSPECTION'});expect(s.loupe.isActive).toBe(false);expect(s.roomMode).toBe('inspect');
  });
  it('locks every camera zoom entry point and keeps movement and optical power available',()=>{
    const s=inspecting();
    const actions:ViewerAction[]=[{type:'ZOOM_AT',delta:-1,x:0,z:0},{type:'SET_TABLE_ZOOM',zoom:.01},{type:'ADJUST_TABLE_ZOOM',delta:1},{type:'TOUCH_VIEW',zoom:.01,x:1,z:1},{type:'FIT_VIEW'},{type:'RESET_TABLE_VIEW'},{type:'OPEN_FRAME',frameIndex:3}];
    actions.forEach(a=>expect(viewerReducer(s,a)).toBe(s));
    const moved=viewerReducer(s,{type:'MOVE_LOUPE',dx:.07,dy:.03});
    expect(moved.loupe.worldX).toBeCloseTo(s.loupe.worldX+.07);expect(moved.loupe.worldY).toBeCloseTo(s.loupe.worldY+.03);
    expect(moved.inspectPan).toEqual(s.inspectPan);expect(moved.inspectZoom).toBe(s.inspectZoom);
    const power=viewerReducer(moved,{type:'SET_LOUPE_MAGNIFICATION',magnification:8});expect(power.loupe.magnification).toBe(8);
    expect(loupeInspectionView(power.loupe.worldX,power.loupe.worldY,power.loupe.scale,power.viewportAspect)).toEqual(loupeInspectionView(moved.loupe.worldX,moved.loupe.worldY,moved.loupe.scale,moved.viewportAspect));
  });
  it('moves over bare table without snapping onto film and preserves position on pull back',()=>{
    let s=viewerReducer(inspecting(),{type:'SET_LOUPE_POSITION',x:.2,y:.55});expect(s.loupe.isOverFrame).toBe(false);
    const position={x:s.loupe.worldX,y:s.loupe.worldY};
    s=viewerReducer(s,{type:'PULL_BACK_LOUPE'});s=viewerReducer(s,{type:'SET_TRANSITIONING',isTransitioning:false});s=viewerReducer(s,{type:'CAMERA_MOTION',moving:false});
    expect({x:s.loupe.worldX,y:s.loupe.worldY}).toEqual(position);
  });
  it('keeps effects and power through all three states and a roll change',()=>{
    let s=viewerReducer(inspecting(),{type:'SET_LOUPE_EFFECTS',enabled:false});s=viewerReducer(s,{type:'SET_LOUPE_MAGNIFICATION',magnification:8});
    s=viewerReducer(s,{type:'PULL_BACK_LOUPE'});s=viewerReducer(s,{type:'SET_TRANSITIONING',isTransitioning:false});s=viewerReducer(s,{type:'SET_LOUPE_ACTIVE',active:false});
    s=viewerReducer(s,{type:'LOAD_ROLL',roll:FULL_ROLL_FIXTURE});
    expect(s.loupe.opticalEffects).toBe(false);expect(s.loupe.magnification).toBe(8);expect(s.loupe.inspecting).toBe(false);
  });
  it('adapts the eye distance to portrait, landscape and loupe scale without changing the sampled location',()=>{
    const desktop=loupeInspectionView(.2,.3,1,1.6),phone=loupeInspectionView(.2,.3,1,.46),small=loupeInspectionView(.2,.3,.2,1.6);
    expect(phone.zoom).toBeGreaterThan(desktop.zoom);expect(phone.pan).toEqual(desktop.pan);expect(small.zoom).toBeCloseTo(desktop.zoom*.2);
  });
});
