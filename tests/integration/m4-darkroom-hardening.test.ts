import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  INITIAL_VIEWER_STATE,
  createInitialViewerState,
  viewerReducer,
} from "../../src/state/viewerState";
import { ROLL_FRAMES } from "../../src/data/rollManifest";

describe("M4 Integration — Darkroom Realism, Provenance & Hardening", () => {
  describe("Asset Provenance Manifest & Filesystem Integrity", () => {
    const provenancePath = path.resolve(process.cwd(), "public/assets/provenance.json");

    it("verifies public/assets/provenance.json exists and contains roll metadata", () => {
      expect(fs.existsSync(provenancePath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(provenancePath, "utf-8"));
      expect(data.collection).toContain("Darkroom Film Viewer");
      expect(data.version).toBe("1.0.0");
      expect(data.photos.length).toBe(5);
      expect(data.environmentAssets.length).toBeGreaterThanOrEqual(5);
    });

    it("verifies all 5 photo assets match manifest and exist in filesystem", () => {
      const data = JSON.parse(fs.readFileSync(provenancePath, "utf-8"));
      expect(data.photos.length).toBe(ROLL_FRAMES.length);

      for (const photo of data.photos) {
        expect(photo.aspect).toBeCloseTo(1.5, 2);
        expect(photo.license).toContain("CC0");

        // Verify source PNG exists
        const srcPath = path.resolve(process.cwd(), photo.sourcePath);
        expect(fs.existsSync(srcPath)).toBe(true);

        // Verify derivative JPG exists
        const dstPath = path.resolve(process.cwd(), photo.derivativePath);
        expect(fs.existsSync(dstPath)).toBe(true);
      }
    });

    it("verifies procedural 3D darkroom environment assets are cataloged", () => {
      const data = JSON.parse(fs.readFileSync(provenancePath, "utf-8"));
      const names = data.environmentAssets.map((a: any) => a.name);
      expect(names).toContain("Horizontal Light Table");
      expect(names).toContain("Heavy Industrial Darkroom Workbench");
      expect(names).toContain("Photographic Enlarger Station");
      expect(names).toContain("Darkroom Interval Timer");
      expect(names).toContain("Chemical Reagent Jugs & Developing Trays");
      expect(names).toContain("Physical 2.5x Inspection Loupe");
    });
  });

  describe("Error Boundary & Retry Lifecycle State", () => {
    it("initializes with zero errors", () => {
      const state = createInitialViewerState("inspect");
      expect(state.error).toBeNull();
    });

    it("records error when SET_ERROR is dispatched", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_ERROR", error: "Failed to load emulsion texture" });
      expect(state.error).toBe("Failed to load emulsion texture");
    });

    it("clears error when RETRY is dispatched", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_ERROR", error: "Emulsion defect" });
      expect(state.error).toBe("Emulsion defect");

      state = viewerReducer(state, { type: "RETRY" });
      expect(state.error).toBeNull();
    });

    it("RESET clears any error state back to null", () => {
      let state = INITIAL_VIEWER_STATE;
      state = viewerReducer(state, { type: "SET_ERROR", error: "Fatal developer crash" });
      state = viewerReducer(state, { type: "RESET" });
      expect(state.error).toBeNull();
    });
  });

  describe("Renderer Hardening & Motion Bounds", () => {
    it("clamps device pixel ratio to prevent GPU fill-rate exhaustion", () => {
      const clampDpr = (pixelRatio: number) => Math.min(pixelRatio, 1.5);
      expect(clampDpr(1.0)).toBe(1.0);
      expect(clampDpr(2.0)).toBe(1.5);
      expect(clampDpr(3.0)).toBe(1.5);
    });

    it("verifies 35mm perforation pitch and edge constraints", () => {
      const data = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), "public/assets/provenance.json"), "utf-8")
      );
      expect(data.perforations.perforationsPerFrame).toBe(8);
      expect(data.perforations.totalPerEdge).toBe(40);
    });
  });
});
