import { DEFAULT_LAYOUT, getFrameCenter, mapWorldPointToFrame } from "../utils/loupeMapping";

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
}

export interface ViewerState {
  roomMode: RoomMode;
  filmMode: FilmMode;
  loupe: LoupeState;
  activeFrameIndex: number;
  isTransitioning: boolean;
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
  },
  activeFrameIndex: 0,
  isTransitioning: false,
};

export type ViewerAction =
  | { type: "SET_FILM_MODE"; mode: FilmMode }
  | { type: "TOGGLE_FILM_MODE" }
  | { type: "SET_LOUPE_ACTIVE"; active: boolean }
  | { type: "TOGGLE_LOUPE" }
  | { type: "SELECT_FRAME"; frameIndex: number }
  | { type: "SET_LOUPE_POSITION"; x: number; y: number }
  | { type: "SET_ROOM_MODE"; mode: RoomMode }
  | { type: "SET_TRANSITIONING"; isTransitioning: boolean }
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

    case "RESET":
      return INITIAL_VIEWER_STATE;

    default:
      return state;
  }
}
