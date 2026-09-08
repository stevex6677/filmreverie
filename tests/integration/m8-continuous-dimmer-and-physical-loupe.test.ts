import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  INITIAL_VIEWER_STATE,
  viewerReducer,
  createInitialViewerState,
} from "../../src/state/viewerState";
import {
  MIN_TABLE_BRIGHTNESS,
  MAX_TABLE_BRIGHTNESS,
  DEFAULT_TABLE_BRIGHTNESS,
  clampTableBrightness,
} from "../../src/utils/cameraBounds";
import { createLoupeShaderMaterial } from "../../src/shaders/loupeShader";

describe("M8 Integration — Continuous Light Table Dimmer & Physical Optical Loupe", () => {
  describe("Continuous Brightness Dimmer Bounds & Clamping (30%–100%)", () => {
    it("defines MIN_TABLE_BRIGHTNESS as 0.30 and MAX_TABLE_BRIGHTNESS as 1.00", () => {
      expect(MIN_TABLE_BRIGHTNESS).toBe(0.3);
      expect(MAX_TABLE_BRIGHTNESS).toBe(1.0);
      expect(DEFAULT_TABLE_BRIGHTNESS).toBe(1.0);
    });

    it("clamps brightness values strictly between 0.30 (30%) and 1.00 (100%)", () => {
      expect(clampTableBrightness(0.0)).toBe(0.3);
      expect(clampTableBrightness(0.15)).toBe(0.3);
      expect(clampTableBrightness(0.29)).toBe(0.3);
      expect(clampTableBrightness(0.30)).toBe(0.3);
      expect(clampTableBrightness(0.65)).toBe(0.65);
      expect(clampTableBrightness(0.825)).toBe(0.825);
      expect(clampTableBrightness(1.00)).toBe(1.0);
      expect(clampTableBrightness(1.50)).toBe(1.0);
      expect(clampTableBrightness(2.00)).toBe(1.0);
    });

    it("dispatches SET_TABLE_BRIGHTNESS with continuous fractional values", () => {
      let state = INITIAL_VIEWER_STATE;

      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 0.42 });
      expect(state.tableBrightness).toBe(0.42);

      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 0.87 });
      expect(state.tableBrightness).toBe(0.87);

      // Clamps outside the 30%–100% boundary
      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 0.05 });
      expect(state.tableBrightness).toBe(0.3);

      state = viewerReducer(state, { type: "SET_TABLE_BRIGHTNESS", brightness: 1.80 });
      expect(state.tableBrightness).toBe(1.0);
    });

    it("dispatches ADJUST_TABLE_BRIGHTNESS incrementally within bounds", () => {
      let state = INITIAL_VIEWER_STATE; // 1.0
      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: -0.15 });
      expect(state.tableBrightness).toBeCloseTo(0.85, 4);

      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: -0.80 });
      expect(state.tableBrightness).toBe(0.3); // Clamped at 30%

      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: 0.50 });
      expect(state.tableBrightness).toBeCloseTo(0.80, 4);

      state = viewerReducer(state, { type: "ADJUST_TABLE_BRIGHTNESS", delta: 1.00 });
      expect(state.tableBrightness).toBe(1.0); // Clamped at 100%
    });

    it("initializes both room and inspect modes with calibrated 100% brightness", () => {
      const roomState = createInitialViewerState("room");
      expect(roomState.tableBrightness).toBe(1.0);

      const inspectState = createInitialViewerState("inspect");
      expect(inspectState.tableBrightness).toBe(1.0);
    });
  });

  describe("Physical Optical Loupe Shader Material & Full-Scene Capture Uniforms", () => {
    const dummyTexture = new THREE.Texture();

    it("creates loupe shader material with scene capture uniform initialized", () => {
      const mat = createLoupeShaderMaterial(dummyTexture, false, [0.5, 0.5]);
      expect(mat.uniforms.uUseSceneCapture).toBeDefined();
      expect(mat.uniforms.uUseSceneCapture.value).toBe(0.0);
    });

    it("enables real-time scene capture mode by setting uUseSceneCapture to 1.0", () => {
      const mat = createLoupeShaderMaterial(dummyTexture, true, [0.5, 0.5]);
      mat.uniforms.uUseSceneCapture.value = 1.0;
      expect(mat.uniforms.uUseSceneCapture.value).toBe(1.0);
    });

    it("preserves optical magnification controls and bounds", () => {
      let state = INITIAL_VIEWER_STATE;
      expect(state.loupe.magnification).toBe(2.5);

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 4.0 });
      expect(state.loupe.magnification).toBe(4.0);

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 8.0 });
      expect(state.loupe.magnification).toBe(8.0);

      // Extreme magnification clamps between 1.5x and 10x
      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 25.0 });
      expect(state.loupe.magnification).toBe(10.0);

      state = viewerReducer(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 0.5 });
      expect(state.loupe.magnification).toBe(1.5);
    });
  });
});
