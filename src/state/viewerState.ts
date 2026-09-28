import { createRollLayout, BASELINE_ROLL, RollDefinition, InspectionLevel, locateFrame, mapRollPoint, fitRollView, clampRollPan, clampFocusPan, anchoredZoom } from "../utils/rollLayout";
import { DEFAULT_FILM_STOCK_ID, FilmStockId, getFilmStock, isFilmStockId } from "../data/filmStocks";
import { DEFAULT_LAYOUT, getFrameCenter } from "../utils/loupeMapping";
import { clampLoupePosition, isLoupeSize, isLoupeType, LOUPE_SIZE_SCALE, type LoupeSize, type LoupeType } from '../utils/loupeView';
import {
  DEFAULT_ROOM_POSE,
  RoomCameraPose,
  clampRoomPose,
  DEFAULT_TABLE_BRIGHTNESS,
  TABLE_CENTER_Z,
  clampInspectZoom,
  clampInspectPan,
  clampTableBrightness,
} from "../utils/cameraBounds";

import { TableAngle, TOP_DOWN, clampTableAngle } from "../utils/tableCamera";
import { clampFilmStrength, DEFAULT_FILM_STRENGTH } from "../data/filmLooks";

export type FilmMode = "negative" | "positive";
export type RoomMode = "inspect" | "room";

export interface LoupeState {
  type: LoupeType;
  size: LoupeSize;
  isActive: boolean;
  inspecting: boolean;
  opticalEffects: boolean;
  scale: number;
  worldX: number;
  worldY: number;
  frameIndex: number;
  u: number;
  v: number;
  isOverFrame: boolean;
  magnification: number;
}

export interface ViewerState {
  tableAngle: TableAngle;
  adjustingView: boolean;
  angleDragging: boolean;
  touchInput: boolean;
  touchPointer: boolean;
  roll: RollDefinition;
  inspectionLevel: InspectionLevel;
  viewportAspect: number;
  savedOverview: { zoom: number; pan: { x: number; z: number }; frameIndex: number } | null;
  roomMode: RoomMode;
  shelfFocused: boolean;
  shelfId: 'film' | 'camera' | null;
  cameraDisplay: string | null;
  filmMode: FilmMode;
  filmStockId: FilmStockId;
  filmStrength: number;
  loupe: LoupeState;
  activeFrameIndex: number;
  cameraMoving: boolean;
  transitionKind: "journey" | "shelf" | "inspection" | "loupe" | null;
  settledFrameIndex: number;
  focusMode: boolean;
  isTransitioning: boolean;
  savedRoomPose: RoomCameraPose;
  inspectZoom: number;
  inspectPan: { x: number; z: number };
  tableBrightness: number;
  roomBrightness: number;
  lastRoomBrightness: number;
  assetFailures: string[];
  assetsLoading: boolean;
  assetRetry: number;
  detailStatus: string;
  error: string | null;
}

const defaultFrameCenter = getFrameCenter(0, DEFAULT_LAYOUT);

export const INITIAL_VIEWER_STATE: ViewerState = {
  tableAngle: TOP_DOWN,
  adjustingView: false,
  angleDragging: false,
  touchInput: false,
  touchPointer: false,
  roll: BASELINE_ROLL,
  inspectionLevel: "roll",
  viewportAspect: 1.5,
  savedOverview: null,
  roomMode: "inspect",
  shelfFocused: false,
  shelfId: null,
  cameraDisplay: null,
  filmMode: "positive",
  filmStockId: DEFAULT_FILM_STOCK_ID,
  filmStrength: DEFAULT_FILM_STRENGTH,
  loupe: {
    type: 'classic',
    size: 'medium',
    isActive: false,
    inspecting: false,
    opticalEffects: true,
    scale: BASELINE_ROLL.scale * LOUPE_SIZE_SCALE.medium,
    worldX: defaultFrameCenter.x,
    worldY: defaultFrameCenter.y,
    frameIndex: 0,
    u: 0.5,
    v: 0.5,
    isOverFrame: true,
    magnification: 4,
  },
  activeFrameIndex: 0,
  cameraMoving: false,
  transitionKind: null,
  settledFrameIndex: 0,
  focusMode: false,
  isTransitioning: false,
  savedRoomPose: { ...DEFAULT_ROOM_POSE },
  inspectZoom: fitRollView(BASELINE_ROLL, "roll", 0).zoom,
  inspectPan: { x: 0, z: TABLE_CENTER_Z },
  tableBrightness: DEFAULT_TABLE_BRIGHTNESS,
  roomBrightness: .45,
  lastRoomBrightness: .45,
  assetFailures: [],
  assetsLoading: true,
  assetRetry: 0,
  detailStatus: "",
  error: null,
};

export function createInitialViewerState(initialRoomMode: RoomMode = "inspect", roll: RollDefinition = BASELINE_ROLL): ViewerState {
  return {
    ...INITIAL_VIEWER_STATE,
    roomMode: initialRoomMode,
    roll,
    loupe: { ...INITIAL_VIEWER_STATE.loupe, scale: roll.scale * LOUPE_SIZE_SCALE[INITIAL_VIEWER_STATE.loupe.size], worldX: locateFrame(roll, 0).x, worldY: locateFrame(roll, 0).y },
    savedRoomPose: { ...DEFAULT_ROOM_POSE },
    inspectZoom: fitRollView(roll, "roll", 0).zoom,
    inspectPan: { x: 0, z: TABLE_CENTER_Z },
    tableBrightness: DEFAULT_TABLE_BRIGHTNESS,
  roomBrightness: .45,
  lastRoomBrightness: .45,
    error: null,
  };
}

export type ViewerAction =
  | { type: "SET_ADJUSTING_VIEW"; active: boolean }
  | { type: "SET_ANGLE_DRAGGING"; active: boolean }
  | { type: "SET_TABLE_ANGLE"; angle: TableAngle }
  | { type: "ADJUST_TABLE_ANGLE"; tilt: number; yaw: number }
  | { type: "TOP_DOWN" }
  | { type: "INSPECT_LOUPE" }
  | { type: "PULL_BACK_LOUPE" }
  | { type: "SET_LOUPE_EFFECTS"; enabled: boolean }
  | { type: "SET_LOUPE_TYPE"; loupeType: LoupeType }
  | { type: "SET_LOUPE_SIZE"; size: LoupeSize }
  | { type: "MOVE_LOUPE"; dx: number; dy: number }
  | { type: "INPUT_TOUCH"; active: boolean }
  | { type: "TOUCH_POINTER"; active: boolean }
  | { type: "FIT_VIEW" }
  | { type: "TOUCH_VIEW"; zoom: number; x: number; z: number }
  | { type: "TOGGLE_FOCUS" }
  | { type: "SHOW_OVERVIEW" }
  | { type: "FACE_TABLE" }
  | { type: "LOOK_ROOM"; yaw: number; pitch: number }
  | { type: "SET_ROOM_BRIGHTNESS"; brightness: number }
  | { type: "TOGGLE_ROOM_LIGHTS" }
  | { type: "LOAD_ROLL"; roll: RollDefinition; stockId?: FilmStockId; filmStrength?: number; view?: import("../storage/rollRepository").SavedView; roomMode?: RoomMode }
  | { type: "CAMERA_MOTION"; moving: boolean }
  | { type: "ASSET_STATUS"; failures: string[]; loading: boolean; detailStatus?: string }
  | { type: "RETRY_ASSETS" }
  | { type: "OPEN_FRAME"; frameIndex: number }
  | { type: "VIEW_LEVEL"; level: InspectionLevel; stripIndex?: number }
  | { type: "NAVIGATE"; direction: "left" | "right" | "up" | "down" }
  | { type: "ESCAPE_INSPECTION" }
  | { type: "VIEWPORT"; aspect: number }
  | { type: "ZOOM_AT"; delta: number; x: number; z: number }
  | { type: "SET_FILM_STOCK"; stockId: FilmStockId }
  | { type: "SET_FILM_STRENGTH"; strength: number }
  | { type: "SET_FILM_MODE"; mode: FilmMode }
  | { type: "TOGGLE_FILM_MODE" }
  | { type: "SET_LOUPE_ACTIVE"; active: boolean }
  | { type: "TOGGLE_LOUPE" }
  | { type: "SELECT_FRAME"; frameIndex: number }
  | { type: "SET_LOUPE_POSITION"; x: number; y: number }
  | { type: "SET_ROOM_MODE"; mode: RoomMode }
  | { type: "APPROACH_SHELF" }
  | { type: "APPROACH_CAMERA_SHELF" }
  | { type: "OPEN_CAMERA"; id: string }
  | { type: "CLOSE_CAMERA" }
  | { type: "APPROACH_TABLE" }
  | { type: "RETURN_TO_ROOM" }
  | { type: "SET_TRANSITIONING"; isTransitioning: boolean }
  | { type: "UPDATE_ROOM_POSE"; pose: Partial<RoomCameraPose> }
  | { type: "SET_TABLE_ZOOM"; zoom: number }
  | { type: "ADJUST_TABLE_ZOOM"; delta: number }
  | { type: "SET_TABLE_PAN"; x: number; z: number }
  | { type: "ADJUST_TABLE_PAN"; dx: number; dz: number }
  | { type: "RESET_TABLE_VIEW" }
  | { type: "SET_LOUPE_MAGNIFICATION"; magnification: number }
  | { type: "ADJUST_LOUPE_MAGNIFICATION"; delta: number }
  | { type: "SET_TABLE_BRIGHTNESS"; brightness: number }
  | { type: "ADJUST_TABLE_BRIGHTNESS"; delta: number }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RETRY" }
  | { type: "RESET" };

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  // Inspection owns the camera. Neither wheel, pinch, reset nor frame shortcuts
  // can change its distance (or the table pose to which Pull back returns).
  if ((state.loupe.inspecting || state.transitionKind === 'loupe') && [
    'ZOOM_AT', 'SET_TABLE_ZOOM', 'ADJUST_TABLE_ZOOM', 'TOUCH_VIEW',
    'SET_TABLE_PAN', 'ADJUST_TABLE_PAN', 'FIT_VIEW', 'RESET_TABLE_VIEW',
    'OPEN_FRAME', 'SELECT_FRAME', 'NAVIGATE', 'VIEW_LEVEL', 'TOGGLE_FOCUS', 'SHOW_OVERVIEW',
  ].includes(action.type)) return state;
  const multi = state.roll !== BASELINE_ROLL || state.touchInput;
  const maxZoom = state.focusMode ? fitRollView(state.roll, "frame", state.activeFrameIndex, state.viewportAspect).zoom : Math.max(3.6, fitRollView(state.roll, "roll", 0, state.viewportAspect).zoom);
  const safeZoom = (zoom: number) => state.focusMode || multi ? Math.max(0.12 * state.roll.scale, Math.min(maxZoom, zoom)) : clampInspectZoom(zoom);
  const safePan = (x: number, z: number, zoom = state.inspectZoom) => state.focusMode ? clampFocusPan(state.roll, state.activeFrameIndex, zoom, state.viewportAspect, x, z) : multi ? clampRollPan(state.roll, x, z) : clampInspectPan(x, z);
  switch (action.type) {
    case "SET_ADJUSTING_VIEW":
      if (action.active && (state.roomMode !== 'inspect' || state.focusMode || state.loupe.inspecting || state.isTransitioning)) return state;
      return { ...state, adjustingView: action.active, angleDragging: false };
    case "SET_ANGLE_DRAGGING":
      return state.angleDragging === action.active ? state : { ...state, angleDragging: action.active };
    case "ADJUST_TABLE_ANGLE":
      return viewerReducer(state, { type: 'SET_TABLE_ANGLE', angle: { tilt: state.tableAngle.tilt + action.tilt, yaw: state.tableAngle.yaw + action.yaw } });
    case "SET_TABLE_ANGLE":
    case "TOP_DOWN": {
      if (state.roomMode !== 'inspect' || state.focusMode || state.loupe.inspecting || state.isTransitioning) return state;
      const angle = action.type === 'TOP_DOWN' ? TOP_DOWN : action.angle;
      if (![angle.tilt, angle.yaw].every(Number.isFinite)) return state;
      return { ...state, tableAngle: clampTableAngle(angle) };
    }
    case "INSPECT_LOUPE":
      if (!state.loupe.isActive || state.loupe.inspecting || state.roomMode !== 'inspect' || state.isTransitioning) return state;
      return { ...state, adjustingView: false, angleDragging: false, loupe: { ...state.loupe, inspecting: true }, isTransitioning: true, transitionKind: 'loupe' };
    case "PULL_BACK_LOUPE":
      if (!state.loupe.inspecting) return state;
      return { ...state, loupe: { ...state.loupe, inspecting: false }, isTransitioning: true, transitionKind: 'loupe' };
    case "SET_LOUPE_EFFECTS":
      return { ...state, loupe: { ...state.loupe, opticalEffects: action.enabled } };
    case "SET_LOUPE_TYPE":
      return isLoupeType(action.loupeType) ? { ...state, loupe: { ...state.loupe, type: action.loupeType } } : state;
    case "SET_LOUPE_SIZE":
      return isLoupeSize(action.size) ? { ...state, loupe: { ...state.loupe, size: action.size, scale: state.roll.scale * LOUPE_SIZE_SCALE[action.size] } } : state;
    case "MOVE_LOUPE":
      if (!state.loupe.isActive || state.isTransitioning || ![action.dx, action.dy].every(Number.isFinite)) return state;
      return viewerReducer(state, { type: 'SET_LOUPE_POSITION', x: state.loupe.worldX + action.dx, y: state.loupe.worldY + action.dy });
    case "TOUCH_POINTER": return state.touchPointer===action.active?state:{...state,touchPointer:action.active};
    case "INPUT_TOUCH": {
      if(state.touchInput===action.active)return state;
      const fit=fitRollView(state.roll,state.inspectionLevel,state.activeFrameIndex,state.viewportAspect);
      return { ...state, touchInput: action.active, ...(action.active&&state.roll===BASELINE_ROLL&&state.inspectionLevel==='roll'?{inspectZoom:fit.zoom}:{} ) };
    }
    case "FIT_VIEW": {
      if (state.roomMode !== "inspect") return state;
      const fit = fitRollView(state.roll, state.inspectionLevel, state.activeFrameIndex, state.viewportAspect);
      return { ...state, inspectZoom: fit.zoom, inspectPan: fit.pan, isTransitioning: false, transitionKind: null };
    }
    case "TOUCH_VIEW": {
      if (state.roomMode !== "inspect" || ![action.zoom, action.x, action.z].every(Number.isFinite)) return state;
      return { ...state, touchInput: true, inspectZoom: safeZoom(action.zoom), inspectPan: safePan(action.x, action.z, safeZoom(action.zoom)), isTransitioning: false, transitionKind: null };
    }
    case "TOGGLE_FOCUS": return state.roomMode === "inspect" ? viewerReducer(state, state.focusMode ? { type: "SHOW_OVERVIEW" } : { type: "OPEN_FRAME", frameIndex: state.activeFrameIndex }) : state;
    case "SHOW_OVERVIEW": {
      if (state.roomMode !== "inspect") return state;
      const view = state.savedOverview ?? fitRollView(state.roll, "roll", state.activeFrameIndex, state.viewportAspect);
      return { ...state, focusMode: false, inspectionLevel: "roll", inspectZoom: view.zoom, inspectPan: view.pan, savedOverview: null, loupe: { ...state.loupe, isActive: false }, isTransitioning: true, transitionKind: "inspection" };
    }
    case "SET_ROOM_BRIGHTNESS": {
      if (!Number.isFinite(action.brightness)) return state;
      const value = Math.max(0, Math.min(1, action.brightness));
      return { ...state, roomBrightness: value, lastRoomBrightness: value > 0 ? value : state.lastRoomBrightness };
    }
    case "TOGGLE_ROOM_LIGHTS":
      return { ...state, roomBrightness: state.roomBrightness > 0 ? 0 : state.lastRoomBrightness };
    case "FACE_TABLE":
      if (state.shelfFocused) return viewerReducer(state, { type: "RETURN_TO_ROOM" });
      return state.roomMode === "room" && (!state.isTransitioning || state.transitionKind === 'shelf' || state.transitionKind === 'journey') ? { ...state, savedRoomPose: { ...DEFAULT_ROOM_POSE } } : state;
    case "LOOK_ROOM":
      return viewerReducer(state, { type: "UPDATE_ROOM_POSE", pose: { yaw: state.savedRoomPose.yaw + action.yaw, pitch: state.savedRoomPose.pitch + action.pitch } });
    case "LOAD_ROLL": {
      let next = createInitialViewerState("inspect", action.roll);
      next.savedRoomPose = state.savedRoomPose;
      next.loupe.opticalEffects = state.loupe.opticalEffects;
      next.loupe.magnification = state.loupe.magnification;
      next.loupe.type = state.loupe.type;
      next.loupe.size = state.loupe.size;
      next.loupe.scale = action.roll.scale * LOUPE_SIZE_SCALE[state.loupe.size];
      next.touchInput = state.touchInput;
      next.touchPointer = state.touchPointer;
      next.viewportAspect = state.viewportAspect;
      next.inspectZoom = fitRollView(action.roll, "roll", 0, state.viewportAspect).zoom;
      next = viewerReducer(next, { type: "SET_FILM_STOCK", stockId: action.stockId ?? DEFAULT_FILM_STOCK_ID });
      next.filmStrength = clampFilmStrength(action.filmStrength);
      const v = action.view;
      if (v) {
        const index = Math.max(0, action.roll.frames.findIndex(f => f.id === v.frameId));
        next = viewerReducer(next, { type: "SELECT_FRAME", frameIndex: index });
        next = viewerReducer(next, { type: "VIEW_LEVEL", level: ["roll", "strip", "frame"].includes(v.level) ? v.level : "roll" });
        next = viewerReducer(next, { type: "SET_FILM_MODE", mode: v.mode });
        next = viewerReducer(next, { type: "SET_TABLE_BRIGHTNESS", brightness: Number.isFinite(v.brightness) ? v.brightness : 1 });
        next = viewerReducer(next, { type: "SET_LOUPE_MAGNIFICATION", magnification: Number.isFinite(v.magnification) ? v.magnification : 4 });
        if (Number.isFinite(v.zoom) && Number.isFinite(v.pan?.x) && Number.isFinite(v.pan?.z)) {
          next = viewerReducer(next, { type: "SET_TABLE_ZOOM", zoom: v.zoom });
          next = viewerReducer(next, { type: "SET_TABLE_PAN", ...v.pan });
        }
        next.savedOverview = next.focusMode && v.overview && Number.isFinite(v.overview.zoom) && Number.isFinite(v.overview.pan?.x) && Number.isFinite(v.overview.pan?.z) ? { zoom: Math.max(.1,Math.min(Math.max(3.6,fitRollView(action.roll,'roll',0,state.viewportAspect).zoom),v.overview.zoom)), pan: clampRollPan(action.roll,v.overview.pan.x,v.overview.pan.z), frameIndex: locateFrame(action.roll,v.overview.frameIndex).globalIndex } : next.savedOverview;
      }
      const roomMode = action.roomMode ?? 'inspect';
      return { ...next, roomMode, roomBrightness: state.roomBrightness, lastRoomBrightness: state.lastRoomBrightness, savedRoomPose: state.savedRoomPose, viewportAspect: state.viewportAspect, isTransitioning: roomMode === 'inspect', transitionKind: roomMode === 'inspect' ? "journey" : null };
    }
    case "CAMERA_MOTION": {
      if (state.cameraMoving === action.moving) return state;
      return { ...state, cameraMoving: action.moving };
    }
    case "ASSET_STATUS": return { ...state, assetFailures: action.failures, assetsLoading: action.loading, detailStatus: action.detailStatus ?? "" };
    case "RETRY_ASSETS": return { ...state, assetRetry: state.assetRetry + 1 };
    case "VIEWPORT": {
      if (Math.abs(state.viewportAspect - action.aspect) < 0.001) return state;
      const fit = fitRollView(state.roll, state.inspectionLevel, state.activeFrameIndex, action.aspect);
      const prior = fitRollView(state.roll, state.inspectionLevel, state.activeFrameIndex, state.viewportAspect);
      const zoom = fit.zoom * state.inspectZoom / prior.zoom;
      return { ...state, viewportAspect: action.aspect, ...(multi || state.focusMode ? { inspectZoom: zoom, inspectPan: state.focusMode ? clampFocusPan(state.roll, state.activeFrameIndex, zoom, action.aspect, state.inspectPan.x, state.inspectPan.z) : state.inspectPan } : {}) };
    }
    case "OPEN_FRAME": {
      if (state.roomMode !== "inspect" || (state.isTransitioning && state.transitionKind !== "inspection" && state.transitionKind !== "journey")) return state;
      const selected = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: action.frameIndex });
      const fit = fitRollView(state.roll, "frame", selected.activeFrameIndex, state.viewportAspect);
      return { ...selected, adjustingView: false, angleDragging: false, focusMode: true, inspectionLevel: "frame", inspectZoom: fit.zoom, inspectPan: fit.pan, loupe: { ...selected.loupe, isActive: state.focusMode && state.loupe.isActive }, isTransitioning: true, transitionKind: "inspection",
        savedOverview: !state.focusMode ? { zoom: state.inspectZoom, pan: state.inspectPan, frameIndex: state.activeFrameIndex } : state.savedOverview };
    }
    case "VIEW_LEVEL": {
      if (state.isTransitioning && state.transitionKind !== "inspection" && state.transitionKind !== "journey") return state;
      if (action.level === "frame") return viewerReducer(state, { type: "OPEN_FRAME", frameIndex: state.activeFrameIndex });
      if (state.focusMode && action.level === "roll") return viewerReducer(state, { type: "SHOW_OVERVIEW" });
      const index = action.stripIndex === undefined ? state.activeFrameIndex : (createRollLayout(state.roll)[action.stripIndex]?.offset ?? state.activeFrameIndex);
      const selected = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: index });
      const fit = fitRollView(state.roll, action.level, selected.activeFrameIndex, state.viewportAspect);
      return { ...selected, focusMode: false, inspectionLevel: "roll", inspectZoom: fit.zoom, inspectPan: fit.pan, isTransitioning: true, transitionKind: "inspection", savedOverview: null };
    }
    case "NAVIGATE": {
      if ((state.isTransitioning && state.transitionKind !== "inspection" && state.transitionKind !== "journey") || state.roomMode !== "inspect") return state;
      const delta = action.direction === "left" || action.direction === "up" ? -1 : 1;
      if (state.inspectionLevel === "strip") {
        const strip = Math.max(0, Math.min(createRollLayout(state.roll).length - 1, locateFrame(state.roll, state.activeFrameIndex).strip.index + delta));
        return viewerReducer(state, { type: "VIEW_LEVEL", level: "strip", stripIndex: strip });
      }
      let index = state.activeFrameIndex + delta;
      if (state.inspectionLevel === "roll") {
        if (action.direction === "up" || action.direction === "down") {
          const current = locateFrame(state.roll, state.activeFrameIndex);
          const next = createRollLayout(state.roll)[current.strip.index + delta];
          if (!next) return state;
          index = next.offset + Math.min(current.localIndex, next.frames.length - 1);
        }
        else if (locateFrame(state.roll, index).strip.index !== locateFrame(state.roll, state.activeFrameIndex).strip.index) return state;
      }
      return viewerReducer(state, { type: state.inspectionLevel === "frame" ? "OPEN_FRAME" : "SELECT_FRAME", frameIndex: index });
    }
    case "ESCAPE_INSPECTION":
      if (state.adjustingView) return { ...state, adjustingView: false, angleDragging: false };
      if (state.loupe.inspecting) return viewerReducer(state, { type: 'PULL_BACK_LOUPE' });
      if (state.loupe.isActive) return viewerReducer(state, { type: 'SET_LOUPE_ACTIVE', active: false });
      return viewerReducer(state, state.focusMode ? { type: "SHOW_OVERVIEW" } : { type: "RETURN_TO_ROOM" });
    case "ZOOM_AT": {
      const zoom = safeZoom(state.inspectZoom + action.delta);
      const pan = anchoredZoom(state.inspectZoom, zoom, state.inspectPan, { x: action.x, z: action.z });
      return { ...state, inspectZoom: zoom, inspectPan: safePan(pan.x, pan.z, zoom) };
    }
    case "SET_FILM_STOCK": {
      if (!isFilmStockId(action.stockId) || action.stockId === state.filmStockId) return state;
      const next = getFilmStock(action.stockId);
      return {
        ...state,
        filmStockId: next.id,
        filmMode: next.type === "reversal" ? "positive"
          : getFilmStock(state.filmStockId).type === "reversal" ? "positive" : state.filmMode,
      };
    }
    case "SET_FILM_MODE":
      if (!getFilmStock(state.filmStockId).allowedViews.includes(action.mode)) return state;
      return {
        ...state,
        filmMode: action.mode,
      };

    case "SET_FILM_STRENGTH":
      return { ...state, filmStrength: clampFilmStrength(action.strength) };

    case "TOGGLE_FILM_MODE":
      if (getFilmStock(state.filmStockId).type === "reversal") return state;
      return {
        ...state,
        filmMode: state.filmMode === "negative" ? "positive" : "negative",
      };

    case "SET_LOUPE_ACTIVE": {
      if (state.roomMode !== 'inspect') return state;
      if (state.loupe.inspecting) return viewerReducer(state, { type: 'PULL_BACK_LOUPE' });
      if (state.transitionKind === 'loupe' || state.loupe.isActive === action.active) return state;
      const halfHeight = state.inspectZoom * Math.tan(Math.PI / 8);
      const visible = Math.abs(state.loupe.worldX - state.inspectPan.x) < halfHeight * state.viewportAspect * .65 && Math.abs(TABLE_CENTER_Z - state.loupe.worldY - state.inspectPan.z) < halfHeight * .65;
      const center = visible ? { x: state.loupe.worldX, y: state.loupe.worldY } : clampLoupePosition(state.inspectPan.x, TABLE_CENTER_Z - state.inspectPan.z);
      const next = viewerReducer(state, { type: 'SET_LOUPE_POSITION', ...center });
      // Pickup changes placement, never physical size. The loupe uses the same
      // scene scale as the film, independent of camera zoom and viewport shape.
      return { ...next, loupe: { ...next.loupe, isActive: action.active, inspecting: false } };
    }
    case "TOGGLE_LOUPE":
      return viewerReducer(state, { type: 'SET_LOUPE_ACTIVE', active: !state.loupe.isActive });

    case "SELECT_FRAME": {
      const clampedIndex = locateFrame(state.roll, action.frameIndex).globalIndex;
      const center = locateFrame(state.roll, clampedIndex);
      return {
        ...state,
        activeFrameIndex: clampedIndex,
        loupe: {
          ...state.loupe,
          worldX: center.x,
          worldY: center.y,
          frameIndex: clampedIndex,
          u: 0.5,
          v: 0.5,
          isOverFrame: true,
        },
      };
    }

    case "SET_LOUPE_POSITION": {
      if (![action.x, action.y].every(Number.isFinite)) return state;
      const point = clampLoupePosition(action.x, action.y);
      const mapped = mapRollPoint(state.roll, point);
      return {
        ...state,
        activeFrameIndex: multi || state.focusMode ? state.activeFrameIndex : mapped.frameIndex,
        loupe: {
          ...state.loupe,
          worldX: point.x,
          worldY: point.y,
          frameIndex: mapped.frameIndex,
          u: mapped.clampedU,
          v: mapped.clampedV,
          isOverFrame: mapped.isWithinFrame,
        },
      };
    }

    case "APPROACH_SHELF":
      if (state.roomMode === "room" && state.shelfFocused && state.shelfId === 'film') return state;
      return { ...state, roomMode: "room", shelfFocused: true, shelfId: 'film', cameraDisplay: null, focusMode: false, loupe: { ...state.loupe, isActive: false, inspecting: false }, isTransitioning: true, transitionKind: "shelf" };

    case "APPROACH_CAMERA_SHELF":
      if (state.shelfId === 'camera' && !state.cameraDisplay) return state;
      return { ...state, roomMode: 'room', shelfFocused: true, shelfId: 'camera', cameraDisplay: null,
        loupe: { ...state.loupe, isActive: false, inspecting: false }, adjustingView: false,
        isTransitioning: true, transitionKind: 'shelf' };
    case "OPEN_CAMERA":
      return state.shelfId === 'camera' ? { ...state, cameraDisplay: action.id, isTransitioning: false, transitionKind: null } : state;
    case "CLOSE_CAMERA":
      return { ...state, cameraDisplay: null };

    case "APPROACH_TABLE":
      if (state.shelfId === 'camera') return { ...state, roomMode: 'inspect', shelfFocused: false, shelfId: null, cameraDisplay: null, isTransitioning: true, transitionKind: 'journey' };
      // Guard against competing transitions or already inspecting
      if (state.roomMode === "inspect" || (state.isTransitioning && state.transitionKind !== 'shelf' && state.transitionKind !== 'journey')) {
        return state;
      }
      return {
        ...state,
        roomMode: "inspect",
        shelfFocused: false,
        shelfId: null,
        cameraDisplay: null,
        focusMode: false,
        inspectionLevel: "roll",
        ...(multi ? { inspectZoom: fitRollView(state.roll, "roll", state.activeFrameIndex, state.viewportAspect).zoom, inspectPan: { x: 0, z: TABLE_CENTER_Z }, savedOverview: null } : {}),
        isTransitioning: true,
        transitionKind: "journey",
      };

    case "RETURN_TO_ROOM":
      if (state.cameraDisplay) return { ...state, cameraDisplay: null };
      if (state.roomMode === "room" && state.shelfFocused) return { ...state, shelfFocused: false, shelfId: null, isTransitioning: true, transitionKind: "shelf" };
      // Guard against competing transitions or already in room
      if (state.roomMode === "room" || (state.isTransitioning && state.transitionKind !== 'journey')) {
        return state;
      }
      return {
        ...state,
        roomMode: "room",
        adjustingView: false,
        angleDragging: false,
        focusMode: false,
        inspectionLevel: "roll",
        isTransitioning: true,
        transitionKind: "journey",
        inspectZoom: fitRollView(state.roll, "roll", state.activeFrameIndex, state.viewportAspect).zoom,
        inspectPan: { x: 0, z: TABLE_CENTER_Z },
        loupe: {
          ...state.loupe,
          isActive: false, // Rest loupe when returning to room
          inspecting: false,
        },
      };

    case "SET_ROOM_MODE":
      return {
        ...state,
        roomMode: action.mode,
        shelfFocused: false,
        shelfId: null,
        cameraDisplay: null,
      };

    case "SET_TRANSITIONING":
      return {
        ...state,
        isTransitioning: action.isTransitioning,
        transitionKind: action.isTransitioning ? state.transitionKind : null,
        settledFrameIndex: action.isTransitioning ? state.settledFrameIndex : state.activeFrameIndex,
      };

    case "UPDATE_ROOM_POSE": {
      if (state.roomMode !== "room" || state.shelfFocused || (state.isTransitioning && state.transitionKind !== 'shelf' && state.transitionKind !== 'journey')) {
        return state;
      }
      const updated = {
        ...state.savedRoomPose,
        ...action.pose,
      };
      return {
        ...state,
        savedRoomPose: clampRoomPose(updated),
      };
    }

    case "SET_TABLE_ZOOM":
      return {
        ...state,
        inspectZoom: safeZoom(action.zoom),
        inspectPan: safePan(state.inspectPan.x, state.inspectPan.z, safeZoom(action.zoom)),
      };

    case "ADJUST_TABLE_ZOOM":
      return {
        ...state,
        inspectZoom: safeZoom(state.inspectZoom + action.delta),
        inspectPan: safePan(state.inspectPan.x, state.inspectPan.z, safeZoom(state.inspectZoom + action.delta)),
      };

    case "SET_TABLE_PAN":
      return {
        ...state,
        inspectPan: safePan(action.x, action.z),
      };

    case "ADJUST_TABLE_PAN":
      return {
        ...state,
        inspectPan: safePan(
          state.inspectPan.x + action.dx,
          state.inspectPan.z + action.dz
        ),
      };

    case "RESET_TABLE_VIEW":
      if (state.focusMode) return viewerReducer(state, { type: "FIT_VIEW" });
      if (multi) return viewerReducer({ ...state, savedOverview: null }, { type: "VIEW_LEVEL", level: "roll" });
      return {
        ...state,
        inspectZoom: fitRollView(state.roll, "roll", state.activeFrameIndex, state.viewportAspect).zoom,
        inspectPan: { x: 0, z: TABLE_CENTER_Z },
      };

    case "SET_LOUPE_MAGNIFICATION":
      return {
        ...state,
        loupe: {
          ...state.loupe,
          magnification: Math.max(1.5, Math.min(10.0, action.magnification)),
        },
      };

    case "ADJUST_LOUPE_MAGNIFICATION":
      return {
        ...state,
        loupe: {
          ...state.loupe,
          magnification: Math.max(
            1.5,
            Math.min(10.0, state.loupe.magnification + action.delta)
          ),
        },
      };

    case "SET_TABLE_BRIGHTNESS":
      return {
        ...state,
        tableBrightness: clampTableBrightness(action.brightness),
      };

    case "ADJUST_TABLE_BRIGHTNESS":
      return {
        ...state,
        tableBrightness: clampTableBrightness(state.tableBrightness + action.delta),
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
      };

    case "RETRY":
      return {
        ...state,
        error: null,
      };

    case "RESET":
      return createInitialViewerState(state.roomMode, state.roll);

    default:
      return state;
  }
}
