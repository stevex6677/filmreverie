import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createInitialViewerState, viewerReducer, ViewerState, ViewerAction } from '../../src/state/viewerState';
import { FULL_ROLL_FIXTURE } from '../../src/utils/rollLayout';
import { MAX_TABLE_TILT, MAX_TABLE_YAW, TOP_DOWN, tableInputCamera, tableCameraPose } from '../../src/utils/tableCamera';
import { TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
const act = (s: ViewerState, a: ViewerAction) => viewerReducer(viewerReducer(s, a), { type: 'SET_TRANSITIONING', isTransitioning: false });

describe('table tilt and yaw', () => {
  it('clamps the orbit and rejects non-finite input', () => {
    let s = createInitialViewerState('inspect');
    s = act(s, { type: 'ADJUST_TABLE_ANGLE', tilt: 10, yaw: -10 });
    expect(s.tableAngle).toEqual({ tilt: MAX_TABLE_TILT, yaw: -MAX_TABLE_YAW });
    expect(viewerReducer(s, { type: 'SET_TABLE_ANGLE', angle: { tilt: NaN, yaw: 0 } })).toBe(s);
    s = act(s, { type: 'ADJUST_TABLE_ANGLE', tilt: -10, yaw: 10 });
    expect(s.tableAngle).toEqual({ tilt: 0, yaw: MAX_TABLE_YAW });
  });
  it('preserves framing on Top-down and angle through focus and loupe inspection', () => {
    let s = act(createInitialViewerState('inspect', FULL_ROLL_FIXTURE), { type: 'SET_TABLE_ANGLE', angle: { tilt: .6, yaw: -.8 } });
    s = act(s, { type: 'SET_TABLE_PAN', x: .2, z: -.2 });
    const overview = s;
    s = act(s, { type: 'SET_ADJUSTING_VIEW', active: true });
    s = act(s, { type: 'OPEN_FRAME', frameIndex: 8 });
    expect(s.adjustingView).toBe(false);
    expect(viewerReducer(s, { type: 'TOP_DOWN' })).toBe(s);
    s = act(s, { type: 'SHOW_OVERVIEW' });
    expect(s.tableAngle).toEqual(overview.tableAngle);
    expect(s.inspectPan).toEqual(overview.inspectPan);
    expect(s.inspectZoom).toBe(overview.inspectZoom);
    s = act(s, { type: 'SET_LOUPE_ACTIVE', active: true });
    s = act(s, { type: 'INSPECT_LOUPE' });
    expect(viewerReducer(s, { type: 'ADJUST_TABLE_ANGLE', tilt: .1, yaw: .1 })).toBe(s);
    s = act(s, { type: 'PULL_BACK_LOUPE' });
    expect(s.tableAngle).toEqual(overview.tableAngle);
    s = act(s, { type: 'TOP_DOWN' });
    expect(s.tableAngle).toEqual(TOP_DOWN);
    expect(s.inspectPan).toEqual(overview.inspectPan);
    expect(s.inspectZoom).toBe(overview.inspectZoom);
  });
  it('Escape leaves angle mode before leaving the table', () => {
    let s = act(createInitialViewerState('inspect'), { type: 'SET_ADJUSTING_VIEW', active: true });
    s = act(s, { type: 'ESCAPE_INSPECTION' });
    expect(s.adjustingView).toBe(false);
    expect(s.roomMode).toBe('inspect');
  });
  it('keeps the pivot centered and distance constant at all supported angles, including overhead yaw', () => {
    const pan = { x: .3, z: -.2 };
    for (const tilt of [0, .000001, .4, MAX_TABLE_TILT]) for (const yaw of [-MAX_TABLE_YAW, 0, MAX_TABLE_YAW]) {
      const camera = tableInputCamera(2, pan, { tilt, yaw }, 1.5);
      const target = new THREE.Vector3(pan.x, TABLE_SURFACE_Y, pan.z);
      expect(target.distanceTo(camera.position)).toBeCloseTo(2, 12);
      const screen = target.clone().project(camera);
      expect(screen.x).toBeCloseTo(0, 12); expect(screen.y).toBeCloseTo(0, 12);
      const pose = tableCameraPose(2, pan, { tilt, yaw });
      expect(new THREE.Vector3(...pose.up).dot(camera.position.clone().sub(target))).toBeCloseTo(0, 12);
      expect(camera.position.y).toBeGreaterThan(TABLE_SURFACE_Y);
    }
  });
});
