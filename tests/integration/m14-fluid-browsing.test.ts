import { describe,it,expect } from 'vitest';
import { createInitialViewerState,viewerReducer } from '../../src/state/viewerState';
import { FULL_ROLL_FIXTURE } from '../../src/utils/rollLayout';
import { InspectionMotion } from '../../src/utils/inspectionMotion';
import { detailEdge,TEXTURE_BUDGET } from '../../src/utils/useRollTextures';
import { photoCropScale, photoSourceDemand } from '../../src/utils/photoFraming';
describe('M14 responsive navigation and bounded detail',()=>{
  it('retargets repeated input against the latest destination while guarding room journeys',()=>{
    let s=createInitialViewerState('inspect',FULL_ROLL_FIXTURE);s=viewerReducer(s,{type:'OPEN_FRAME',frameIndex:5});
    for(let i=0;i<3;i++)s=viewerReducer(s,{type:'NAVIGATE',direction:'right'});
    expect(s.activeFrameIndex).toBe(8);expect(s.settledFrameIndex).toBe(0);expect(s.transitionKind).toBe('inspection');
    s=viewerReducer(s,{type:'OPEN_FRAME',frameIndex:35});s=viewerReducer(s,{type:'NAVIGATE',direction:'right'});expect(s.activeFrameIndex).toBe(35);
    s=viewerReducer(s,{type:'SET_TRANSITIONING',isTransitioning:false});expect(s.settledFrameIndex).toBe(35);
    s=viewerReducer(s,{type:'RETURN_TO_ROOM'});expect(viewerReducer(s,{type:'OPEN_FRAME',frameIndex:1})).toBe(s);
  });
  it('M16 focus changes framing, then restores the overview and optical settings',()=>{const s=createInitialViewerState('inspect',FULL_ROLL_FIXTURE);const focus=viewerReducer(s,{type:'TOGGLE_FOCUS'});expect(focus.inspectZoom).toBeLessThan(s.inspectZoom);expect(focus.focusMode).toBe(true);const restored=viewerReducer(viewerReducer(focus,{type:'TOGGLE_FOCUS'}),{type:'SET_TRANSITIONING',isTransitioning:false});expect(restored).toEqual(s);});
  it('retargets with continuous position and velocity, settles within a bounded duration',()=>{
    const m=new InspectionMotion([0,.5,0]);m.retarget([1,.5,.2],1);m.step(.2);const p=[...m.position],v=[...m.velocity];m.retarget([-1,.5,-1],4);expect(m.position).toEqual(p);expect(m.velocity).toEqual(v);m.step(0);expect(m.position).toEqual(p);m.velocity.forEach((x,i)=>expect(x).toBeCloseTo(v[i],12));m.step(.85);expect(m.position[0]).toBe(-1);expect(m.position[1]).toBeCloseTo(.5);expect(m.position[2]).toBe(-1);expect(m.done).toBe(true);expect(m.velocity.every(x=>Math.abs(x)<1e-10)).toBe(true);
  });
  it('does not pull back for adjacent steps and uses limited lift for distant travel',()=>{const m=new InspectionMotion([0,.5,0]);m.retarget([1,.5,0],0);m.step(.2);expect(m.position[1]).toBe(.5);m.step(.2);m.retarget([-1,.5,1],3);m.step(.425);expect(m.position[1]).toBeGreaterThan(.5);expect(m.position[1]).toBeLessThanOrEqual(.95);});
  it('caps detail by source, renderer and a 4096 edge under a declared memory budget',()=>{expect(detailEdge(1600,1000,8000,16384)).toBe(0);expect(detailEdge(6000,4000,3500,8192)).toBe(4096);expect(detailEdge(6000,4000,8000,2048)).toBe(2048);expect(detailEdge(3000,2000,8000,8192)).toBe(3000);expect(4096*4096*4).toBeLessThan(TEXTURE_BUDGET);});
  it('detail demand accounts for pixels excluded by oriented cropping',()=>{expect(photoSourceDemand(500,3,1)).toBe(1500);expect(photoSourceDemand(500,3,1,90)).toBe(1500);expect(photoSourceDemand(500,1.5,1.5)).toBe(500);});
  it('oriented crop exposes the precise retained gate for every rotation',()=>{for(const r of [0,90,180,270]){const c=photoCropScale(3,1,r);expect(r%180?c.y:c.x).toBeCloseTo(1/3);expect(r%180?c.x:c.y).toBe(1);}});
});
