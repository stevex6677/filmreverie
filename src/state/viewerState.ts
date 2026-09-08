import { DEFAULT_LAYOUT, getFrameCenter, mapWorldPointToFrame } from "../utils/loupeMapping";
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
  roomMode: RoomMode;
  filmMode: FilmMode;
  loupe: LoupeState;
  activeFrameIndex: number;
  isTransitioning: boolean;
  savedRoomPose: RoomCameraPose;
  inspectZoom: number;
  inspectPan: { x: number; z: number };
  tableBrightness: number;
  error: string | null;
}

const defaultFrameCenter = getFrameCenter(0, DEFAULT_LAYOUT);

export const INITIAL_VIEWER_STATE: ViewerState = {
  roomMode: "inspect",
  filmMode: "negative",
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
  isTransitioning: false,
  savedRoomPose: { ...DEFAULT_ROOM_POSE },
  inspectZoom: DEFAULT_INSPECT_DISTANCE,
  inspectPan: { x: 0, z: TABLE_CENTER_Z },
  tableBrightness: DEFAULT_TABLE_BRIGHTNESS,
  error: null,
};

export function createInitialViewerState(initialRoomMode: RoomMode = "inspect"): ViewerState {
  return {
    ...INITIAL_VIEWER_STATE,
    roomMode: initialRoomMode,
    savedRoomPose: { ...DEFAULT_ROOM_POSE },
    inspectZoom: DEFAULT_INSPECT_DISTANCE,
    inspectPan: { x: 0, z: TABLE_CENTER_Z },
    tableBrightness: DEFAULT_TABLE_BRIGHTNESS,
    error: null,
  };
}

export type ViewerAction =
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
  switch (action.type) {
    case "SET_FILM_MODE":
      return {
        ...state,
        filmMode: action.mode,
      };

    case "TOGGLE_FILM_MODE":
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
      const clampedIndex = Math.max(0, Math.min(4, Math.floor(action.frameIndex)));
      const center = getFrameCenter(clampedIndex, DEFAULT_LAYOUT);
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
      const mapped = mapWorldPointToFrame({ x: action.x, y: action.y }, DEFAULT_LAYOUT);
      return {
        ...state,
        activeFrameIndex: mapped.frameIndex,
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
        inspectZoom: clampInspectZoom(action.zoom),
      };

    case "ADJUST_TABLE_ZOOM":
      return {
        ...state,
        inspectZoom: clampInspectZoom(state.inspectZoom + action.delta),
      };

    case "SET_TABLE_PAN":
      return {
        ...state,
        inspectPan: clampInspectPan(action.x, action.z),
      };

    case "ADJUST_TABLE_PAN":
      return {
        ...state,
        inspectPan: clampInspectPan(
          state.inspectPan.x + action.dx,
          state.inspectPan.z + action.dz
        ),
      };

    case "RESET_TABLE_VIEW":
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
      return createInitialViewerState(state.roomMode);

    default:
      return state;
  }
}
