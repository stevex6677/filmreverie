import { RollLibrary, rollRepository } from "./components/RollLibrary";
import { createRuntimeRoll } from "./storage/rollRuntime";
import { SavedView, storageMessage } from "./storage/rollRepository";
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, LOCAL_ROLL, validateRoll } from "./utils/rollLayout";
import { useReducer, useEffect, useMemo, useState, useRef, Suspense } from "react";
import * as THREE from "three";
import { DISPLAY_EXPOSURE } from "./shaders/tableIllumination";
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
  ROOM_CAMERA_FOV,
  ROOM_CAMERA_UP,
  sphericalToCartesian,
} from "./utils/cameraBounds";
import { ViewingTableScene } from "./components/ViewingTableScene";
import { Controls } from "./components/Controls";
import { MobileControls, MobileSheet } from "./components/MobileControls";
import { useMobileLayout } from "./utils/useMobileLayout";
import { TableControls } from "./components/TableControls";

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
  const mobile = useMobileLayout();
  const [sheet,setSheet]=useState<MobileSheet>(null);
  const [hidden,setHidden]=useState(document.hidden);
  const [contextLost,setContextLost]=useState(false);
  const [canvasVersion,setCanvasVersion]=useState(0);
  useEffect(()=>{const update=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
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

  const initialRoll = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("fixture") === "36" ? FULL_ROLL_FIXTURE : params.get("roll") === "local" && LOCAL_ROLL.frames.length ? LOCAL_ROLL : BASELINE_ROLL;
  }, []);

  const [state, dispatch] = useReducer(
    viewerReducer,
    undefined,
    () => createInitialViewerState(initialRoomMode, initialRoll)
  );

  const roll = state.roll;
  useEffect(()=>setSheet(null),[state.roomMode]);
  useEffect(()=>{if(mobile)dispatch({type:'INPUT_TOUCH',active:true});else setSheet(null);},[mobile]);
  useEffect(() => { document.title = roll.imported ? `${roll.label} — Darkroom Film Viewer` : "Darkroom Film Viewer — Roll 01"; }, [roll]);
  const [libraryOpen, setLibraryOpen] = useState(false), [libraryError, setLibraryError] = useState("");
  const ownedRuntime = useRef<ReturnType<typeof createRuntimeRoll> | null>(null), switchRequest = useRef(0);
  const stateRef = useRef(state); stateRef.current = state;
  const saveView = async () => {
    const current = stateRef.current;
    if (!current.roll.imported || current.roomMode !== "inspect" || current.cameraMoving || current.isTransitioning || current.assetsLoading) return;
    const view: SavedView = { frameId: current.roll.frames[current.activeFrameIndex].id, level: current.inspectionLevel, mode: current.filmMode, brightness: current.tableBrightness, magnification: current.loupe.magnification, zoom: current.inspectZoom, pan: current.inspectPan, overview: current.savedOverview };
    await rollRepository.update(current.roll.rollId, r => ({ ...r, stockId: current.filmStockId, view }));
  };
  const openSaved = async (id: string) => {
    const request = ++switchRequest.current;
    if (id !== stateRef.current.roll.rollId) await saveView();
    const bundle = await rollRepository.read(id);
    if (bundle.roll.trashedAt !== null) throw new Error("This roll is in Trash. Restore it to open it.");
    const runtime = createRuntimeRoll(bundle);
    try {
      // Decode the small overview before replacing the current roll; originals are never decoded here.
      await Promise.all(runtime.definition.frames.map(frame => new Promise<void>((resolve,reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error("Stored preview could not be loaded.")); img.src = frame.thumbnailSrc!; })));
      if (request !== switchRequest.current) { runtime.dispose(); return; }
      const previous = ownedRuntime.current; ownedRuntime.current = runtime;
      dispatch({ type: "LOAD_ROLL", roll: runtime.definition, stockId: bundle.roll.stockId, view: bundle.roll.view });
      previous?.dispose(); setLibraryError("");
      const url = new URL(location.href); for (const key of ["fixture", "roll", "example"]) url.searchParams.delete(key); history.replaceState({}, "", url);
      try { localStorage.setItem("darkroom-active-roll", id); } catch { /* IndexedDB remains authoritative. */ }
    } catch (error) { runtime.dispose(); throw error; }
  };
  const openExample = () => {
    void saveView().catch(error => setLibraryError(storageMessage(error)));
    ++switchRequest.current; ownedRuntime.current?.dispose(); ownedRuntime.current = null;
    dispatch({ type: "LOAD_ROLL", roll: BASELINE_ROLL });
    const url = new URL(location.href); for (const key of ["fixture", "roll", "example"]) url.searchParams.delete(key); history.replaceState({}, "", url);
    try { localStorage.removeItem("darkroom-active-roll"); } catch { /* Storage may be disabled. */ }
  };
  useEffect(() => {
    let id: string | null = null; try { id = localStorage.getItem("darkroom-active-roll"); } catch { /* Library reports availability when opened. */ }
    const params = new URLSearchParams(location.search);
    if (id && !["fixture", "roll", "example"].some(key => params.has(key))) void openSaved(id).catch(error => setLibraryError(storageMessage(error)));
    return () => { ++switchRequest.current; ownedRuntime.current?.dispose(); };
  }, []);
  useEffect(() => {
    if (!roll.imported) return;
    void saveView().catch(error => setLibraryError(storageMessage(error)));
    const flush = () => { void saveView().catch(error => setLibraryError(storageMessage(error))); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); };
  }, [roll, state.activeFrameIndex, state.inspectionLevel, state.filmStockId, state.filmMode, state.tableBrightness, state.loupe.magnification, state.inspectZoom, state.inspectPan, state.isTransitioning, state.cameraMoving, state.assetsLoading]);

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
        near: 0.04,
        far: 50,
      };
    }
    return {
      position: sphericalToCartesian(DEFAULT_ROOM_POSE, ROOM_CAMERA_TARGET),
      up: ROOM_CAMERA_UP,
      fov: ROOM_CAMERA_FOV,
      near: 0.04,
      far: 50,
    };
  }, [initialRoomMode]);

  // Keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (libraryOpen || sheet==='frames') return;
      if(sheet==='tools' && e.key==='Escape'){setSheet(null);return;}
      // Ignore when typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if ((e.target instanceof HTMLElement && e.target.isContentEditable) ||
          (e.target instanceof HTMLButtonElement && ["Enter", " "].includes(e.key))) return;
      if (state.roomMode === "inspect") {
        const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const;
        if (e.key in directions) { e.preventDefault(); dispatch({ type: "NAVIGATE", direction: directions[e.key as keyof typeof directions] }); return; }
        if (e.key === "Enter") { e.preventDefault(); dispatch({ type: "OPEN_FRAME", frameIndex: state.activeFrameIndex }); return; }
        if (/^[1-9]$/.test(e.key)) { dispatch({type:state.focusMode?'OPEN_FRAME':'SELECT_FRAME',frameIndex:Number(e.key)-1}); return; }
      }
      if (state.roomMode === "room") {
        if (e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, [role="dialog"], [contenteditable="true"]')) return;
        const look: Record<string, [number, number]> = { ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, -.1], ArrowDown: [0, .1] };
        if (look[e.key]) { e.preventDefault(); dispatch({ type: "LOOK_ROOM", yaw: look[e.key][0], pitch: look[e.key][1] }); return; }
        if (e.key === "0") { dispatch({ type: "FACE_TABLE" }); return; }
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
          dispatch({ type: state.focusMode ? "FIT_VIEW" : "RESET_TABLE_VIEW" });
        } else if (e.key === "+" || e.key === "=" || e.key === "]") {
          dispatch({ type: "ADJUST_LOUPE_MAGNIFICATION", delta: 1.0 });
        } else if (e.key === "-" || e.key === "_" || e.key === "[") {
          dispatch({ type: "ADJUST_LOUPE_MAGNIFICATION", delta: -1.0 });
        } else if (e.key === "b" || e.key === "B") {
          const cur = state.tableBrightness;
          const nextBrightness = cur <= 0.35 ? 1.0 : cur <= 0.55 ? 0.30 : cur <= 0.80 ? 0.50 : 0.75;
          dispatch({ type: "SET_TABLE_BRIGHTNESS", brightness: nextBrightness });
        } else if (e.key === "Escape") {
          dispatch({ type: "ESCAPE_INSPECTION" });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.roomMode, state.focusMode, state.activeFrameIndex, state.isTransitioning, state.tableBrightness, roll, libraryOpen, sheet]);

  const localError = new URLSearchParams(window.location.search).get("roll") === "local" ? validateRoll(LOCAL_ROLL) : null;
  if (localError) return <main className="darkroom-error-fallback"><div className="error-card" role="alert"><h2>Local roll unavailable</h2><p>{localError}</p><a href="/?example=1">Open the five-photo example</a></div></main>;

  return (
    <main
      className={`darkroom-app-container ${roll !== BASELINE_ROLL ? "full-roll" : ""} ${mobile?'mobile-layout':''} ${state.roomMode==='inspect'?'table-layout':''}`}
      data-table-mode={state.focusMode?'focus':'overview'}
      data-roll-id={roll.rollId}
      data-film-format={roll.format ?? "135"}
      data-inspection-level={state.inspectionLevel}
      data-selected-frame={state.activeFrameIndex + 1}
      data-assets-ready={!state.assetsLoading}
      data-inspect-zoom={state.inspectZoom}
      data-inspect-pan={`${state.inspectPan.x},${state.inspectPan.z}`}
      data-room-mode={state.roomMode}
      data-room-pose={`${state.savedRoomPose.yaw},${state.savedRoomPose.pitch}`}
      data-room-brightness={state.roomBrightness}
      data-focus-mode={state.focusMode ? "true" : "false"}
      data-settled-frame={state.settledFrameIndex+1}
      data-is-transitioning={state.isTransitioning ? "true" : "false"}
      data-film-mode={state.filmMode}
      data-film-stock={state.filmStockId}
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
          <div className="canvas-wrapper" tabIndex={0} aria-label="Film viewer">
            <Canvas shadows key={canvasVersion}
              onCreated={({gl})=>{gl.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setContextLost(true);});gl.domElement.addEventListener('webglcontextrestored',()=>setContextLost(false));}}
              frameloop={libraryOpen || sheet === 'frames' || hidden || contextLost ? "never" : "always"}
              camera={initialCamera}
              dpr={[1, Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 1.5)]}
              gl={{
                preserveDrawingBuffer: true,
                antialias: true,
                powerPreference: "high-performance",
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: DISPLAY_EXPOSURE,
                outputColorSpace: THREE.SRGBColorSpace,
              }}
            >
              <ViewingTableScene
                inputBlocked={libraryOpen || sheet==='frames' || (state.roomMode==='room' && !!sheet) || hidden || contextLost}
                state={state}
                dispatch={dispatch}
                isDeterministic={isDeterministic}
                isReducedMotion={isReducedMotion}
              />
            </Canvas>
          </div>
        </Suspense>
      )}

      {contextLost&&<div className="context-recovery" role="alert"><p>The graphics view was interrupted. Your rolls are saved.</p><button onClick={()=>{setContextLost(false);setCanvasVersion(v=>v+1);}}>Restore view</button></div>}
      {state.roomMode==='inspect'?<TableControls state={state} dispatch={dispatch} onOpenLibrary={()=>setLibraryOpen(true)} sheet={sheet} setSheet={setSheet}/>:mobile ? <MobileControls state={state} dispatch={dispatch} onOpenLibrary={()=>setLibraryOpen(true)} sheet={sheet} setSheet={setSheet}/> : <Controls state={state} dispatch={dispatch} onOpenLibrary={() => setLibraryOpen(true)} />}
      {libraryError && <div className="library-notice" role="alert">{libraryError}<button onClick={() => setLibraryOpen(true)}>Open library</button></div>}
      {libraryOpen && <RollLibrary activeId={roll.rollId} onClose={() => setLibraryOpen(false)} onOpen={openSaved} onExample={openExample} onRemoved={id => { if (id === roll.rollId) openExample(); }} />}
    </main>
  );
}

export default App;
