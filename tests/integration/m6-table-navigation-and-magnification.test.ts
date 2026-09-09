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
  MIN_TABLE_PAN_X,
  MAX_TABLE_PAN_X,
  MIN_TABLE_PAN_Z,
  MAX_TABLE_PAN_Z,
  TABLE_CENTER_Z,
  clampInspectZoom,
  clampInspectPan,
} from "../../src/utils/cameraBounds";

describe("M6 Integration — Table Inspection Navigation & Loupe Magnification", () => {
  describe("Initial State & Defaults", () => {
    it("initializes with default table zoom, centered pan, and 2.5x loupe magnification", () => {
      expect(INITIAL_VIEWER_STATE.inspectZoom).toBe(DEFAULT_INSPECT_DISTANCE);
      expect(INITIAL_VIEWER_STATE.inspectPan).toEqual({ x: 0, z: TABLE_CENTER_Z });
      expect(INITIAL_VIEWER_STATE.loupe.magnification).toBe(2.5);
    });

    it("createInitialViewerState initializes clean navigation state in both room and inspect modes", () => {
      const inspectState = createInitialViewerState("inspect");
      expect(inspectState.roomMode).toBe("inspect");
      expect(inspectState.inspectZoom).toBe(DEFAULT_INSPECT_DISTANCE);
      expect(inspectState.inspectPan).toEqual({ x: 0, z: TABLE_CENTER_Z });

      const roomState = createInitialViewerState("room");
      expect(roomState.roomMode).toBe("room");
      expect(roomState.inspectZoom).toBe(DEFAULT_INSPECT_DISTANCE);
      expect(roomState.inspectPan).toEqual({ x: 0, z: TABLE_CENTER_Z });
    });
  });

  describe("Table Scroll Zoom", () => {
    it("adjusts inspect zoom distance within bounds", () => {
      let state = INITIAL_VIEWER_STATE;

      // Zoom in (decrease distance towards table surface)
      state = viewerReducer(state, { type: "ADJUST_TABLE_ZOOM", delta: -0.5 });
      expect(state.inspectZoom).toBeCloseTo(DEFAULT_INSPECT_DISTANCE - 0.5, 3);

      // Zoom out (increase distance away from table surface)
      state = viewerReducer(state, { type: "ADJUST_TABLE_ZOOM", delta: 0.8 });
      expect(state.inspectZoom).toBeCloseTo(DEFAULT_INSPECT_DISTANCE - 0.5 + 0.8, 3);
    });

    it("clamps zoom to MIN_INSPECT_DISTANCE (0.8m close-up)", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 0.1 });
      expect(state.inspectZoom).toBe(MIN_INSPECT_DISTANCE);

      state = viewerReducer(state, { type: "ADJUST_TABLE_ZOOM", delta: -10 });
      expect(state.inspectZoom).toBe(MIN_INSPECT_DISTANCE);
    });

    it("clamps zoom to MAX_INSPECT_DISTANCE (3.6m overview)", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 10.0 });
      expect(state.inspectZoom).toBe(MAX_INSPECT_DISTANCE);

      state = viewerReducer(state, { type: "ADJUST_TABLE_ZOOM", delta: 5.0 });
      expect(state.inspectZoom).toBe(MAX_INSPECT_DISTANCE);
    });

    it("clampInspectZoom helper behaves deterministically", () => {
      expect(clampInspectZoom(0.2)).toBe(MIN_INSPECT_DISTANCE);
      expect(clampInspectZoom(5.0)).toBe(MAX_INSPECT_DISTANCE);
      expect(clampInspectZoom(2.0)).toBe(2.0);
    });
  });

  describe("Table Pan / Move View", () => {
    it("sets and adjusts table pan across horizontal and depth axes", () => {
      let state = INITIAL_VIEWER_STATE;

      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: 0.5, z: TABLE_CENTER_Z + 0.1 });
      expect(state.inspectPan.x).toBeCloseTo(0.5, 4);
      expect(state.inspectPan.z).toBeCloseTo(TABLE_CENTER_Z + 0.1, 4);

      state = viewerReducer(state, { type: "ADJUST_TABLE_PAN", dx: -0.2, dz: 0.05 });
      expect(state.inspectPan.x).toBeCloseTo(0.3, 4);
      expect(state.inspectPan.z).toBeCloseTo(TABLE_CENTER_Z + 0.15, 4);
    });

    it("clamps horizontal pan to inspect bounds across all 5 photo frames", () => {
      let state = INITIAL_VIEWER_STATE;

      // Pan far left beyond Harbor frame
      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: -5.0, z: TABLE_CENTER_Z });
      expect(state.inspectPan.x).toBe(MIN_TABLE_PAN_X);

      // Pan far right beyond Road frame
      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: 5.0, z: TABLE_CENTER_Z });
      expect(state.inspectPan.x).toBe(MAX_TABLE_PAN_X);
    });

    it("clamps depth pan to table depth bounds", () => {
      let state = INITIAL_VIEWER_STATE;

      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: 0, z: -10.0 });
      expect(state.inspectPan.z).toBe(MIN_TABLE_PAN_Z);

      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: 0, z: 10.0 });
      expect(state.inspectPan.z).toBe(MAX_TABLE_PAN_Z);
    });

    it("clampInspectPan helper clamps correctly", () => {
      const clamped = clampInspectPan(-10, 10);
      expect(clamped.x).toBe(MIN_TABLE_PAN_X);
      expect(clamped.z).toBe(MAX_TABLE_PAN_Z);
    });
  });

  describe("Reset Table View", () => {
    it("resets modified zoom and pan back to default overview", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 1.2 });
      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: -0.8, z: TABLE_CENTER_Z + 0.2 });

      expect(state.inspectZoom).not.toBe(DEFAULT_INSPECT_DISTANCE);
      expect(state.inspectPan.x).not.toBe(0);

      state = viewerReducer(state, { type: "RESET_TABLE_VIEW" });
      expect(state.inspectZoom).toBe(DEFAULT_INSPECT_DISTANCE);
      expect(state.inspectPan).toEqual({ x: 0, z: TABLE_CENTER_Z });
    });
  });

  describe("Configurable Loupe Magnification", () => {
    it("sets loupe magnification presets (2x, 4x, 8x)", () => {
      let state = INITIAL_VIEWER_STATE;

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 2.0 });
      expect(state.loupe.magnification).toBe(2.0);

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 4.0 });
      expect(state.loupe.magnification).toBe(4.0);

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 8.0 });
      expect(state.loupe.magnification).toBe(8.0);
    });

    it("adjusts magnification incrementally with delta", () => {
      let state = INITIAL_VIEWER_STATE;
      expect(state.loupe.magnification).toBe(2.5);

      state = viewerReducer(state, { type: "ADJUST_LOUPE_MAGNIFICATION", delta: 1.0 });
      expect(state.loupe.magnification).toBe(3.5);

      state = viewerReducer(state, { type: "ADJUST_LOUPE_MAGNIFICATION", delta: -1.0 });
      expect(state.loupe.magnification).toBe(2.5);
    });

    it("clamps magnification between 1.5x and 10x bounds", () => {
      let state = INITIAL_VIEWER_STATE;

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 0.5 });
      expect(state.loupe.magnification).toBe(1.5);

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 25.0 });
      expect(state.loupe.magnification).toBe(10.0);
    });
  });

  describe("Mode Switching & Preservation", () => {
    it("returning to room mode automatically resets inspect zoom and pan for next approach", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 1.1 });
      state = viewerReducer(state, { type: "SET_TABLE_PAN", x: 0.7, z: TABLE_CENTER_Z });

      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      expect(state.roomMode).toBe("room");
      expect(state.inspectZoom).toBe(DEFAULT_INSPECT_DISTANCE);
      expect(state.inspectPan).toEqual({ x: 0, z: TABLE_CENTER_Z });
      expect(state.loupe.isActive).toBe(false);
    });

    it("RESET action restores complete pristine state", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_TABLE_ZOOM", zoom: 1.4 });
      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 8.0 });

      state = viewerReducer(state, { type: "RESET" });
      expect(state.inspectZoom).toBe(DEFAULT_INSPECT_DISTANCE);
      expect(state.loupe.magnification).toBe(2.5);
    });
  });
});
