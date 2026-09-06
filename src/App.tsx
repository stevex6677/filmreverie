import { useReducer, useEffect, useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { INITIAL_VIEWER_STATE, viewerReducer } from "./state/viewerState";
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
  const [state, dispatch] = useReducer(viewerReducer, INITIAL_VIEWER_STATE);

  const isDeterministic = useMemo(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("deterministic") === "true" || (window as any).__DETERMINISTIC__ === true;
  }, []);

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
        dispatch({ type: "TOGGLE_LOUPE" });
      } else if (e.key >= "1" && e.key <= "5") {
        const frameIdx = parseInt(e.key, 10) - 1;
        dispatch({ type: "SELECT_FRAME", frameIndex: frameIdx });
      } else if (e.key === "Escape") {
        dispatch({ type: "SET_LOUPE_ACTIVE", active: false });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main
      className="darkroom-app-container"
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
