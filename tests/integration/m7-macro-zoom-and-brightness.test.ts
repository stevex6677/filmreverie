import { describe, it, expect } from "vitest";
import {
  INITIAL_VIEWER_STATE,
  viewerReducer,
  createInitialViewerState,
} from "../../src/state/viewerState";
import {
  DEFAULT_INSPECT_DISTANCE,
  MIN_INSPECT_DISTANCE,
  MAX_INSPECT_DISTANCE,
  MIN_TABLE_BRIGHTNESS,
  MAX_TABLE_BRIGHTNESS,
  DEFAULT_TABLE_BRIGHTNESS,
  clampInspectZoom,
  clampTableBrightness,
  TABLE_CENTER_Z,
} from "../../src/utils/cameraBounds";

describe("M7 Integration — Deep Macro Zoom (1000%) & Light Table Dimmer Calibration", () => {
  describe("Macro Zoom Bounds & 1000% Magnification", () => {
    it("defines MIN_INSPECT_DISTANCE as 0.32m corresponding to 1000% zoom", () => {
      expect(MIN_INSPECT_DISTANCE).toBe(0.32);
      expect(DEFAULT_INSPECT_DISTANCE).toBe(3.2);

      const maxZoomPercent = Math.round((DEFAULT_INSPECT_DISTANCE / MIN_INSPECT_DISTANCE) * 100);
      expect(maxZoomPercent).toBe(1000);
    });

    it("clamps table zoom distance between 0.32m (1000%) and 3.60m (~89%)", () => {
      expect(clampInspectZoom(0.1)).toBe(0.32);
      expect(clampInspectZoom(0.32)).toBe(0.32);
      expect(clampInspectZoom(1.6)).toBe(1.6);
      expect(clampInspectZoom(3.2)).toBe(3.2);
      expect(clampInspectZoom(3.6)).toBe(3.6);
      expect(clampInspectZoom(10.0)).toBe(3.6);
    });

    it("dispatches SET_TABLE_ZOOM to reach exact 1000% close-up", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: MIN_INSPECT_DISTANCE });
      expect(state.inspectZoom).toBe(0.32);

      const zoomPercent = Math.round((DEFAULT_INSPECT_DISTANCE / state.inspectZoom) * 100);
      expect(zoomPercent).toBe(1000);
    });

    it("clamps ADJUST_TABLE_ZOOM so zoom cannot exceed 1000% or recede past 3.6m", () => {
      let state = INITIAL_VIEWER_STATE;

      // Aggressive zoom-in
      state = viewerReducer(state, { type: "ADJUST_TABLE_ZOOM", delta: -50.0 });
      expect(state.inspectZoom).toBe(MIN_INSPECT_DISTANCE);

      // Aggressive zoom-out
      state = viewerReducer(state, { type: "ADJUST_TABLE_ZOOM", delta: 100.0 });
      expect(state.inspectZoom).toBe(MAX_INSPECT_DISTANCE);
    });
  });

  describe("Light Table Brightness Dimmer State & Calibration", () => {
    it("initializes with default calibrated light table brightness (1.0 = 100%)", () => {
      expect(INITIAL_VIEWER_STATE.tableBrightness).toBe(DEFAULT_TABLE_BRIGHTNESS);
      expect(INITIAL_VIEWER_STATE.tableBrightness).toBe(1.0);

      const inspectState = createInitialViewerState("inspect");
      expect(inspectState.tableBrightness).toBe(1.0);

      const roomState = createInitialViewerState("room");
      expect(roomState.tableBrightness).toBe(1.0);
    });

    it("clamps brightness values strictly between MIN (0.2) and MAX (2.0)", () => {
      expect(clampTableBrightness(0.0)).toBe(MIN_TABLE_BRIGHTNESS);
      expect(clampTableBrightness(0.15)).toBe(0.2);
      expect(clampTableBrightness(0.5)).toBe(0.5);
      expect(clampTableBrightness(1.0)).toBe(1.0);
      expect(clampTableBrightness(1.5)).toBe(1.5);
      expect(clampTableBrightness(2.0)).toBe(2.0);
      expect(clampTableBrightness(3.5)).toBe(MAX_TABLE_BRIGHTNESS);
    });

    it("supports SET_TABLE_BRIGHTNESS for preset dimmer steps (50%, 100%, 150%)", () => {
      let state = INITIAL_VIEWER_STATE;

      // Dim to 50%
      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 0.5 });
      expect(state.tableBrightness).toBe(0.5);

      // Boost to 150%
      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 1.5 });
      expect(state.tableBrightness).toBe(1.5);

      // Reset to 100%
      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 1.0 });
      expect(state.tableBrightness).toBe(1.0);
    });

    it("supports ADJUST_TABLE_BRIGHTNESS with incremental adjustment and bounding", () => {
      let state = INITIAL_VIEWER_STATE;

      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: -0.2 });
      expect(state.tableBrightness).toBeCloseTo(0.8, 4);

      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: 0.4 });
      expect(state.tableBrightness).toBeCloseTo(1.2, 4);

      // Extreme adjustments clamp properly
      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: -10.0 });
      expect(state.tableBrightness).toBe(MIN_TABLE_BRIGHTNESS);

      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: 10.0 });
      expect(state.tableBrightness).toBe(MAX_TABLE_BRIGHTNESS);
    });
  });

  describe("Lifecycle & Reset Interactions", () => {
    it("RESET_TABLE_VIEW restores 100% zoom and center pan without resetting dimmer calibration", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 0.32 }); // 1000%
      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: 0.8, z: TABLE_CENTER_Z - 0.1 });
      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 1.5 }); // 150%

      expect(state.inspectZoom).toBe(0.32);
      expect(state.tableBrightness).toBe(1.5);

      state = viewerReducer(state, { type: "RESET_TABLE_VIEW" });
      expect(state.inspectZoom).toBe(DEFAULT_INSPECT_DISTANCE);
      expect(state.inspectPan).toEqual({ x: 0, z: TABLE_CENTER_Z });
      // User's preferred dimmer brightness remains calibrated at 150%
      expect(state.tableBrightness).toBe(1.5);
    });

    it("preserves zoom, pan, and dimmer settings across mode transitions", () => {
      let state = createInitialViewerState("inspect");
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 0.4 });
      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 0.5 });

      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      expect(state.roomMode).toBe("room");
      expect(state.tableBrightness).toBe(0.5);

      // Transition completes
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });

      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      expect(state.roomMode).toBe("inspect");
      expect(state.tableBrightness).toBe(0.5);
    });
  });
});
