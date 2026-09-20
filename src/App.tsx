import { ShelfTools } from "./components/ShelfTools";
import { RollEditor } from "./components/RollEditor";
import { UpdateNotice } from "./components/UpdateNotice";
import { createRuntimeRoll } from "./storage/rollRuntime";
import { SavedView, StoredRoll, rollRepository, storageMessage } from "./storage/rollRepository";
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, LOCAL_ROLL, validateRoll } from "./utils/rollLayout";
import { useReducer, useEffect, useMemo, useState, useRef, useCallback, Suspense } from "react";
import * as THREE from "three";
import { DISPLAY_EXPOSURE } from "./shaders/tableIllumination";
import { Canvas } from "@react-three/fiber";
import {
  createInitialViewerState,
  viewerReducer,
  RoomMode,
} from "./state/viewerState";
import { DarkroomLoadingPage, LoadingProgress } from "./components/DarkroomLoadingPage";
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
import { useFilmShelf } from './utils/useFilmShelf';
import { ShelfRollCard } from './components/ShelfRollCard';
import { CameraDisplayView } from './components/CameraDisplayView';
import { useCameraNavigation } from './utils/useCameraNavigation';

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

  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>({
    loaded: 0,
    total: initialRoll.frames.length,
    settled: false,
    firstFrameRendered: false,
  });
  const [appReady, setAppReady] = useState(false);

  const handleLoadProgress = useCallback(({ loaded, total, settled }: { loaded: number; total: number; settled: boolean }) => {
    setLoadingProgress(prev => ({
      ...prev,
      loaded,
      total,
      settled,
    }));
  }, []);

  const handleFirstFrameRendered = useCallback(() => {
    setLoadingProgress(prev => ({
      ...prev,
      firstFrameRendered: true,
    }));
  }, []);

  const handleFullyLoaded = useCallback(() => {
    setAppReady(true);
  }, []);
  const [cameraSettled, setCameraSettled] = useState(false);
  const handleCameraSettled = useCallback(() => setCameraSettled(true), []);

  const [state, dispatch] = useReducer(
    viewerReducer,
    undefined,
    () => {
      const initial = createInitialViewerState(initialRoomMode, initialRoll);
      try {
        const preference = JSON.parse(localStorage.getItem('darkroom-loupe-preferences') ?? 'null');
        if (preference && typeof preference.opticalEffects === 'boolean') initial.loupe.opticalEffects = preference.opticalEffects;
        if (preference && Number.isFinite(preference.magnification) && preference.magnification >= 1.5 && preference.magnification <= 10) initial.loupe.magnification = preference.magnification;
      } catch { /* The loupe works when storage is unavailable. */ }
      return initial;
    }
  );
  useEffect(() => {
    try { localStorage.setItem('darkroom-loupe-preferences', JSON.stringify({ opticalEffects: state.loupe.opticalEffects, magnification: state.loupe.magnification })); } catch { /* Optional preference. */ }
  }, [state.loupe.opticalEffects, state.loupe.magnification]);

  const roll = state.roll;
  useCameraNavigation(state, dispatch);
  const closeCamera = useCallback(() => dispatch({ type: 'CLOSE_CAMERA' }), []);
  useEffect(()=>setSheet(null),[state.roomMode]);
  useEffect(()=>{if(mobile)dispatch({type:'INPUT_TOUCH',active:true});else setSheet(null);},[mobile]);
  useEffect(() => { document.title = roll.imported ? `${roll.label} — Darkroom Film Viewer` : "Darkroom Film Viewer — Roll 01"; }, [roll]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false), [libraryError, setLibraryError] = useState("");
  const [editingRollId, setEditingRollId] = useState<string | undefined>();
  const [deletedRoll, setDeletedRoll] = useState<StoredRoll | null>(null);
  const shelfPortal = useRef<HTMLDivElement>(null);
  const shelfVisible = state.roomMode === 'room' && !state.cameraDisplay && !editorOpen && !toolsOpen && !sheet && !hidden && !contextLost;
  const shelf = useFilmShelf(rollRepository, shelfVisible);
  useEffect(() => { if (!state.shelfFocused && shelf.trash) shelf.changeTrash(false); }, [state.shelfFocused, shelf.trash]);
  const tableRollAvailable = !shelf.allRolls.some(r => r.id === roll.rollId && r.trashedAt !== null);
  const openShelf = () => {
    void saveView().catch(error => setLibraryError(storageMessage(error)));
    shelf.close(); shelf.retry(); setSheet(null); dispatch({ type: 'APPROACH_SHELF' });
  };
  const openEditor = (id?: string) => { openShelf(); shelf.changeTrash(false); setEditingRollId(id); setEditorOpen(true); };
  const openCameras = () => { void saveView().catch(error => setLibraryError(storageMessage(error))); shelf.close(); setSheet(null); dispatch({ type: 'APPROACH_CAMERA_SHELF' }); };
  const deleteRoll = async (removed: StoredRoll) => {
    await rollRepository.trash(removed.id); shelf.close(); setDeletedRoll(removed);
    if (removed.id === roll.rollId) { try { localStorage.removeItem('darkroom-active-roll'); } catch { /* Optional preference. */ } }
  };
  const restoreRoll = async (id: string) => { await rollRepository.trash(id, false); shelf.close(); setDeletedRoll(null); };
  const ownedRuntime = useRef<ReturnType<typeof createRuntimeRoll> | null>(null), switchRequest = useRef(0);
  const stateRef = useRef(state); stateRef.current = state;
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveView = () => {
    const current = stateRef.current;
    if (!current.roll.imported || current.cameraMoving || current.isTransitioning || current.assetsLoading) return Promise.resolve();
    const rollId = current.roll.rollId;
    const stockId = current.filmStockId;
    const filmStrength = current.filmStrength;
    const roomMode = current.roomMode;
    const view: SavedView = { filmScale: current.roll.scale, frameId: current.roll.frames[current.activeFrameIndex].id, level: current.inspectionLevel, mode: current.filmMode, brightness: current.tableBrightness, magnification: current.loupe.magnification, zoom: current.inspectZoom, pan: current.inspectPan, overview: current.savedOverview };
    const queued = saveQueue.current.catch(() => {}).then(() => rollRepository.update(rollId, r => ({ ...r, stockId, filmStrength, view: roomMode === "inspect" ? view : r.view })));
    saveQueue.current = queued;
    return queued;
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
      dispatch({ type: "LOAD_ROLL", roll: runtime.definition, stockId: bundle.roll.stockId, filmStrength: bundle.roll.filmStrength, view: runtime.view });
      previous?.dispose(); setLibraryError("");
      const url = new URL(location.href); for (const key of ["fixture", "roll", "example"]) url.searchParams.delete(key); history.replaceState({}, "", url);
      try { localStorage.setItem("darkroom-active-roll", id); } catch { /* IndexedDB remains authoritative. */ }
    } catch (error) { runtime.dispose(); throw error; }
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
  }, [roll, state.activeFrameIndex, state.inspectionLevel, state.filmStockId, state.filmStrength, state.filmMode, state.tableBrightness, state.loupe.magnification, state.inspectZoom, state.inspectPan, state.isTransitioning, state.cameraMoving, state.assetsLoading]);

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
      if (state.cameraDisplay || editorOpen || toolsOpen || sheet==='frames') return;
      if(sheet==='tools' && e.key==='Escape'){setSheet(null);return;}
      // Ignore when typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if ((e.target instanceof HTMLElement && e.target.isContentEditable) ||
          (e.target instanceof HTMLButtonElement && ["Enter", " "].includes(e.key))) return;
      if (state.roomMode === "inspect" && state.adjustingView) {
        const step = 3 * Math.PI / 180;
        if (e.key.startsWith('Arrow')) {
          e.preventDefault(); dispatch({type:'ADJUST_TABLE_ANGLE',yaw:e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0,tilt:e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0}); return;
        }
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); dispatch({type:'SET_ADJUSTING_VIEW',active:false}); return; }
        if (e.key === '0') { dispatch({type:'TOP_DOWN'}); return; }
      }
      if (state.roomMode === "inspect") {
        if (state.loupe.isActive && e.key.startsWith('Arrow')) {
          e.preventDefault();
          const step = state.loupe.scale * (e.shiftKey ? .04 : .01) / (state.loupe.inspecting ? state.loupe.magnification : 1);
          dispatch({type:'MOVE_LOUPE',dx:e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0,dy:e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0});return;
        }
        const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const;
        if (e.key in directions) { e.preventDefault(); dispatch({ type: "NAVIGATE", direction: directions[e.key as keyof typeof directions] }); return; }
        if (e.key === "Enter") { e.preventDefault(); dispatch(state.loupe.isActive ? {type:'INSPECT_LOUPE'} : { type: "OPEN_FRAME", frameIndex: state.activeFrameIndex }); return; }
        if (/^[1-9]$/.test(e.key)) { dispatch({type:state.focusMode?'OPEN_FRAME':'SELECT_FRAME',frameIndex:Number(e.key)-1}); return; }
      }
      if (state.roomMode === "room") {
        if (state.shelfFocused && e.key === "Escape") { e.preventDefault(); shelf.close(); dispatch({ type: "RETURN_TO_ROOM" }); return; }
        if (e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, [role="dialog"], [contenteditable="true"]')) return;
        const look: Record<string, [number, number]> = { ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, -.1], ArrowDown: [0, .1] };
        if (look[e.key]) { e.preventDefault(); dispatch({ type: "LOOK_ROOM", yaw: look[e.key][0], pitch: look[e.key][1] }); return; }
        if (e.key === "0") { dispatch({ type: "FACE_TABLE" }); return; }
        if ((e.key === "Enter" || e.key === " ") && (!state.isTransitioning || state.transitionKind === 'shelf')) {
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
  }, [state.cameraDisplay, state.roomMode, state.adjustingView, state.shelfFocused, state.focusMode, state.activeFrameIndex, state.isTransitioning, state.tableBrightness, state.loupe, roll, editorOpen, toolsOpen, sheet]);

  const localError = new URLSearchParams(window.location.search).get("roll") === "local" ? validateRoll(LOCAL_ROLL) : null;
  if (localError) return <main className="darkroom-error-fallback"><div className="error-card" role="alert"><h2>Local roll unavailable</h2><p>{localError}</p><a href="/?mode=room">Return to shelf</a></div></main>;

  return (
    <div className="app-shell">
      <UpdateNotice beforeUpdate={async () => {
        if (stateRef.current.cameraMoving || stateRef.current.isTransitioning || stateRef.current.assetsLoading) throw new Error("Wait for the photograph to finish opening before updating.");
        await saveView();
      }} />
      <DarkroomLoadingPage
        progress={{ ...loadingProgress, cameraSettled, settled: loadingProgress.settled && (initialRoomMode !== 'room' || cameraSettled) }}
        isDeterministic={isDeterministic}
        isReducedMotion={isReducedMotion}
        hasError={injectedError || !!state.error}
        onFullyLoaded={handleFullyLoaded}
      />
    <main
      className={`darkroom-app-container ${roll !== BASELINE_ROLL ? "full-roll" : ""} ${mobile?'mobile-layout':''} ${state.roomMode==='inspect'?'table-layout':''}`}
      data-table-mode={state.focusMode?'focus':'overview'}
      data-roll-id={roll.rollId}
      data-film-format={roll.format ?? "135"}
      data-inspection-level={state.inspectionLevel}
      data-selected-frame={state.activeFrameIndex + 1}
      data-assets-ready={!state.assetsLoading}
      data-app-ready={appReady ? "true" : "false"}
      data-inspect-zoom={state.inspectZoom}
      data-table-angle={`${state.tableAngle.tilt},${state.tableAngle.yaw}`}
      data-adjusting-view={state.adjustingView}
      data-inspect-pan={`${state.inspectPan.x},${state.inspectPan.z}`}
      data-shelf-trash={shelf.trash}
      data-table-roll-available={tableRollAvailable}
      data-shelf-focused={state.shelfFocused}
      data-shelf-id={state.shelfId ?? ''}
      data-camera-display={state.cameraDisplay ?? ''}
      data-room-mode={state.roomMode}
      data-room-pose={`${state.savedRoomPose.yaw},${state.savedRoomPose.pitch}`}
      data-room-brightness={state.roomBrightness}
      data-focus-mode={state.focusMode ? "true" : "false"}
      data-settled-frame={state.settledFrameIndex+1}
      data-is-transitioning={state.isTransitioning ? "true" : "false"}
      data-film-mode={state.filmMode}
      data-film-stock={state.filmStockId}
      data-film-strength={state.filmStrength}
      data-loupe-active={state.loupe.isActive ? "true" : "false"}
      data-loupe-state={state.loupe.inspecting ? 'inspection' : state.loupe.isActive ? 'activated' : 'inactivated'}
      data-loupe-effects={String(state.loupe.opticalEffects)}
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
          <div className="canvas-wrapper" tabIndex={state.cameraDisplay ? -1 : 0} aria-hidden={!!state.cameraDisplay} aria-label="Film viewer">
            <Canvas shadows key={canvasVersion}
              onCreated={({gl})=>{gl.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setContextLost(true);});gl.domElement.addEventListener('webglcontextrestored',()=>setContextLost(false));}}
              frameloop={state.cameraDisplay || editorOpen || toolsOpen || sheet === 'frames' || hidden || contextLost ? "never" : "always"}
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
                onEditShelfRoll={openEditor}
                showRoll={tableRollAvailable}
                shelf={shelf}
                shelfPortal={shelfPortal}
                inputBlocked={!!state.cameraDisplay || editorOpen || toolsOpen || sheet==='frames' || (state.roomMode==='room' && !!sheet) || hidden || contextLost}
                state={state}
                dispatch={dispatch}
                isDeterministic={isDeterministic}
                isReducedMotion={isReducedMotion}
                onLoadProgress={handleLoadProgress}
                onFirstFrameRendered={handleFirstFrameRendered}
                onCameraSettled={handleCameraSettled}
              />
            </Canvas>
          </div>
        </Suspense>
      )}

      {contextLost&&<div className="context-recovery" role="alert"><p>The graphics view was interrupted. Your rolls are saved.</p><button onClick={()=>{setContextLost(false);setCanvasVersion(v=>v+1);}}>Restore view</button></div>}
      <div ref={shelfPortal} className="shelf-overlay" aria-label="Saved-roll shelf" style={{ display: shelfVisible ? undefined : 'none' }} />
      {shelfVisible && state.shelfId === 'camera' && <div className="shelf-toolbar camera-collection-toolbar" aria-label="Camera shelf controls"><button onClick={() => dispatch({ type: 'RETURN_TO_ROOM' })}>← Back to room</button><div><span className="shelf-eyebrow">YOUR CAMERAS</span><span>One camera, many perspectives</span></div><button onClick={openShelf}>Film shelf</button></div>}
      {shelfVisible && state.shelfId !== 'camera' && <div className="shelf-toolbar" aria-label="Shelf controls">
        {state.shelfFocused && <button onClick={() => { shelf.close(); dispatch({ type: "RETURN_TO_ROOM" }); }}>← Back to room</button>}
        <div><span className="shelf-eyebrow">{shelf.trash ? "TRASH" : "YOUR COLLECTION"}</span><span>{shelf.trash ? `${shelf.trashCount} deleted rolls` : `${shelf.savedCount} saved ${shelf.savedCount === 1 ? "roll" : "rolls"}`}</span></div>
        {shelf.pages > 1 && <nav aria-label="Shelf pages"><button aria-label="Previous shelf page" disabled={shelf.page === 0} onClick={() => shelf.changePage(shelf.page - 1)}>‹</button><span aria-live="polite">{shelf.page + 1} / {shelf.pages}</span><button aria-label="Next shelf page" disabled={shelf.page + 1 === shelf.pages} onClick={() => shelf.changePage(shelf.page + 1)}>›</button></nav>}
        <button onClick={() => { shelf.close(); setToolsOpen(true); }}>Backups &amp; offline</button>
        <button className="shelf-add" onClick={() => openEditor()}>New roll</button>
        {state.shelfFocused && <button onClick={() => shelf.changeTrash(!shelf.trash)}>{shelf.trash ? "Saved rolls" : `Trash (${shelf.trashCount})`}</button>}
        {deletedRoll && <div className="shelf-deleted-notice" role="status"><span>{deletedRoll.name} moved to Trash</span><button onClick={() => { void restoreRoll(deletedRoll.id).catch(error => setLibraryError(storageMessage(error))); }}>Undo</button><button aria-label="Dismiss deletion notice" onClick={() => setDeletedRoll(null)}>×</button></div>}
        {shelf.error && <p role="alert">{shelf.error}<button onClick={shelf.retry}>Retry</button></p>}
      </div>}
      {shelfVisible && shelf.selectedRoll && shelf.selection && <ShelfRollCard key={shelf.selectedRoll.id} shelf={shelf} roll={shelf.selectedRoll} repository={rollRepository} activeId={tableRollAvailable ? roll.rollId : ""} onOpen={openSaved} onEdit={openEditor} onDelete={deleteRoll} onRestore={restoreRoll} />}
      {!state.cameraDisplay && (!tableRollAvailable ? <div className="empty-table-controls"><button onClick={openShelf}>Rolls</button><button onClick={openCameras}>Cameras</button><span>No roll on the light table</span>{state.roomMode === 'inspect' && <button onClick={() => openEditor()}>New roll</button>}</div> : state.roomMode==='inspect'?<TableControls state={state} dispatch={dispatch} onOpenLibrary={openShelf} sheet={sheet} setSheet={setSheet}/>:mobile ? <MobileControls state={state} dispatch={dispatch} onOpenLibrary={openShelf} onOpenCameras={openCameras} sheet={sheet} setSheet={setSheet}/> : <Controls state={state} dispatch={dispatch} onOpenLibrary={openShelf} onOpenCameras={openCameras} />)}
      {state.cameraDisplay && <CameraDisplayView id={state.cameraDisplay} onBack={closeCamera} reducedMotion={isReducedMotion} />}
      {libraryError && <div className="library-notice" role="alert">{libraryError}<button onClick={() => { setLibraryError(""); openShelf(); }}>Open shelf</button></div>}
      {toolsOpen && <ShelfTools onClose={() => setToolsOpen(false)} beforeExport={saveView} />}
      {editorOpen && <RollEditor onDelete={deleteRoll} editId={editingRollId} onClose={() => { setEditorOpen(false); setEditingRollId(undefined); }} onOpen={openSaved} />}
    </main>
    </div>
  );
}

export default App;
