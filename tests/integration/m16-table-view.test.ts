import { describe,it,expect } from 'vitest';
import { createInitialViewerState, viewerReducer, ViewerState, ViewerAction } from '../../src/state/viewerState';
import { BASELINE_ROLL,FULL_ROLL_FIXTURE,focusFrameLayout,fitRollView,locateFrame } from '../../src/utils/rollLayout';
import { getStripDimensions } from '../../src/utils/loupeMapping';
import { FILM_FORMATS, FilmFormat, formatLayout } from '../../src/data/filmFormats';
const act=(state:ViewerState,action:ViewerAction)=>viewerReducer(viewerReducer(state,action),{type:'SET_TRANSITIONING',isTransitioning:false});
describe('M16 Overview and Focus',()=>{
  it.each([BASELINE_ROLL,FULL_ROLL_FIXTURE])('retains independent overview while navigating $rollId',roll=>{
    let state=act(createInitialViewerState('inspect',roll),{type:'ZOOM_AT',delta:-.1,x:.1,z:0});
    const overview={zoom:state.inspectZoom,pan:state.inspectPan};
    state=act(state,{type:'SET_TABLE_BRIGHTNESS',brightness:.6});
    state=act(state,{type:'OPEN_FRAME',frameIndex:1});
    expect(state.focusMode).toBe(true);expect(state.inspectionLevel).toBe('frame');
    state=act(state,{type:'OPEN_FRAME',frameIndex:roll.frames.length-1});
    state=act(state,{type:'TOUCH_VIEW',zoom:state.inspectZoom/3,x:100,z:100});
    expect(state.savedOverview?.pan).toEqual(overview.pan);expect(state.savedOverview?.zoom).toBe(overview.zoom);
    const selected=state.activeFrameIndex;
    state=act(state,{type:'SHOW_OVERVIEW'});
    expect(state.focusMode).toBe(false);expect(state.activeFrameIndex).toBe(selected);expect(state.inspectPan).toEqual(overview.pan);expect(state.inspectZoom).toBe(overview.zoom);expect(state.tableBrightness).toBe(.6);
    state=act(state,{type:'TOGGLE_FOCUS'});state=act(state,{type:'TOGGLE_FOCUS'});expect(state.inspectPan).toEqual(overview.pan);
  });
  it('keeps the film border inside closer default framing for all formats and orientations',()=>{
    for(const format of Object.keys(FILM_FORMATS) as FilmFormat[])for(const aspect of [.44,.56,1,1.44,2.25]){
      const roll={...BASELINE_ROLL,layout:formatLayout(format)};
      const layout=focusFrameLayout(roll,2),outer=getStripDimensions(layout),view=fitRollView(roll,'frame',2,aspect);
      const height=2*view.zoom*Math.tan(Math.PI/8),width=height*aspect;
      expect(layout.frameWidth/width).toBeLessThanOrEqual(.84);expect(outer.height/height).toBeLessThanOrEqual(.87);
      expect(layout.frameWidth/width>.83||outer.height/height>.85).toBe(true);
      expect(layout.marginX).toBeGreaterThan(0);expect(layout.marginY).toBeGreaterThan(0);expect(layout.frameNumberOffset).toBe(2);
    }
  });
  it('focus zoom and pan cannot wander into another frame',()=>{
    let s=act(createInitialViewerState('inspect',FULL_ROLL_FIXTURE),{type:'OPEN_FRAME',frameIndex:7});
    const center=locateFrame(s.roll,7),framing=s.inspectZoom;
    s=act(s,{type:'ZOOM_AT',delta:100,x:100,z:100});expect(s.inspectZoom).toBe(framing);expect(s.inspectPan.x).toBe(center.x);
    s=act(s,{type:'TOUCH_VIEW',zoom:framing/4,x:100,z:100});expect(s.activeFrameIndex).toBe(7);expect(Math.abs(s.inspectPan.x-center.x)).toBeLessThan(.2);
    s=act(s,{type:'FIT_VIEW'});expect(s.inspectZoom).toBe(framing);expect(s.inspectPan).toEqual({x:center.x,z:-.1-center.y});
  });
  it('normalizes old strip views and restores old frame views without modifying source data',()=>{
    const initial=createInitialViewerState('inspect',FULL_ROLL_FIXTURE);
    for(const level of ['strip','frame'] as const){
      const state=act(initial,{type:'LOAD_ROLL',roll:FULL_ROLL_FIXTURE,view:{frameId:FULL_ROLL_FIXTURE.frames[8].id,level,mode:'positive',brightness:.7,magnification:4,zoom:.5,pan:{x:0,z:0},overview:null}});
      expect(state.focusMode).toBe(level==='frame');expect(state.inspectionLevel).toBe(level==='frame'?'frame':'roll');expect(state.roll.frames).toBe(initial.roll.frames);expect(state.tableBrightness).toBe(.7);expect(state.filmMode).toBe('positive');
    }
  });
});
