import { useReducer, useEffect, useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  createInitialViewerState,
  viewerReducer,
  RoomMode,
} from "./state/viewerState";
import { ViewingTableScene } from "./components/ViewingTableScene";
import { Controls } from "./components/Controls";

function LoadingFallback() {
  return (
    <div className="darkroom-loading" data-testid="loading-indicator">
      <div className="loading-spinner" />
      <p>Developing film roll 01...</p>
    </div>
  );
}

export function App() {
  const { isDeterministic, initialRoomMode } = useMemo(() => {
    if (typeof window === "undefined") {
      return { isDeterministic: false, initialRoomMode: "inspect" as RoomMode };
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
    return { isDeterministic: deterministic, initialRoomMode: mode };
  }, []);

  const [state, dispatch] = useReducer(
    viewerReducer,
    undefined,
    () => createInitialViewerState(initialRoomMode)
  );

  // Keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "m" || e.key === "M") {
        dispatch({ type: "TOGGLE_FILM_MODE" });
      } else if (e.key === "l" || e.key === "L") {
        if (state.roomMode === "room") {
          dispatch({ type: "APPROACH_TABLE" });
        }
        dispatch({ type: "TOGGLE_LOUPE" });
      } else if (e.key >= "1" && e.key <= "5") {
        const frameIdx = parseInt(e.key, 10) - 1;
        if (state.roomMode === "room") {
          dispatch({ type: "APPROACH_TABLE" });
        }
        dispatch({ type: "SELECT_FRAME", frameIndex: frameIdx });
      } else if (e.key === "Escape") {
        if (state.roomMode === "inspect") {
          dispatch({ type: "RETURN_TO_ROOM" });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.roomMode]);

  return (
    <main
      className="darkroom-app-container"
      data-room-mode={state.roomMode}
      data-is-transitioning={state.isTransitioning ? "true" : "false"}
      data-film-mode={state.filmMode}
      data-loupe-active={state.loupe.isActive ? "true" : "false"}
      data-active-frame={state.loupe.frameIndex + 1}
    >
      <Suspense fallback={<LoadingFallback />}>
        <div className="canvas-wrapper">
          <Canvas
            camera={{ position: [0, 0, 2.8], fov: 45 }}
            gl={{
              preserveDrawingBuffer: true,
              antialias: true,
              powerPreference: "high-performance",
            }}
          >
            <ViewingTableScene
              state={state}
              dispatch={dispatch}
              isDeterministic={isDeterministic}
            />
          </Canvas>
        </div>
      </Suspense>

      <Controls state={state} dispatch={dispatch} />
    </main>
  );
}

export default App;
