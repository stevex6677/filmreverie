import { describe, expect, it } from 'vitest';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';
import { FULL_ROLL_FIXTURE } from '../../src/utils/rollLayout';
import { LOUPE_SIZES, LOUPE_TYPES, LOUPE_SIZE_SCALE, loupeInspectionView } from '../../src/utils/loupeView';

describe('Loupe styles and physical sizes', () => {
  it('changes size independently of optical power, placement and table framing in every loupe state', () => {
    for (const inspecting of [false, true]) {
      let state = viewerReducer(createInitialViewerState(), { type: 'SET_LOUPE_ACTIVE', active: true });
      if (inspecting) state = viewerReducer(state, { type: 'INSPECT_LOUPE' });
      const original = state;
      for (const loupeType of LOUPE_TYPES) for (const size of LOUPE_SIZES) {
        state = viewerReducer(state, { type: 'SET_LOUPE_TYPE', loupeType });
        state = viewerReducer(state, { type: 'SET_LOUPE_SIZE', size });
        expect(state.loupe.scale).toBe(state.roll.scale * LOUPE_SIZE_SCALE[size]);
        expect(state.loupe).toMatchObject({ type: loupeType, size, inspecting, isActive: true, magnification: original.loupe.magnification, worldX: original.loupe.worldX, worldY: original.loupe.worldY });
        expect(state.inspectPan).toEqual(original.inspectPan);
        expect(state.inspectZoom).toBe(original.inspectZoom);
      }
    }
  });

  it('retains the selected style and size when changing to a differently scaled roll', () => {
    let state = viewerReducer(createInitialViewerState(), { type: 'SET_LOUPE_TYPE', loupeType: 'glass' });
    state = viewerReducer(state, { type: 'SET_LOUPE_SIZE', size: 'large' });
    const roll = { ...FULL_ROLL_FIXTURE, scale: FULL_ROLL_FIXTURE.scale * .7 };
    state = viewerReducer(state, { type: 'LOAD_ROLL', roll });
    expect(state.loupe).toMatchObject({ type: 'glass', size: 'large', scale: roll.scale * LOUPE_SIZE_SCALE.large });
    const scale = state.loupe.scale;
    state = viewerReducer(state, { type: 'SET_LOUPE_ACTIVE', active: true });
    state = viewerReducer(state, { type: 'SET_LOUPE_ACTIVE', active: false });
    expect(state.loupe.scale).toBe(scale);
  });

  it('frames each curved or flat lens at each size without changing its sampled center', () => {
    for (const type of LOUPE_TYPES) for (const aspect of [.46, 1.6]) {
      const baseline = loupeInspectionView(.1, .2, 1, aspect, type);
      for (const size of LOUPE_SIZES) {
        const view = loupeInspectionView(.1, .2, LOUPE_SIZE_SCALE[size], aspect, type);
        expect(view.pan).toEqual(baseline.pan);
        const base = type === 'glass' ? .008 : 0;
        expect(view.zoom).toBeCloseTo(base + (baseline.zoom - base) * LOUPE_SIZE_SCALE[size]);
      }
    }
  });
});
