import type { ProgressReporter } from './utils/operationProgress';
import { isLoupeSize, isLoupeType, LOUPE_SIZE_SCALE } from './utils/loupeView';
import { RollEditor } from "./components/RollEditor";
import { UpdateNotice } from "./components/UpdateNotice";
import { createRuntimeRoll } from "./storage/rollRuntime";
import { SavedView, StoredRoll, storageMessage } from "./storage/rollRepository";
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, LOCAL_ROLL, focusTableAngle, validateRoll } from "./utils/rollLayout";
import { screenToTable } from "./utils/tableCamera";
import { useReducer, useEffect, useMemo, useState, useRef, useCallback, useSyncExternalStore, Suspense, lazy } from "react";
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
import { CAMERAS } from './data/cameras';
import { preloadCameraDetails, type CameraCollectionProgress } from './utils/loadCameraModel';
import { useCameraNavigation } from './utils/useCameraNavigation';
import type { GalleryRuntime } from './cloud/galleryClient';
import { AdminMenu, CreateYourOwnLink, useAdminSession } from './cloud/AdminMenu';
import { adminRollRepository } from './cloud/adminRepository';
import { usePublishedShelf } from './cloud/publicShelf';
import { guestRollRepository, guestActiveRollKey, guestWelcomeKey } from './storage/guestRolls';
import { GuestWelcome } from './components/GuestWelcome';
import './cloud/navigation.css';
import { getFilmStock } from './data/filmStocks';
import { FILM_FORMATS } from './data/filmFormats';
import { ScreeningSession, type ExportFormat, type ScreeningChoice, type ScreeningCredits } from './screening/session';
import { ScreeningPicker, ScreeningPlayer } from './screening/ScreeningUI';
import { createScreeningTimeline } from './screening/reels';
import { screeningFileName } from './screening/overlay';
import { IntroTour, shouldOfferIntroTour } from './tour/IntroTour';
import { TourAnchors } from './tour/TourAnchors';
import type { TourStage } from './tour/tourSteps';

// Export code (encoder and MP4 writer) loads on demand, not at startup.
const ScreeningExportView = lazy(() => import('./screening/ScreeningExportView'));
const idle = () => () => {};


function LoadingFallback() {
  return (
    <div className="darkroom-loading" data-testid="loading-indicator">
      <div className="loading-spinner" />
      <p>Preparing the darkroom...</p>
      <span className="loading-sub">Calibrating emulsion density & light table...</span>
    </div>
  );
}

export function App() {
  const isGuest = /^\/guest\/?$/.test(window.location.pathname);
  const adminLoggedIn = useAdminSession(!isGuest);
  const canManageRolls = isGuest || adminLoggedIn;
  const repository = isGuest ? guestRollRepository : adminRollRepository;
  const managedCoverSource = useMemo(() => repository.thumbnail.bind(repository), [repository]);
  const [guestWelcome, setGuestWelcome] = useState(() => {
    if (!isGuest) return false;
    if (new URLSearchParams(window.location.search).get('welcome') === '1') return true;
    try { return localStorage.getItem(guestWelcomeKey) !== 'done'; } catch { return true; }
  });
  const { mobile } = useMobileLayout();
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

  // First visitors to the public room get a guided tour once loading has finished.
  const [tourWanted, setTourWanted] = useState(() => !isGuest && !isDeterministic && shouldOfferIntroTour(new URLSearchParams(window.location.search)));
  const [touring, setTouring] = useState(false);

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
  const [cameraProgress, setCameraProgress] = useState<CameraCollectionProgress>({ loaded: 0, total: CAMERAS.length, failed: 0, retry: () => {} });
  const cameraSettled = cameraProgress.loaded === cameraProgress.total;
  const handleCameraSettled = useCallback((progress: CameraCollectionProgress) => setCameraProgress(progress), []);

  const [state, dispatch] = useReducer(
    viewerReducer,
    undefined,
    () => {
      const initial = createInitialViewerState(initialRoomMode, initialRoll);
      try {
        const preference = JSON.parse(localStorage.getItem('darkroom-loupe-preferences') ?? 'null');
        if (isLoupeType(preference?.type)) initial.loupe.type = preference.type;
        if (isLoupeSize(preference?.size)) { initial.loupe.size = preference.size; initial.loupe.scale = initial.roll.scale * LOUPE_SIZE_SCALE[initial.loupe.size]; }
        if (preference && typeof preference.opticalEffects === 'boolean') initial.loupe.opticalEffects = preference.opticalEffects;
        if (preference && Number.isFinite(preference.magnification) && preference.magnification >= 1.5 && preference.magnification <= 10) initial.loupe.magnification = preference.magnification;
      } catch { /* The loupe works when storage is unavailable. */ }
      return initial;
    }
  );
  useEffect(() => {
    try { localStorage.setItem('darkroom-loupe-preferences', JSON.stringify({ type: state.loupe.type, size: state.loupe.size, opticalEffects: state.loupe.opticalEffects, magnification: state.loupe.magnification })); } catch { /* Optional preference. */ }
  }, [state.loupe.type, state.loupe.size, state.loupe.opticalEffects, state.loupe.magnification]);
  useEffect(() => {
    // Film strength is edited per roll in the roll editor. Deterministic optical
    // checks set the roll-level shader strength on rolls that cannot be edited.
    if (!isDeterministic) return;
    const target = window as typeof window & { __setFilmStrength?: (strength: number) => void };
    target.__setFilmStrength = strength => dispatch({ type: 'SET_FILM_STRENGTH', strength });
    return () => { delete target.__setFilmStrength; };
  }, [isDeterministic]);

  useEffect(() => {
    if (!tourWanted || touring || !appReady || !cameraSettled || state.error) return;
    // Start once the loading overlay has finished dissolving.
    const timer = window.setTimeout(() => setTouring(true), 900);
    return () => window.clearTimeout(timer);
  }, [tourWanted, touring, appReady, cameraSettled, state.error]);

  useEffect(() => {
    if (!appReady || !cameraSettled || state.roomMode !== 'room') return;
    // Let the loading overlay finish its dissolve before background decoding.
    const timer = window.setTimeout(() => { void preloadCameraDetails(CAMERAS); }, 800);
    return () => window.clearTimeout(timer);
  }, [appReady, cameraSettled, state.roomMode]);

  const roll = state.roll;
  // Screening overrides rendering only. It never dispatches viewer actions,
  // so the table, loupe, film mode, brightness and saved views are unchanged.
  const [screeningChoice, setScreeningChoice] = useState<ScreeningChoice>({ reel: 'tracking', pace: 'normal', tuning: {}, music: 'none', volume: .8 });
  const [screeningFormat, setScreeningFormat] = useState<ExportFormat>('16:9');
  const [screeningPicker, setScreeningPicker] = useState(false);
  const [screening, setScreening] = useState<ScreeningSession | null>(null);
  const [screeningExport, setScreeningExport] = useState<'picker' | 'preview' | null>(null);
  const screeningExporting = useSyncExternalStore(screening?.subscribe ?? idle, () => screening?.exporting ?? false);
  const screeningCredits = useMemo<ScreeningCredits>(() => {
    const [title, ...rest] = roll.label.split(' · ');
    return { title: title || 'Untitled roll', stock: getFilmStock(state.filmStockId).displayName, format: roll.format ? rest.join(' · ') || FILM_FORMATS[roll.format].label : FILM_FORMATS['135'].label, frames: roll.frames.length };
  }, [roll, state.filmStockId]);
  const screeningOptions = () => ({ stockType: getFilmStock(state.filmStockId).type, reducedMotion: isReducedMotion });
  const startScreening = (mode: 'preview' | 'export') => {
    if (state.roomMode !== 'inspect' || state.loupe.isActive || state.isTransitioning) return;
    const session = new ScreeningSession(roll, screeningChoice, screeningOptions(), screeningCredits, state.viewportAspect);
    if (mode === 'export') session.pause(); else session.play();
    setScreeningPicker(false); setSheet(null); setScreening(session); setScreeningExport(mode === 'export' ? 'picker' : null);
  };
  useEffect(() => () => screening?.dispose(), [screening]);
  const exitScreening = () => {
    setScreeningExport(null); setScreening(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="screen-roll"]')?.focus({ preventScroll: true }));
  };
  useEffect(() => { setScreening(null); setScreeningExport(null); setScreeningPicker(false); }, [roll, state.roomMode]);
  useCameraNavigation(state, dispatch);
  const closeCamera = useCallback(() => dispatch({ type: 'CLOSE_CAMERA' }), []);
  const openCamera = useCallback((id: string) => dispatch({ type: 'OPEN_CAMERA', id }), []);
  useEffect(()=>setSheet(null),[state.roomMode]);
  useEffect(()=>{if(mobile)dispatch({type:'INPUT_TOUCH',active:true});else setSheet(null);},[mobile]);
  useEffect(() => { document.title = isGuest ? (roll.imported ? `${roll.label} — Your darkroom` : 'Your darkroom — Film Reverie') : 'Film Reverie — Published photographs'; }, [isGuest, roll]);
  const [cloudSource, setCloudSource] = useState<'gallery' | null>(null);
  const cloudDialogOpen = guestWelcome;
  const [editorOpen, setEditorOpen] = useState(false), [libraryError, setLibraryError] = useState("");
  const [editingRollId, setEditingRollId] = useState<string | undefined>();
  const [deletedRoll, setDeletedRoll] = useState<StoredRoll | null>(null);
  const shelfPortal = useRef<HTMLDivElement>(null);
  const shelfVisible = state.roomMode === 'room' && !state.cameraDisplay && !editorOpen && !cloudDialogOpen && !sheet && !hidden && !contextLost;
  const managedShelf = useFilmShelf(repository, shelfVisible && canManageRolls, canManageRolls, isGuest);
  const published = usePublishedShelf(!isGuest);
  const shelf = canManageRolls ? managedShelf : published.shelf;
  useEffect(() => { if (!state.shelfFocused && shelf.trash) shelf.changeTrash(false); }, [state.shelfFocused, shelf.trash]);
  useEffect(() => { if (!state.shelfFocused || state.shelfId !== 'film') shelf.arranger?.finish(); }, [state.shelfFocused, state.shelfId]);
  const arranger = shelf.arranger?.active ? shelf.arranger : undefined;
  const shelfRef = useRef(shelf); shelfRef.current = shelf;
  // The toolbar button or card that started arranging goes away; keep focus on a cubby.
  const focusCubby = (cell: string) => requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`.shelf-cell-label${cell} .shelf-roll-target`)?.focus({ preventScroll: true })));
  const moveRoll = (moving: StoredRoll) => { shelf.arranger?.start(moving.id); focusCubby(`[data-shelf-slot="${moving.shelfSlot}"]`); };
  // The development fixture is built in and has no saved-library entry.
  const tableRollAvailable = canManageRolls
    ? ((isGuest && roll.fixture) || !managedShelf.loaded || managedShelf.allRolls.some(saved => saved.id === roll.rollId && saved.trashedAt === null))
    : cloudSource !== null;
  const canEditCurrentRoll = canManageRolls && managedShelf.allRolls.some(saved => saved.id === roll.rollId && saved.trashedAt === null);
  const emptyRollMessage = tableRollAvailable ? undefined
    : isGuest ? 'No roll on the light table'
      : published.loading ? 'Loading published photographs…' : published.error || 'No published roll on the light table';
  const createAction = !isGuest ? <CreateYourOwnLink film /> : undefined;
  const ownerActions = isGuest ? undefined : <AdminMenu compact={state.roomMode === 'room' || !state.focusMode} loggedIn={adminLoggedIn} onTour={() => setTourWanted(true)} />;
  const openShelf = () => {
    void saveView().catch(error => setLibraryError(storageMessage(error)));
    shelf.close();
    if (canManageRolls) managedShelf.retry(); else published.refresh();
    setSheet(null); dispatch({ type: 'APPROACH_SHELF' });
  };
  const openEditor = (id?: string) => {
    if (!canManageRolls) return;
    openShelf(); shelf.changeTrash(false); setEditingRollId(id); setEditorOpen(true);
  };
  const openCameras = () => { void saveView().catch(error => setLibraryError(storageMessage(error))); shelf.close(); setSheet(null); dispatch({ type: 'APPROACH_CAMERA_SHELF' }); };
  const openTable = () => { shelf.close(); setSheet(null); dispatch({ type: 'APPROACH_TABLE' }); };
  const openRoom = () => { shelf.close(); setSheet(null); dispatch({ type: 'RETURN_TO_ROOM' }); };
  const deleteRoll = async (removed: StoredRoll) => {
    if (!canManageRolls) throw new Error('Admin login is required to manage rolls.');
    await repository.trash(removed.id); shelf.close(); setDeletedRoll(removed);
    if (isGuest && removed.id === roll.rollId) {
      try { localStorage.removeItem(guestActiveRollKey); } catch { /* Optional preference. */ }
    }
  };
  const restoreRoll = async (id: string) => { if (!canManageRolls) return; await repository.trash(id, false); shelf.close(); setDeletedRoll(null); };
  const ownedRuntime = useRef<ReturnType<typeof createRuntimeRoll> | null>(null), switchRequest = useRef(0);
  const stateRef = useRef(state); stateRef.current = state;
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveView = () => {
    const current = stateRef.current;
    if (!isGuest || !current.roll.imported || current.cameraMoving || current.isTransitioning || current.assetsLoading) return Promise.resolve();
    const rollId = current.roll.rollId;
    const stockId = current.filmStockId;
    const roomMode = current.roomMode;
    const view: SavedView = { filmScale: current.roll.scale, frameId: current.roll.frames[current.activeFrameIndex].id, level: current.inspectionLevel, mode: current.filmMode, brightness: current.tableBrightness, magnification: current.loupe.magnification, zoom: current.inspectZoom, pan: current.inspectPan, overview: current.savedOverview };
    const queued = saveQueue.current.catch(() => {}).then(() => repository.update(rollId, r => ({ ...r, stockId, view: roomMode === "inspect" ? view : r.view })));
    saveQueue.current = queued;
    return queued;
  };
  const openSaved = async (id: string, roomMode: RoomMode = 'inspect', onProgress?: ProgressReporter) => {
    if (!canManageRolls) throw new Error('Admin login is required to manage rolls.');
    const request = ++switchRequest.current;
    if (id !== stateRef.current.roll.rollId) await saveView();
    onProgress?.({ label: 'Loading roll details…' });
    const bundle = await repository.read(id, false, onProgress);
    if (bundle.roll.trashedAt !== null) throw new Error("This roll is in Trash. Restore it to open it.");
    const runtime = createRuntimeRoll(bundle);
    if (!isGuest) for (const frame of runtime.definition.frames) { delete frame.original; delete frame.loadOriginal; }
    try {
      onProgress?.({ label: 'Preparing the light table…' });
      // Decode the small overview before replacing the current roll; originals are never decoded here.
      await Promise.all(runtime.definition.frames.map(frame => new Promise<void>((resolve,reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error("Stored preview could not be loaded.")); img.src = frame.thumbnailSrc!; })));
      if (request !== switchRequest.current) { runtime.dispose(); return; }
      const previous = ownedRuntime.current; ownedRuntime.current = runtime;
      dispatch({ type: "LOAD_ROLL", roll: runtime.definition, stockId: bundle.roll.stockId, filmStrength: bundle.roll.filmStrength, view: runtime.view, roomMode });
      previous?.dispose(); setLibraryError(""); setCloudSource(null);
      const url = new URL(location.href); for (const key of ["fixture", "roll", "example"]) url.searchParams.delete(key); history.replaceState({}, "", url);
      try { if (isGuest) localStorage.setItem(guestActiveRollKey, id); } catch { /* IndexedDB remains authoritative. */ }
    } catch (error) { runtime.dispose(); throw error; }
  };
  const applyCloudRoll = (runtime: GalleryRuntime) => {
    const previous = ownedRuntime.current;
    ownedRuntime.current = runtime;
    dispatch({ type: 'LOAD_ROLL', roll: { ...runtime.definition, imported: false }, stockId: runtime.stockId, filmStrength: runtime.filmStrength, view: runtime.view });
    previous?.dispose();
    setCloudSource('gallery'); setLibraryError(''); shelf.close(); setSheet(null);
  };
  const openCloudRoll = async (runtime: GalleryRuntime) => {
    const request = ++switchRequest.current;
    try {
      await saveView();
      if (request !== switchRequest.current) { runtime.dispose(); return; }
      applyCloudRoll(runtime);
    } catch (error) { runtime.dispose(); throw error; }
  };

  // The tour lays the newest published roll on the table. Until one is ready
  // (or when nothing is published), it shows the bundled sample roll instead.
  const tourRoll = useRef<GalleryRuntime | null>(null);
  useEffect(() => {
    if (!touring || isGuest || cloudSource || published.loading) return;
    const newest = published.shelf.rolls.reduce<StoredRoll | undefined>((best, item) => !best || item.createdAt > best.createdAt ? item : best, undefined);
    if (!newest) return;
    let cancelled = false;
    void published.open(newest.id).then(runtime => {
      if (cancelled) runtime.dispose();
      else { tourRoll.current?.dispose(); tourRoll.current = runtime; }
    }).catch(() => { /* The sample roll stands in. */ });
    return () => { cancelled = true; };
  }, [touring, published.loading]);
  const tourShowcase = touring && !tableRollAvailable;
  const tableShowsRoll = tableRollAvailable || tourShowcase;
  const tourStage: TourStage = {
    state: () => stateRef.current,
    dispatch,
    reducedMotion: isReducedMotion,
    approachTable: () => {
      const runtime = tourRoll.current;
      tourRoll.current = null;
      shelf.close();
      if (runtime) { ++switchRequest.current; applyCloudRoll(runtime); }
      else dispatch({ type: 'APPROACH_TABLE' });
    },
    screen: () => {
      const current = stateRef.current;
      if (current.roomMode !== 'inspect' || current.loupe.isActive) return;
      const session = new ScreeningSession(current.roll, { reel: 'develop', pace: 'normal', tuning: {} }, { stockType: getFilmStock(current.filmStockId).type, reducedMotion: isReducedMotion }, screeningCredits, current.viewportAspect);
      // Join the reel as the table light comes on, just before the first frame develops.
      session.seek(Math.max(0, session.timeline.frameStart(0) - 1.6));
      setScreeningExport(null); setScreening(session);
    },
    pauseScreening: paused => { if (screening) { if (paused) screening.pause(); else screening.play(); } },
    endScreening: () => { if (screening) { setScreeningExport(null); setScreening(null); } },
  };
  const endTour = () => {
    setTouring(false); setTourWanted(false);
    tourRoll.current?.dispose(); tourRoll.current = null;
  };
  const mainRef = useRef<HTMLElement>(null);
  // The room stays visible but inert while the tour drives it.
  useEffect(() => { mainRef.current?.toggleAttribute('inert', touring); }, [touring]);
  useEffect(() => {
    if (!isGuest) return () => { ++switchRequest.current; ownedRuntime.current?.dispose(); };
    let id: string | null = null; try { id = localStorage.getItem(guestActiveRollKey); } catch { /* Library reports availability when opened. */ }
    const params = new URLSearchParams(location.search);
    if (id && !["fixture", "roll", "example"].some(key => params.has(key))) void openSaved(id, initialRoomMode).catch(error => setLibraryError(storageMessage(error)));
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
      if (touring || screening || screeningPicker) return;
      if (state.cameraDisplay || editorOpen || cloudDialogOpen || sheet==='frames') return;
      // Panel controls own their keys; the focused film can still move the loupe.
      if (sheet==='loupe' && !(e.key.startsWith('Arrow') && e.target instanceof HTMLElement && e.target.closest('.canvas-wrapper'))) return;
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
          const x = e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0, y = e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0;
          // Arrows move the loupe across the screen, which Focus turns for a vertical shot.
          const move = screenToTable(state.focusMode ? focusTableAngle(state.roll, state.activeFrameIndex).yaw : 0, x, y);
          dispatch({type:'MOVE_LOUPE',dx:move.x,dy:move.y});return;
        }
        const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const;
        if (e.key in directions) { e.preventDefault(); dispatch({ type: "NAVIGATE", direction: directions[e.key as keyof typeof directions] }); return; }
        if (e.key === "Enter") { e.preventDefault(); dispatch(state.loupe.isActive ? {type:'INSPECT_LOUPE'} : { type: "OPEN_FRAME", frameIndex: state.activeFrameIndex }); return; }
        if (/^[1-9]$/.test(e.key)) { dispatch({type:state.focusMode?'OPEN_FRAME':'SELECT_FRAME',frameIndex:Number(e.key)-1}); return; }
      }
      if (state.roomMode === "room") {
        const arranging = shelfRef.current.arranger;
        if (state.shelfFocused && e.key === "Escape" && arranging?.active) { e.preventDefault(); arranging.cancel(); return; }
        if (state.shelfFocused && e.key === "Escape") { e.preventDefault(); shelf.close(); dispatch({ type: "RETURN_TO_ROOM" }); return; }
        if (e.target instanceof HTMLElement && e.target.closest('button, input, select, textarea, [role="dialog"], [contenteditable="true"]')) return;
        const look: Record<string, [number, number]> = { ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, -.1], ArrowDown: [0, .1] };
        if (look[e.key]) { e.preventDefault(); dispatch({ type: "LOOK_ROOM", yaw: look[e.key][0], pitch: look[e.key][1] }); return; }
        if (!e.metaKey && !e.ctrlKey && ["+", "=", "-", "_"].includes(e.key)) { e.preventDefault(); dispatch({ type: "ZOOM_ROOM", factor: e.key === "-" || e.key === "_" ? 1 / 1.25 : 1.25 }); return; }
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
  }, [state.cameraDisplay, state.roomMode, state.adjustingView, state.shelfFocused, state.focusMode, state.activeFrameIndex, state.isTransitioning, state.tableBrightness, state.loupe, roll, editorOpen, cloudDialogOpen, sheet, screening, screeningPicker, touring]);

  const localError = new URLSearchParams(window.location.search).get("roll") === "local" ? validateRoll(LOCAL_ROLL) : null;
  if (localError) return <>
    <DarkroomLoadingPage progress={loadingProgress} hasError />
    <main className="darkroom-error-fallback"><div className="error-card" role="alert"><h2>Local roll unavailable</h2><p>{localError}</p><a href={isGuest ? "/guest?mode=room" : "/?mode=room"}>Return to shelf</a></div></main>
  </>;

  return (
    <div className="app-shell">
      <UpdateNotice beforeUpdate={async () => {
        if (stateRef.current.cameraMoving || stateRef.current.isTransitioning || stateRef.current.assetsLoading) throw new Error("Wait for the photograph to finish opening before updating.");
        await saveView();
      }} />
      <DarkroomLoadingPage
        progress={{ ...loadingProgress, cameraSettled, cameraLoaded: cameraProgress.loaded, cameraTotal: cameraProgress.total, cameraFailed: cameraProgress.failed, settled: loadingProgress.settled && cameraSettled }}
        onRetryCameras={cameraProgress.retry}
        isDeterministic={isDeterministic}
        isReducedMotion={isReducedMotion}
        hasError={injectedError || !!state.error}
        onFullyLoaded={handleFullyLoaded}
      />
    <main
      ref={mainRef}
      className={`darkroom-app-container ${roll !== BASELINE_ROLL ? "full-roll" : ""} ${mobile?'mobile-layout':''} ${state.roomMode==='inspect'?'table-layout':''}`}
      data-table-mode={state.focusMode?'focus':'overview'}
      data-roll-id={tableRollAvailable ? roll.rollId : ''}
      data-film-format={roll.format ?? "135"}
      data-inspection-level={state.inspectionLevel}
      data-selected-frame={state.activeFrameIndex + 1}
      data-assets-ready={!state.assetsLoading}
      data-app-ready={appReady && cameraSettled ? "true" : "false"}
      data-cameras-ready={cameraSettled ? "true" : "false"}
      data-inspect-zoom={state.inspectZoom}
      data-table-angle={`${state.tableAngle.tilt},${state.tableAngle.yaw}`}
      data-adjusting-view={state.adjustingView}
      data-inspect-pan={`${state.inspectPan.x},${state.inspectPan.z}`}
      data-shelf-trash={shelf.trash}
      data-shelf-arranging={!!arranger}
      data-shelf-carrying={arranger?.carrying ?? ''}
      data-shelf-target={arranger?.target ?? ''}
      data-table-roll-available={tableRollAvailable}
      data-shelf-focused={state.shelfFocused}
      data-shelf-roll-focused={shelf.selection?.pinned && state.shelfId === 'film' ? shelf.selection.id : ''}
      data-shelf-id={state.shelfId ?? ''}
      data-camera-display={state.cameraDisplay ?? ''}
      data-room-mode={state.roomMode}
      data-room-pose={`${state.savedRoomPose.yaw},${state.savedRoomPose.pitch}`}
      data-room-zoom={state.savedRoomPose.zoom ?? 1}
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
      data-loupe-type={state.loupe.type}
      data-loupe-size={state.loupe.size}
      data-active-frame={state.loupe.frameIndex + 1}
      data-reduced-motion={isReducedMotion ? "true" : "false"}
      data-screening={screening ? screeningExport ? 'export' : 'preview' : ''}
      data-screening-reel={screening?.choice.reel ?? ''}
      data-intro-tour={touring}
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
              frameloop={state.cameraDisplay || editorOpen || cloudDialogOpen || sheet === 'frames' || hidden || contextLost || screeningExporting ? "never" : "always"}
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
                showRoll={tableShowsRoll}
                readOnlyShelf={!canManageRolls}
                coverSource={canManageRolls ? managedCoverSource : published.cover}
                shelf={shelf}
                shelfPortal={shelfPortal}
                inputBlocked={touring || !!state.cameraDisplay || editorOpen || cloudDialogOpen || sheet==='frames' || (state.roomMode==='room' && !!sheet) || hidden || contextLost || !!screening || screeningPicker}
                state={state}
                dispatch={dispatch}
                isDeterministic={isDeterministic}
                isReducedMotion={isReducedMotion}
                onLoadProgress={handleLoadProgress}
                onFirstFrameRendered={handleFirstFrameRendered}
                onCameraSettled={handleCameraSettled}
                screening={screening}
              />
              {touring && <TourAnchors />}
            </Canvas>
          </div>
        </Suspense>
      )}

      {contextLost&&<div className="context-recovery" role="alert"><p>The graphics view was interrupted. Your rolls are saved.</p><button onClick={()=>{setContextLost(false);setCanvasVersion(v=>v+1);}}>Restore view</button></div>}
      <div ref={shelfPortal} className="shelf-overlay" aria-label="Saved-roll shelf" style={{ display: shelfVisible ? undefined : 'none' }} />
      {shelfVisible && state.shelfFocused && state.shelfId === 'film' && !shelf.selection?.pinned && <>
        <section className="shelf-toolbar" aria-label="Film shelf actions">
          <div className="shelf-toolbar-summary">
            <svg className="shelf-archive-icon" width="30" height="36" viewBox="0 0 30 36" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><rect x="4" y="3" width="22" height="30" rx="2"/><path d="M10 3v30M20 3v30M10 13h10M10 23h10"/><path d="M6.5 7h1M6.5 12h1M6.5 17h1M6.5 22h1M6.5 27h1M22.5 7h1M22.5 12h1M22.5 17h1M22.5 22h1M22.5 27h1" strokeWidth="2"/></svg>
            <div className="shelf-toolbar-identity">
              <h2>{arranger ? 'Arranging shelf' : shelf.trash ? 'Trash' : canManageRolls ? 'Your collection' : 'Published gallery'}</h2>
              <span>{shelf.trash ? shelf.trashCount : shelf.savedCount} {shelf.trash ? 'deleted' : canManageRolls ? 'saved' : 'published'} {(shelf.trash ? shelf.trashCount : shelf.savedCount) === 1 ? 'roll' : 'rolls'}</span>
            </div>
          </div>
          {arranger ? <div className="shelf-toolbar-actions">
            <button className="shelf-new-roll shelf-arrange-done" onClick={arranger.finish}>Done</button>
          </div> : canManageRolls && <div className="shelf-toolbar-actions">
            <button className="shelf-new-roll" onClick={() => openEditor()}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>New roll</button>
            <button className="shelf-trash" aria-label={shelf.trash ? 'Saved rolls' : `Trash (${shelf.trashCount})`} onClick={() => shelf.changeTrash(!shelf.trash)}>
              <svg width="16" height="18" viewBox="0 0 18 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shelf.trash ? <path d="M14 5H4m0 0 4-4M4 5l4 4M4 5h6a6 6 0 0 1 0 12H5"/> : <><path d="M2 5h14M7 2h4l1 3M6 5l1-3M4 5l1 13h8l1-13M7 8v7M11 8v7"/></>}</svg>
              {shelf.trash ? 'Saved rolls' : <>Trash<span className="shelf-trash-count" aria-hidden="true">{shelf.trashCount}</span></>}
            </button>
            {!shelf.trash && shelf.arranger && shelf.savedCount > 0 && <button className="shelf-arrange" onClick={() => { shelf.arranger!.start(); focusCubby('.is-owned'); }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2v12M5 2 2.5 4.5M5 2l2.5 2.5M11 14V2m0 12-2.5-2.5M11 14l2.5-2.5"/></svg>
              Arrange
            </button>}
          </div>}
          {shelf.pages > 1 && <nav aria-label="Shelf pages">
            <button aria-label="Previous shelf page" data-shelf-page="-1" disabled={shelf.page === 0} onClick={() => shelf.changePage(shelf.page - 1)}>‹</button>
            <span>Page {shelf.page + 1}/{shelf.pages}</span>
            <button aria-label="Next shelf page" data-shelf-page="1" disabled={shelf.page + 1 === shelf.pages} onClick={() => shelf.changePage(shelf.page + 1)}>›</button>
          </nav>}
          {arranger ? <p className="shelf-toolbar-hint" role="status">{arranger.status}</p> : <p className="shelf-toolbar-hint">{shelf.trash ? 'Select a roll to restore it.' : canManageRolls ? 'Select a roll to open, edit or delete it.' : 'Select a roll to view its photographs.'}</p>}
        </section>
        {canManageRolls && !deletedRoll && shelf.arranger?.lastMove && <div className="library-notice"><span>Moved {shelf.arranger.lastMove.name}</span><button onClick={shelf.arranger.undo}>Undo</button><button aria-label="Dismiss move notice" onClick={shelf.arranger.dismiss}>×</button></div>}
        {canManageRolls && deletedRoll && <div className="library-notice" role="status"><span>{deletedRoll.name} moved to Trash</span><button onClick={() => { void restoreRoll(deletedRoll.id).catch(error => setLibraryError(storageMessage(error))); }}>Undo</button><button aria-label="Dismiss deletion notice" onClick={() => setDeletedRoll(null)}>×</button></div>}
        {shelf.error && <div className="library-notice" role="alert">{shelf.error}<button onClick={shelf.retry}>Retry</button></div>}
      </>}
      {shelfVisible && state.shelfId === 'film' && shelf.selectedRoll && shelf.selection?.pinned && <ShelfRollCard
        key={shelf.selectedRoll.id}
        shelf={shelf}
        roll={shelf.selectedRoll}
        repository={canManageRolls ? repository : undefined}
        readOnly={!canManageRolls}
        thumbnailUrl={!canManageRolls ? published.thumbnail(shelf.selectedRoll.id) : undefined}
        activeId={canManageRolls ? tableRollAvailable ? roll.rollId : "" : cloudSource === 'gallery' ? shelf.rolls.find(item => roll.rollId.startsWith(`gallery:${item.id}:`))?.id ?? '' : ''}
        onOpen={canManageRolls ? (id, report) => openSaved(id, 'inspect', report) : async (id, report) => {
          const runtime = await published.open(id, { onProgress: progress => report?.({
            // Checking each image is part of opening: keep the label and
            // measured bar steady while the checksum is verified.
            label: 'Opening photographs…',
            detail: `${progress.completedImages} / ${progress.totalImages} photographs · ${Math.floor(progress.receivedBytes / progress.totalBytes * 100)}% downloaded`,
            completed: progress.receivedBytes, total: progress.totalBytes,
          }) });
          report?.({ label: 'Preparing the light table…' });
          await openCloudRoll(runtime);
        }}
        onEdit={canManageRolls ? openEditor : undefined}
        onDelete={canManageRolls ? deleteRoll : undefined}
        onRestore={canManageRolls ? restoreRoll : undefined}
        onMove={canManageRolls && shelf.arranger ? moveRoll : undefined}
      />}
      {!state.cameraDisplay && (state.roomMode === 'room'
        ? mobile
          ? <MobileControls state={state} dispatch={dispatch} onOpenLibrary={openShelf} onOpenRoom={openRoom} onOpenTable={openTable} onOpenCameras={openCameras} sheet={sheet} setSheet={setSheet} emptyRollMessage={emptyRollMessage} ownerActions={ownerActions} createAction={createAction} />
          : <Controls state={state} dispatch={dispatch} onOpenLibrary={openShelf} onOpenRoom={openRoom} onOpenTable={openTable} onOpenCameras={openCameras} sheet={sheet} setSheet={setSheet} emptyRollMessage={emptyRollMessage} ownerActions={ownerActions} createAction={createAction} />
        : !tableShowsRoll
          ? <div className="empty-film-table">
              <MobileControls roomOnly state={state} dispatch={dispatch} onOpenLibrary={openShelf} onOpenRoom={openRoom} onOpenTable={openTable} onOpenCameras={openCameras} sheet={sheet} setSheet={setSheet} ownerActions={ownerActions} createAction={createAction} />
              <p>{emptyRollMessage}</p>
            </div>
          : screening
            ? <ScreeningPlayer session={screening} onExit={exitScreening} onExport={() => { screening.pause(); setScreeningExport('preview'); }} />
            : <TableControls state={state} dispatch={dispatch} onOpenLibrary={openShelf} onOpenRoom={openRoom} onOpenTable={openTable} onOpenCameras={openCameras} sheet={sheet} setSheet={setSheet} ownerActions={ownerActions} createAction={createAction} onScreen={() => setScreeningPicker(true)} onEditRoll={canEditCurrentRoll ? () => openEditor(roll.rollId) : undefined} />)}
      {screeningPicker && !screening && <ScreeningPicker choice={screeningChoice} onChange={setScreeningChoice} frames={roll.frames.length} reducedMotion={isReducedMotion}
        durationFor={choice => createScreeningTimeline(roll, { ...screeningOptions(), reel: choice.reel, pace: choice.pace, tuning: choice.tuning[choice.reel], aspect: 16 / 9 }).duration}
        onClose={() => setScreeningPicker(false)} onPreview={() => startScreening('preview')} onExport={() => startScreening('export')} />}
      {screening && screeningExport && <Suspense fallback={<div className="screening-export" role="status">Preparing video export…</div>}>
        <ScreeningExportView session={screening} initialFormat={screeningFormat} onFormat={setScreeningFormat} fileName={screeningFileName(screeningCredits.title, screening.choice.reel)}
          maxSeconds={isDeterministic && Number(new URLSearchParams(location.search).get('screening_seconds')) > 0 ? Number(new URLSearchParams(location.search).get('screening_seconds')) : undefined}
          onClose={started => {
            if (screeningExport !== 'picker') setScreeningExport(null);
            // Cancelling the format step from the picker returns to the picker.
            else if (started) exitScreening();
            else { setScreeningExport(null); setScreening(null); setScreeningPicker(true); }
          }} />
      </Suspense>}
      {state.cameraDisplay && <CameraDisplayView id={state.cameraDisplay} onBack={closeCamera} onNavigate={openCamera} reducedMotion={isReducedMotion} />}
      {libraryError && <div className="library-notice" role="alert">{libraryError}<button onClick={() => { setLibraryError(""); openShelf(); }}>Open shelf</button></div>}
      {editorOpen && <RollEditor publication={!isGuest} repository={repository} onDelete={deleteRoll} editId={editingRollId} onClose={() => { setEditorOpen(false); setEditingRollId(undefined); }} onOpen={(id, report) => openSaved(id, 'inspect', report)} onSaved={async (id, report) => {
        // Keep the current table's data fresh without changing rooms. Otherwise a
        // later saved view could restore the old stock over the user's edits.
        if (id === stateRef.current.roll.rollId) await openSaved(id, stateRef.current.roomMode, report);
      }} />}
      {isGuest && guestWelcome && <GuestWelcome onClose={() => { try { localStorage.setItem(guestWelcomeKey, 'done'); } catch { /* Browsing can continue when localStorage is blocked. */ } setGuestWelcome(false); }} />}
    </main>
      {touring && <IntroTour stage={tourStage} onClose={endTour} createHref="/guest?welcome=1" />}
    </div>
  );
}

export default App;
