import { createRollLayout, BASELINE_ROLL, RollDefinition, InspectionLevel, locateFrame, mapRollPoint, fitRollView, clampRollPan, clampFocusPan, anchoredZoom } from "../utils/rollLayout";
import { DEFAULT_FILM_STOCK_ID, FilmStockId, getFilmStock, isFilmStockId } from "../data/filmStocks";
import { DEFAULT_LAYOUT, getFrameCenter } from "../utils/loupeMapping";
import {
  DEFAULT_ROOM_POSE,
  RoomCameraPose,
  clampRoomPose,
  DEFAULT_INSPECT_DISTANCE,
  DEFAULT_TABLE_BRIGHTNESS,
  TABLE_CENTER_Z,
  clampInspectZoom,
  clampInspectPan,
  clampTableBrightness,
} from "../utils/cameraBounds";

export type FilmMode = "negative" | "positive";
export type RoomMode = "inspect" | "room";

export interface LoupeState {
  isActive: boolean;
  worldX: number;
  worldY: number;
  frameIndex: number;
  u: number;
  v: number;
  isOverFrame: boolean;
  magnification: number;
}

export interface ViewerState {
  touchInput: boolean;
  touchPointer: boolean;
  roll: RollDefinition;
  inspectionLevel: InspectionLevel;
  viewportAspect: number;
  savedOverview: { zoom: number; pan: { x: number; z: number }; frameIndex: number } | null;
  roomMode: RoomMode;
  filmMode: FilmMode;
  filmStockId: FilmStockId;
  loupe: LoupeState;
  activeFrameIndex: number;
  cameraMoving: boolean;
  transitionKind: "journey" | "inspection" | null;
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
  touchInput: false,
  touchPointer: false,
  roll: BASELINE_ROLL,
  inspectionLevel: "roll",
  viewportAspect: 1.5,
  savedOverview: null,
  roomMode: "inspect",
  filmMode: "negative",
  filmStockId: DEFAULT_FILM_STOCK_ID,
  loupe: {
    isActive: false,
    worldX: defaultFrameCenter.x,
    worldY: defaultFrameCenter.y,
    frameIndex: 0,
    u: 0.5,
    v: 0.5,
    isOverFrame: true,
    magnification: 2.5,
  },
  activeFrameIndex: 0,
  cameraMoving: false,
  transitionKind: null,
  settledFrameIndex: 0,
  focusMode: false,
  isTransitioning: false,
  savedRoomPose: { ...DEFAULT_ROOM_POSE },
  inspectZoom: DEFAULT_INSPECT_DISTANCE,
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
    loupe: { ...INITIAL_VIEWER_STATE.loupe, worldX: locateFrame(roll, 0).x, worldY: locateFrame(roll, 0).y },
    savedRoomPose: { ...DEFAULT_ROOM_POSE },
    inspectZoom: roll === BASELINE_ROLL ? DEFAULT_INSPECT_DISTANCE : fitRollView(roll, "roll", 0).zoom,
    inspectPan: { x: 0, z: TABLE_CENTER_Z },
    tableBrightness: DEFAULT_TABLE_BRIGHTNESS,
  roomBrightness: .45,
  lastRoomBrightness: .45,
    error: null,
  };
}

export type ViewerAction =
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
  | { type: "LOAD_ROLL"; roll: RollDefinition; stockId?: FilmStockId; view?: import("../storage/rollRepository").SavedView }
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
  | { type: "SET_FILM_MODE"; mode: FilmMode }
  | { type: "TOGGLE_FILM_MODE" }
  | { type: "SET_LOUPE_ACTIVE"; active: boolean }
  | { type: "TOGGLE_LOUPE" }
  | { type: "SELECT_FRAME"; frameIndex: number }
  | { type: "SET_LOUPE_POSITION"; x: number; y: number }
  | { type: "SET_ROOM_MODE"; mode: RoomMode }
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
  const multi = state.roll !== BASELINE_ROLL || state.touchInput;
  const maxZoom = state.focusMode ? fitRollView(state.roll, "frame", state.activeFrameIndex, state.viewportAspect).zoom : Math.max(3.6, fitRollView(state.roll, "roll", 0, state.viewportAspect).zoom);
  const safeZoom = (zoom: number) => state.focusMode || multi ? Math.max(0.12 * state.roll.scale, Math.min(maxZoom, zoom)) : clampInspectZoom(zoom);
  const safePan = (x: number, z: number, zoom = state.inspectZoom) => state.focusMode ? clampFocusPan(state.roll, state.activeFrameIndex, zoom, state.viewportAspect, x, z) : multi ? clampRollPan(state.roll, x, z) : clampInspectPan(x, z);
  switch (action.type) {
    case "TOUCH_POINTER": return state.touchPointer===action.active?state:{...state,touchPointer:action.active};
    case "INPUT_TOUCH": {
      if(state.touchInput===action.active)return state;
      const fit=fitRollView(state.roll,state.inspectionLevel,state.activeFrameIndex,state.viewportAspect);
      return { ...state, touchInput: action.active, ...(action.active&&state.roll===BASELINE_ROLL&&state.inspectionLevel==='roll'?{inspectZoom:fit.zoom}:{} ) };
    }
    case "FIT_VIEW": {
      if (state.roomMode !== "inspect" || state.transitionKind === "journey") return state;
      const fit = fitRollView(state.roll, state.inspectionLevel, state.activeFrameIndex, state.viewportAspect);
      return { ...state, inspectZoom: fit.zoom, inspectPan: fit.pan, isTransitioning: false, transitionKind: null };
    }
    case "TOUCH_VIEW": {
      if (state.roomMode !== "inspect" || state.transitionKind === "journey" || ![action.zoom, action.x, action.z].every(Number.isFinite)) return state;
      return { ...state, touchInput: true, inspectZoom: safeZoom(action.zoom), inspectPan: safePan(action.x, action.z, safeZoom(action.zoom)), isTransitioning: false, transitionKind: null };
    }
    case "TOGGLE_FOCUS": return state.roomMode === "inspect" ? viewerReducer(state, state.focusMode ? { type: "SHOW_OVERVIEW" } : { type: "OPEN_FRAME", frameIndex: state.activeFrameIndex }) : state;
    case "SHOW_OVERVIEW": {
      if (state.roomMode !== "inspect" || state.transitionKind === "journey") return state;
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
      return state.roomMode === "room" && !state.isTransitioning ? { ...state, savedRoomPose: { ...DEFAULT_ROOM_POSE } } : state;
    case "LOOK_ROOM":
      return viewerReducer(state, { type: "UPDATE_ROOM_POSE", pose: { yaw: state.savedRoomPose.yaw + action.yaw, pitch: state.savedRoomPose.pitch + action.pitch } });
    case "LOAD_ROLL": {
      let next = createInitialViewerState("inspect", action.roll);
      next.touchInput = state.touchInput;
      next.touchPointer = state.touchPointer;
      next.viewportAspect = state.viewportAspect;
      next.inspectZoom = fitRollView(action.roll, "roll", 0, state.viewportAspect).zoom;
      next = viewerReducer(next, { type: "SET_FILM_STOCK", stockId: action.stockId ?? DEFAULT_FILM_STOCK_ID });
      const v = action.view;
      if (v) {
        const index = Math.max(0, action.roll.frames.findIndex(f => f.id === v.frameId));
        next = viewerReducer(next, { type: "SELECT_FRAME", frameIndex: index });
        next = viewerReducer(next, { type: "VIEW_LEVEL", level: ["roll", "strip", "frame"].includes(v.level) ? v.level : "roll" });
        next = viewerReducer(next, { type: "SET_FILM_MODE", mode: v.mode });
        next = viewerReducer(next, { type: "SET_TABLE_BRIGHTNESS", brightness: Number.isFinite(v.brightness) ? v.brightness : 1 });
        next = viewerReducer(next, { type: "SET_LOUPE_MAGNIFICATION", magnification: Number.isFinite(v.magnification) ? v.magnification : 2.5 });
        if (Number.isFinite(v.zoom) && Number.isFinite(v.pan?.x) && Number.isFinite(v.pan?.z)) {
          next = viewerReducer(next, { type: "SET_TABLE_ZOOM", zoom: v.zoom });
          next = viewerReducer(next, { type: "SET_TABLE_PAN", ...v.pan });
        }
        next.savedOverview = next.focusMode && v.overview && Number.isFinite(v.overview.zoom) && Number.isFinite(v.overview.pan?.x) && Number.isFinite(v.overview.pan?.z) ? { zoom: Math.max(.1,Math.min(Math.max(3.6,fitRollView(action.roll,'roll',0,state.viewportAspect).zoom),v.overview.zoom)), pan: clampRollPan(action.roll,v.overview.pan.x,v.overview.pan.z), frameIndex: locateFrame(action.roll,v.overview.frameIndex).globalIndex } : next.savedOverview;
      }
      return { ...next, roomBrightness: state.roomBrightness, lastRoomBrightness: state.lastRoomBrightness, savedRoomPose: state.savedRoomPose, viewportAspect: state.viewportAspect, isTransitioning: true, transitionKind: "journey" };
    }
    case "CAMERA_MOTION": {
      if (state.cameraMoving === action.moving) return state;
      const center = locateFrame(state.roll, state.activeFrameIndex);
      return { ...state, cameraMoving: action.moving, loupe: !action.moving && multi && !state.touchInput ? { ...state.loupe, worldX: center.x, worldY: center.y, frameIndex: state.activeFrameIndex, u: .5, v: .5, isOverFrame: true } : state.loupe };
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
      if (state.roomMode !== "inspect" || (state.isTransitioning && state.transitionKind !== "inspection")) return state;
      const selected = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: action.frameIndex });
      const fit = fitRollView(state.roll, "frame", selected.activeFrameIndex, state.viewportAspect);
      return { ...selected, focusMode: true, inspectionLevel: "frame", inspectZoom: fit.zoom, inspectPan: fit.pan, loupe: { ...selected.loupe, isActive: state.focusMode && state.loupe.isActive }, isTransitioning: true, transitionKind: "inspection",
        savedOverview: !state.focusMode ? { zoom: state.inspectZoom, pan: state.inspectPan, frameIndex: state.activeFrameIndex } : state.savedOverview };
    }
    case "VIEW_LEVEL": {
      if (state.isTransitioning && state.transitionKind !== "inspection") return state;
      if (action.level === "frame") return viewerReducer(state, { type: "OPEN_FRAME", frameIndex: state.activeFrameIndex });
      if (state.focusMode && action.level === "roll") return viewerReducer(state, { type: "SHOW_OVERVIEW" });
      const index = action.stripIndex === undefined ? state.activeFrameIndex : (createRollLayout(state.roll)[action.stripIndex]?.offset ?? state.activeFrameIndex);
      const selected = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: index });
      const fit = fitRollView(state.roll, action.level, selected.activeFrameIndex, state.viewportAspect);
      return { ...selected, focusMode: false, inspectionLevel: "roll", inspectZoom: fit.zoom, inspectPan: fit.pan, isTransitioning: true, transitionKind: "inspection", savedOverview: null };
    }
    case "NAVIGATE": {
      if ((state.isTransitioning && state.transitionKind !== "inspection") || state.roomMode !== "inspect") return state;
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
          : getFilmStock(state.filmStockId).type === "reversal" ? "negative" : state.filmMode,
      };
    }
    case "SET_FILM_MODE":
      if (!getFilmStock(state.filmStockId).allowedViews.includes(action.mode)) return state;
      return {
        ...state,
        filmMode: action.mode,
      };

    case "TOGGLE_FILM_MODE":
      if (getFilmStock(state.filmStockId).type === "reversal") return state;
      return {
        ...state,
        filmMode: state.filmMode === "negative" ? "positive" : "negative",
      };

    case "SET_LOUPE_ACTIVE":
      return {
        ...state,
        loupe: {
          ...state.loupe,
          isActive: action.active,
        },
      };

    case "TOGGLE_LOUPE":
      return {
        ...state,
        loupe: {
          ...state.loupe,
          isActive: !state.loupe.isActive,
        },
      };

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
      const mapped = mapRollPoint(state.roll, { x: action.x, y: action.y });
      return {
        ...state,
        activeFrameIndex: multi || state.focusMode ? state.activeFrameIndex : mapped.frameIndex,
        loupe: {
          ...state.loupe,
          worldX: action.x,
          worldY: action.y,
          frameIndex: mapped.frameIndex,
          u: mapped.clampedU,
          v: mapped.clampedV,
          isOverFrame: mapped.isWithinFrame,
        },
      };
    }

    case "APPROACH_TABLE":
      // Guard against competing transitions or already inspecting
      if (state.roomMode === "inspect" || state.isTransitioning) {
        return state;
      }
      return {
        ...state,
        roomMode: "inspect",
        focusMode: false,
        inspectionLevel: "roll",
        ...(multi ? { inspectZoom: fitRollView(state.roll, "roll", state.activeFrameIndex, state.viewportAspect).zoom, inspectPan: { x: 0, z: TABLE_CENTER_Z }, savedOverview: null } : {}),
        isTransitioning: true,
        transitionKind: "journey",
      };

    case "RETURN_TO_ROOM":
      // Guard against competing transitions or already in room
      if (state.roomMode === "room" || state.isTransitioning) {
        return state;
      }
      return {
        ...state,
        roomMode: "room",
        focusMode: false,
        inspectionLevel: "roll",
        isTransitioning: true,
        transitionKind: "journey",
        inspectZoom: DEFAULT_INSPECT_DISTANCE,
        inspectPan: { x: 0, z: TABLE_CENTER_Z },
        loupe: {
          ...state.loupe,
          isActive: false, // Rest loupe when returning to room
        },
      };

    case "SET_ROOM_MODE":
      return {
        ...state,
        roomMode: action.mode,
      };

    case "SET_TRANSITIONING":
      return {
        ...state,
        isTransitioning: action.isTransitioning,
        transitionKind: action.isTransitioning ? state.transitionKind : null,
        settledFrameIndex: action.isTransitioning ? state.settledFrameIndex : state.activeFrameIndex,
      };

    case "UPDATE_ROOM_POSE": {
      if (state.roomMode !== "room" || state.isTransitioning) {
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
        inspectZoom: DEFAULT_INSPECT_DISTANCE,
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
