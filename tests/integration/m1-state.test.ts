import { describe, it, expect } from "vitest";
import { INITIAL_VIEWER_STATE, viewerReducer } from "../../src/state/viewerState";

describe("M1 Integration — Viewer State Transitions", () => {
  it("starts in positive film mode with loupe resting", () => {
    expect(INITIAL_VIEWER_STATE.filmMode).toBe("positive");
    expect(INITIAL_VIEWER_STATE.loupe.isActive).toBe(false);
    expect(INITIAL_VIEWER_STATE.activeFrameIndex).toBe(0);
    expect(INITIAL_VIEWER_STATE.roomMode).toBe("inspect");
  });

  it("toggles film mode between negative and positive", () => {
    let state = INITIAL_VIEWER_STATE;
    state = viewerReducer(state, { type: "TOGGLE_FILM_MODE" });
    expect(state.filmMode).toBe("negative");

    state = viewerReducer(state, { type: "TOGGLE_FILM_MODE" });
    expect(state.filmMode).toBe("positive");
  });

  it("sets explicit film mode", () => {
    let state = INITIAL_VIEWER_STATE;
    state = viewerReducer(state, { type: "SET_FILM_MODE", mode: "positive" });
    expect(state.filmMode).toBe("positive");

    state = viewerReducer(state, { type: "SET_FILM_MODE", mode: "negative" });
    expect(state.filmMode).toBe("negative");
  });

  it("rapid reversal transitions settle strictly on the last command", () => {
    let state = INITIAL_VIEWER_STATE;
    const actions1 = [
      { type: "SET_FILM_MODE" as const, mode: "positive" as const },
      { type: "SET_FILM_MODE" as const, mode: "negative" as const },
      { type: "SET_FILM_MODE" as const, mode: "positive" as const },
      { type: "SET_FILM_MODE" as const, mode: "negative" as const },
      { type: "SET_FILM_MODE" as const, mode: "positive" as const },
    ];
    for (const action of actions1) {
      state = viewerReducer(state, action);
    }
    expect(state.filmMode).toBe("positive");

    const actions2 = [
      { type: "TOGGLE_FILM_MODE" as const },
      { type: "TOGGLE_FILM_MODE" as const },
      { type: "TOGGLE_FILM_MODE" as const },
    ];
    for (const action of actions2) {
      state = viewerReducer(state, action);
    }
    // Started at positive, toggled 3 times -> negative
    expect(state.filmMode).toBe("negative");
  });

  it("toggles and sets loupe active state", () => {
    let state = INITIAL_VIEWER_STATE;
    state = viewerReducer(state, { type: "TOGGLE_LOUPE" });
    expect(state.loupe.isActive).toBe(true);

    state = viewerReducer(state, { type: "SET_LOUPE_ACTIVE", active: false });
    expect(state.loupe.isActive).toBe(false);
  });

  it("selects frames and positions loupe with clamping", () => {
    let state = INITIAL_VIEWER_STATE;
    state = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: 2 });
    expect(state.activeFrameIndex).toBe(2);
    expect(state.loupe.frameIndex).toBe(2);
    expect(state.loupe.u).toBe(0.5);
    expect(state.loupe.v).toBe(0.5);

    // Out of bounds clamped safely
    state = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: -10 });
    expect(state.activeFrameIndex).toBe(0);

    state = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: 99 });
    expect(state.activeFrameIndex).toBe(4);
  });

  it("resets back to initial state cleanly", () => {
    let state = INITIAL_VIEWER_STATE;
    state = viewerReducer(state, { type: "SET_FILM_MODE", mode: "negative" });
    state = viewerReducer(state, { type: "SET_LOUPE_ACTIVE", active: true });
    state = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: 3 });

    state = viewerReducer(state, { type: "RESET" });
    expect(state.filmMode).toBe("positive");
    expect(state.loupe.isActive).toBe(false);
    expect(state.activeFrameIndex).toBe(0);
  });
});
