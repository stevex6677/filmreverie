import { describe, expect, it } from "vitest";
import { BASELINE_ROLL, FULL_ROLL_FIXTURE as roll, createRollLayout, locateFrame, mapRollPoint, fitRollView, anchoredZoom, validateRoll } from "../../src/utils/rollLayout";
import { createInitialViewerState, viewerReducer, ViewerAction, ViewerState } from "../../src/state/viewerState";
import { uniqueRollSources, prioritizedSources } from "../../src/utils/useRollTextures";
import { getStripDimensions } from "../../src/utils/loupeMapping";
import { createFilmRebateCanvas } from "../../src/utils/filmRebateCanvas";
import { getFilmStock } from "../../src/data/filmStocks";
import { createCanvas } from "@napi-rs/canvas";

const initial = () => createInitialViewerState("inspect", roll);
function act(state: ViewerState, action: ViewerAction) {
  return viewerReducer(viewerReducer(state, action), { type: "SET_TRANSITIONING", isTransitioning: false });
}
describe("M11 full-roll layout and navigation", () => {
  it("validates real manifests and prioritizes the selected source without duplicate requests", () => {
    expect(validateRoll({ ...roll, frames: [] })).toContain("Add photographs");
    expect(validateRoll(roll)).toBeNull();
    expect(prioritizedSources(roll, 28)[0]).toBe(roll.frames[28].src);
    expect(prioritizedSources(roll, 28)).toHaveLength(5);
  });
  it("retains five original photos and makes 36 explicitly identified slots with five source resources", () => {
    expect(BASELINE_ROLL.frames).toHaveLength(5);
    expect(roll.fixture).toBe(true);
    expect(new Set(roll.frames.map(f => f.id)).size).toBe(36);
    expect(uniqueRollSources(roll)).toHaveLength(5);
    const strips = createRollLayout(roll);
    expect(strips).toHaveLength(6);
    expect(strips.every(s => s.frames.length === 6)).toBe(true);
    expect(strips[0].y - strips[1].y).toBeGreaterThan(getStripDimensions(strips[0].layout).height * roll.scale);
  });
  it.each([0, 5, 6, 29, 30, 35])("maps global frame %i through its strip transform and loupe UV", index => {
    const f = locateFrame(roll, index);
    expect(f.localIndex).toBe(index % 6);
    expect(f.strip.index).toBe(Math.floor(index / 6));
    const mapped = mapRollPoint(roll, { x: f.x + f.strip.layout.frameWidth * roll.scale * .2, y: f.y - f.strip.layout.frameHeight * roll.scale * .1 });
    expect(mapped.frameIndex).toBe(index);
    expect(mapped.clampedU).toBeCloseTo(.7);
    expect(mapped.clampedV).toBeCloseTo(.4);
    expect(mapped.isWithinFrame).toBe(true);
  });
  it("distinguishes gaps and table from photographic regions", () => {
    expect(mapRollPoint(roll, { x: 0, y: 0 }).isWithinFrame).toBe(false);
    expect(mapRollPoint(roll, { x: 1.5, y: .5 }).isWithinStrip).toBe(false);
  });
  it("steps across 06→07 and 30→31 and clamps first/last frame", () => {
    for (const index of [5, 29]) {
      let state = act(initial(), { type: "OPEN_FRAME", frameIndex: index });
      state = act(state, { type: "NAVIGATE", direction: "right" });
      expect(state.activeFrameIndex).toBe(index + 1);
      expect(state.inspectPan.z).toBeCloseTo(-.1 - locateFrame(roll, index + 1).y);
    }
    expect(act(act(initial(), { type: "OPEN_FRAME", frameIndex: 35 }), { type: "NAVIGATE", direction: "right" }).activeFrameIndex).toBe(35);
    expect(act(act(initial(), { type: "OPEN_FRAME", frameIndex: 0 }), { type: "NAVIGATE", direction: "left" }).activeFrameIndex).toBe(0);
  });
  it("M16 restores overview pose, retains the viewed selection and exits directly without a strip mode", () => {
    let state = act(initial(), { type: "SELECT_FRAME", frameIndex: 13 });
    state = act(state, { type: "ZOOM_AT", delta: -.1, x: .2, z: .3 });
    const overview = state;
    state = act(state, { type: "OPEN_FRAME", frameIndex: 28 });
    expect(state.inspectionLevel).toBe("frame");
    state = act(state, { type: "ESCAPE_INSPECTION" });
    expect(state.inspectionLevel).toBe("roll");
    expect(state.activeFrameIndex).toBe(28);
    expect(state.inspectZoom).toBe(overview.inspectZoom);
    expect(state.inspectPan).toEqual(overview.inspectPan);
    expect(act(state, { type: "ESCAPE_INSPECTION" }).roomMode).toBe("room");
    expect(act(act(initial(), { type: "OPEN_FRAME", frameIndex: 30 }), { type: "RETURN_TO_ROOM" }).roomMode).toBe("room");
  });
  it("M16 keeps grid arrows when legacy strip framing is normalized to Overview", () => {
    let state = act(initial(), { type: "SELECT_FRAME", frameIndex: 5 });
    expect(act(state, { type: "NAVIGATE", direction: "right" }).activeFrameIndex).toBe(5);
    state = act(state, { type: "NAVIGATE", direction: "down" });
    expect(state.activeFrameIndex).toBe(11);
    state = act(state, { type: "VIEW_LEVEL", level: "strip", stripIndex: 4 });
    expect(state.inspectionLevel).toBe('roll');
    expect(act(state, { type: "NAVIGATE", direction: "right" }).activeFrameIndex).toBe(25);
  });
  it("keeps the selected column when grid arrows reach the first or last row", () => {
    for (const index of [0, 2, 5]) {
      const state = act(initial(), { type: "SELECT_FRAME", frameIndex: index });
      expect(act(state, { type: "NAVIGATE", direction: "up" }).activeFrameIndex).toBe(index);
    }
    for (const index of [30, 32, 35]) {
      const state = act(initial(), { type: "SELECT_FRAME", frameIndex: index });
      expect(act(state, { type: "NAVIGATE", direction: "down" }).activeFrameIndex).toBe(index);
    }
  });
  it("fits each view to the viewport and anchors zoom at the pointer", () => {
    for (const aspect of [1, 1.5, 2.2]) {
      const fit = fitRollView(roll, "roll", 0, aspect);
      const visibleHeight = 2 * fit.zoom * Math.tan(Math.PI / 8);
      const strips = createRollLayout(roll);
      expect(visibleHeight).toBeGreaterThan(strips[0].y - strips[5].y + getStripDimensions(strips[0].layout).height * roll.scale);
      expect(visibleHeight * aspect).toBeGreaterThan(getStripDimensions(strips[0].layout).width * roll.scale);
    }
    const anchor = { x: .3, z: -.4 }, pan = { x: 0, z: -.1 };
    const next = anchoredZoom(2, 1, pan, anchor);
    expect((anchor.x - next.x) / 1).toBeCloseTo((anchor.x - pan.x) / 2);
    expect((anchor.z - next.z) / 1).toBeCloseTo((anchor.z - pan.z) / 2);
  });
  it("preserves roll controls and loupe selection during free zoom and navigation", () => {
    let state = act(initial(), { type: "SET_TABLE_BRIGHTNESS", brightness: .3 });
    state = act(state, { type: "SET_FILM_STOCK", stockId: "ektachrome-e100" });
    state = act(state, { type: "SET_LOUPE_MAGNIFICATION", magnification: 8 });
    state = act(state, { type: "SET_LOUPE_ACTIVE", active: true });
    state = act(state, { type: "OPEN_FRAME", frameIndex: 30 });
    state = act(state, { type: "SET_LOUPE_POSITION", x: locateFrame(roll, 5).x, y: locateFrame(roll, 5).y });
    expect(state.activeFrameIndex).toBe(30);
    expect(state.loupe.frameIndex).toBe(5);
    expect(state.tableBrightness).toBe(.3);
    expect(state.filmMode).toBe("positive");
    expect(state.loupe.magnification).toBe(8);
    expect(state.loupe.isActive).toBe(false); // M16 starts Focus with the loupe resting.
    expect(act(state, { type: "ADJUST_TABLE_ZOOM", delta: -.1 }).inspectionLevel).toBe("frame");
  });
  it("keeps failed frame slots navigable and retries without renumbering", () => {
    let state = act(initial(), { type: "ASSET_STATUS", failures: [roll.frames[0].src], loading: false });
    state = act(state, { type: "OPEN_FRAME", frameIndex: 35 });
    expect(state.activeFrameIndex).toBe(35);
    expect(state.assetFailures).toHaveLength(1);
    expect(act(state, { type: "RETRY_ASSETS" }).assetRetry).toBe(1);
  });
  it("leaves every exposure transparent in rebate artwork with continuous edge numbers", () => {
    for (const strip of createRollLayout(roll)) {
      const canvas = createFilmRebateCanvas(getFilmStock("portra-400"), strip.layout, 3072, 468, () => createCanvas(1, 1) as unknown as HTMLCanvasElement);
      const ctx = canvas.getContext("2d")!;
      expect(ctx.getImageData(240, 234, 1, 1).data[3]).toBe(0);
      expect(strip.layout.frameNumberOffset).toBe(strip.index * 6);
    }
  });
});
