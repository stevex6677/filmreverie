import { BASELINE_ROLL, RollDefinition, InspectionLevel, locateFrame, mapRollPoint, fitRollView, clampRollPan, anchoredZoom } from "../utils/rollLayout";
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
  isTransitioning: boolean;
  savedRoomPose: RoomCameraPose;
  inspectZoom: number;
  inspectPan: { x: number; z: number };
  tableBrightness: number;
  assetFailures: string[];
  assetsLoading: boolean;
  assetRetry: number;
  error: string | null;
}

const defaultFrameCenter = getFrameCenter(0, DEFAULT_LAYOUT);

export const INITIAL_VIEWER_STATE: ViewerState = {
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
  isTransitioning: false,
  savedRoomPose: { ...DEFAULT_ROOM_POSE },
  inspectZoom: DEFAULT_INSPECT_DISTANCE,
  inspectPan: { x: 0, z: TABLE_CENTER_Z },
  tableBrightness: DEFAULT_TABLE_BRIGHTNESS,
  assetFailures: [],
  assetsLoading: true,
  assetRetry: 0,
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
    error: null,
  };
}

export type ViewerAction =
  | { type: "CAMERA_MOTION"; moving: boolean }
  | { type: "ASSET_STATUS"; failures: string[]; loading: boolean }
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
  const multi = state.roll !== BASELINE_ROLL;
  const safeZoom = (zoom: number) => multi ? Math.max(0.32 * state.roll.scale, Math.min(3.6, zoom)) : clampInspectZoom(zoom);
  const safePan = (x: number, z: number) => multi ? clampRollPan(state.roll, x, z) : clampInspectPan(x, z);
  switch (action.type) {
    case "CAMERA_MOTION": {
      if (state.cameraMoving === action.moving) return state;
      const center = locateFrame(state.roll, state.activeFrameIndex);
      return { ...state, cameraMoving: action.moving, loupe: !action.moving && multi ? { ...state.loupe, worldX: center.x, worldY: center.y, frameIndex: state.activeFrameIndex, u: .5, v: .5, isOverFrame: true } : state.loupe };
    }
    case "ASSET_STATUS": return { ...state, assetFailures: action.failures, assetsLoading: action.loading };
    case "RETRY_ASSETS": return { ...state, assetRetry: state.assetRetry + 1 };
    case "VIEWPORT": {
      if (Math.abs(state.viewportAspect - action.aspect) < 0.001) return state;
      const fit = fitRollView(state.roll, state.inspectionLevel, state.activeFrameIndex, action.aspect);
      return { ...state, viewportAspect: action.aspect, ...(multi ? { inspectZoom: fit.zoom, inspectPan: fit.pan, savedOverview: null } : {}) };
    }
    case "OPEN_FRAME": {
      if (state.isTransitioning) return state;
      const selected = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: action.frameIndex });
      if (!multi) return selected;
      const fit = fitRollView(state.roll, "frame", selected.activeFrameIndex, state.viewportAspect);
      return { ...selected, inspectionLevel: "frame", inspectZoom: fit.zoom, inspectPan: fit.pan, isTransitioning: true,
        savedOverview: state.inspectionLevel === "roll" ? { zoom: state.inspectZoom, pan: state.inspectPan, frameIndex: state.activeFrameIndex } : state.savedOverview };
    }
    case "VIEW_LEVEL": {
      if (state.isTransitioning) return state;
      const index = action.stripIndex === undefined ? state.activeFrameIndex : action.stripIndex * state.roll.framesPerStrip;
      const selected = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: action.level === "roll" && state.savedOverview ? state.savedOverview.frameIndex : index });
      const fit = action.level === "roll" && state.savedOverview ? state.savedOverview : fitRollView(state.roll, action.level, selected.activeFrameIndex, state.viewportAspect);
      return { ...selected, inspectionLevel: action.level, inspectZoom: fit.zoom, inspectPan: fit.pan, isTransitioning: true,
        savedOverview: state.inspectionLevel === "roll" && action.level !== "roll" ? { zoom: state.inspectZoom, pan: state.inspectPan, frameIndex: state.activeFrameIndex } : state.savedOverview };
    }
    case "NAVIGATE": {
      if (state.isTransitioning || state.roomMode !== "inspect") return state;
      const delta = action.direction === "left" || action.direction === "up" ? -1 : 1;
      if (state.inspectionLevel === "strip") {
        const strip = Math.max(0, Math.min(Math.ceil(state.roll.frames.length / state.roll.framesPerStrip) - 1, Math.floor(state.activeFrameIndex / state.roll.framesPerStrip) + delta));
        return viewerReducer(state, { type: "VIEW_LEVEL", level: "strip", stripIndex: strip });
      }
      let index = state.activeFrameIndex + delta;
      if (state.inspectionLevel === "roll") {
        if (action.direction === "up" || action.direction === "down") {
          index = state.activeFrameIndex + delta * state.roll.framesPerStrip;
          if (index < 0 || index >= state.roll.frames.length) return state;
        }
        else if (Math.floor(Math.max(0, index) / state.roll.framesPerStrip) !== Math.floor(state.activeFrameIndex / state.roll.framesPerStrip)) return state;
      }
      return viewerReducer(state, { type: state.inspectionLevel === "frame" ? "OPEN_FRAME" : "SELECT_FRAME", frameIndex: index });
    }
    case "ESCAPE_INSPECTION":
      return viewerReducer(state, multi && state.inspectionLevel !== "roll" ? { type: "VIEW_LEVEL", level: state.inspectionLevel === "frame" ? "strip" : "roll" } : { type: "RETURN_TO_ROOM" });
    case "ZOOM_AT": {
      const zoom = safeZoom(state.inspectZoom + action.delta);
      const pan = anchoredZoom(state.inspectZoom, zoom, state.inspectPan, { x: action.x, z: action.z });
      return { ...state, inspectZoom: zoom, inspectPan: safePan(pan.x, pan.z) };
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
        activeFrameIndex: multi ? state.activeFrameIndex : mapped.frameIndex,
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
        inspectionLevel: "roll",
        ...(multi ? { inspectZoom: fitRollView(state.roll, "roll", state.activeFrameIndex, state.viewportAspect).zoom, inspectPan: { x: 0, z: TABLE_CENTER_Z }, savedOverview: null } : {}),
        isTransitioning: true,
      };

    case "RETURN_TO_ROOM":
      // Guard against competing transitions or already in room
      if (state.roomMode === "room" || state.isTransitioning) {
        return state;
      }
      return {
        ...state,
        roomMode: "room",
        isTransitioning: true,
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
      };

    case "UPDATE_ROOM_POSE": {
      if (state.roomMode !== "room") {
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
      };

    case "ADJUST_TABLE_ZOOM":
      return {
        ...state,
        inspectZoom: safeZoom(state.inspectZoom + action.delta),
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
