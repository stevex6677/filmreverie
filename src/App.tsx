import { useReducer, useEffect, useMemo, useState, Suspense } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  createInitialViewerState,
  viewerReducer,
  RoomMode,
} from "./state/viewerState";
import {
  DEFAULT_ROOM_POSE,
  INSPECT_CAMERA_POSITION,
  INSPECT_CAMERA_UP,
  ROOM_CAMERA_TARGET,
  ROOM_CAMERA_UP,
  sphericalToCartesian,
} from "./utils/cameraBounds";
import { ViewingTableScene } from "./components/ViewingTableScene";
import { Controls } from "./components/Controls";

function LoadingFallback() {
  return (
    <div className="darkroom-loading" data-testid="loading-indicator">
      <div className="loading-spinner" />
      <p>Developing film roll 01...</p>
      <span className="loading-sub">Calibrating emulsion density & light table...</span>
    </div>
  );
}

export function App() {
  const { isDeterministic, initialRoomMode, isReducedMotion } = useMemo(() => {
    if (typeof window === "undefined") {
      return { isDeterministic: false, initialRoomMode: "inspect" as RoomMode, isReducedMotion: false };
    }
    const params = new URLSearchParams(window.location.search);
    const deterministic =
      params.get("deterministic") === "true" || (window as any).__DETERMINISTIC__ === true;
    const modeParam = params.get("mode");
    let mode: RoomMode = "room";
    if (modeParam === "inspect") {
      mode = "inspect";
    } else if (modeParam === "room") {
      mode = "room";
    } else if (deterministic) {
      // Preserve M1 direct inspection view when deterministic=true and no mode is specified
      mode = "inspect";
    }
    const reducedMotionParam = params.get("reduced_motion") === "true";
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    return {
      isDeterministic: deterministic,
      initialRoomMode: mode,
      isReducedMotion: reducedMotionParam || prefersReducedMotion,
    };
  }, []);

  const [injectedError, setInjectedError] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("test_error") === "1";
  });

  const [state, dispatch] = useReducer(
    viewerReducer,
    undefined,
    () => createInitialViewerState(initialRoomMode)
  );

  const handleRetry = () => {
    setInjectedError(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("test_error");
      window.history.replaceState({}, "", url.toString());
    }
    dispatch({ type: "RETRY" });
  };

  const initialCamera = useMemo(() => {
    if (initialRoomMode === "inspect") {
      return {
        position: INSPECT_CAMERA_POSITION,
        up: INSPECT_CAMERA_UP,
        fov: 45,
      };
    }
    return {
      position: sphericalToCartesian(DEFAULT_ROOM_POSE, ROOM_CAMERA_TARGET),
      up: ROOM_CAMERA_UP,
      fov: 45,
    };
  }, [initialRoomMode]);

  // Keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (state.roomMode === "room") {
        if ((e.key === "Enter" || e.key === " ") && !state.isTransitioning) {
          dispatch({ type: "APPROACH_TABLE" });
        }
      } else {
        // Inspect mode shortcuts
        if (e.key === "m" || e.key === "M") {
          dispatch({ type: "TOGGLE_FILM_MODE" });
        } else if (e.key === "l" || e.key === "L") {
          dispatch({ type: "TOGGLE_LOUPE" });
        } else if (e.key >= "1" && e.key <= "5") {
          const frameIdx = parseInt(e.key, 10) - 1;
          dispatch({ type: "SELECT_FRAME", frameIndex: frameIdx });
        } else if (e.key === "ArrowLeft") {
          dispatch({
            type: "SELECT_FRAME",
            frameIndex: Math.max(0, state.activeFrameIndex - 1),
          });
        } else if (e.key === "ArrowRight") {
          dispatch({
            type: "SELECT_FRAME",
            frameIndex: Math.min(4, state.activeFrameIndex + 1),
          });
        } else if (e.key === "0") {
          dispatch({ type: "RESET_TABLE_VIEW" });
        } else if (e.key === "+" || e.key === "=" || e.key === "]") {
          dispatch({ type: "ADJUST_LOUPE_MAGNIFICATION", delta: 1.0 });
        } else if (e.key === "-" || e.key === "_" || e.key === "[") {
          dispatch({ type: "ADJUST_LOUPE_MAGNIFICATION", delta: -1.0 });
        } else if (e.key === "Escape") {
          dispatch({ type: "RETURN_TO_ROOM" });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.roomMode, state.activeFrameIndex, state.isTransitioning]);

  return (
    <main
      className="darkroom-app-container"
      data-room-mode={state.roomMode}
      data-is-transitioning={state.isTransitioning ? "true" : "false"}
      data-film-mode={state.filmMode}
      data-loupe-active={state.loupe.isActive ? "true" : "false"}
      data-active-frame={state.loupe.frameIndex + 1}
      data-reduced-motion={isReducedMotion ? "true" : "false"}
    >
      {injectedError || state.error ? (
        <div className="darkroom-error-fallback" data-testid="error-banner">
          <div className="error-card">
            <div className="error-badge">CHEMISTRY ERROR</div>
            <h2>Darkroom Emulsion Failure</h2>
            <p>
              Negative assets failed to load: {state.error || "Injected development error"}.
            </p>
            <button
              id="retry-btn"
              data-testid="retry-development-btn"
              className="btn btn-retry"
              onClick={handleRetry}
            >
              Retry Development
            </button>
          </div>
        </div>
      ) : (
        <Suspense fallback={<LoadingFallback />}>
          <div className="canvas-wrapper">
            <Canvas
              camera={initialCamera}
              dpr={[1, Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 1.5)]}
              gl={{
                preserveDrawingBuffer: true,
                antialias: true,
                powerPreference: "high-performance",
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.0,
              }}
            >
              <ViewingTableScene
                state={state}
                dispatch={dispatch}
                isDeterministic={isDeterministic}
                isReducedMotion={isReducedMotion}
              />
            </Canvas>
          </div>
        </Suspense>
      )}

      <Controls state={state} dispatch={dispatch} />
    </main>
  );
}

export default App;
