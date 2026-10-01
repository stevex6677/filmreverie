import type { Dispatch } from 'react';
import type { ViewerAction, ViewerState } from '../state/viewerState';
import { getFilmStock } from '../data/filmStocks';
import { locateFrame } from '../utils/rollLayout';
import { CAMERAS } from '../data/cameras';

/** What the tour can do to the room. Every step drives the real viewer, so visitors see the app itself. */
export interface TourStage {
  state: () => ViewerState;
  dispatch: Dispatch<ViewerAction>;
  /** Lays the newest published roll (or the bundled sample roll) on the table and walks to it. */
  approachTable: () => void;
  /** Plays part of the Develop screening reel over the table. */
  screen: () => void;
  /** Holds or resumes the tour's screening with the tour itself. */
  pauseScreening: (paused: boolean) => void;
  endScreening: () => void;
  reducedMotion: boolean;
}

export type TourChapter = 'room' | 'shelf' | 'table' | 'cameras';
export const TOUR_CHAPTERS: readonly { id: TourChapter; label: string }[] = [
  { id: 'room', label: 'The room' },
  { id: 'shelf', label: 'Film shelf' },
  { id: 'table', label: 'Light table' },
  { id: 'cameras', label: 'Cameras' },
];

export type TourTagId = 'shelf' | 'table' | 'cabinet';
export const TOUR_TAGS: Record<TourTagId, { label: string; detail: string }> = {
  shelf: { label: 'Film shelf', detail: 'Rolls of film. Pick one to view it.' },
  table: { label: 'Light table', detail: 'Where a roll’s photographs are laid out.' },
  cabinet: { label: 'Camera cabinet', detail: 'The cameras behind the photographs.' },
};

export interface TourStep {
  id: string;
  chapter: TourChapter;
  kicker: string;
  title: string;
  body: string;
  /** Milliseconds before the next step; the final step waits for the visitor. */
  duration: number;
  /** Puts the room into this step's starting state from any other step, so Back and Next work. */
  enter: (stage: TourStage) => void;
  /** Timed actions within the step, in milliseconds from its start. */
  beats?: readonly { at: number; run: (stage: TourStage) => void }[];
  /** Continuous motion, called every frame while the step plays. */
  tick?: (stage: TourStage, elapsed: number) => void;
  /** Tags shown over the room, each from its delay in milliseconds. */
  tags?: readonly { id: TourTagId; at: number }[];
  /** Skipped when it cannot show anything meaningful (for example, slide film has no negative). */
  available?: (stage: TourStage) => boolean;
}

const FEATURED_FRAME = 1;
const negativeFilm = (stage: TourStage) => getFilmStock(stage.state().filmStockId).type === 'negative';

/** Leave whatever the previous step opened: a camera, the loupe, a screening. */
function settle(stage: TourStage) {
  const { state, dispatch } = stage;
  stage.endScreening();
  if (state().cameraDisplay) dispatch({ type: 'CLOSE_CAMERA' });
  if (state().loupe.inspecting) dispatch({ type: 'PULL_BACK_LOUPE' });
  if (state().loupe.isActive) dispatch({ type: 'SET_LOUPE_ACTIVE', active: false });
}

function toRoom(stage: TourStage) {
  settle(stage);
  const { state, dispatch } = stage;
  if (state().roomMode === 'inspect' || state().shelfFocused) dispatch({ type: 'RETURN_TO_ROOM' });
  dispatch({ type: 'FACE_TABLE' });
}

/** At the table, showing the whole roll. */
function toTable(stage: TourStage) {
  settle(stage);
  const { state, dispatch } = stage;
  if (state().roomMode !== 'inspect') stage.approachTable();
  else if (state().focusMode) dispatch({ type: 'SHOW_OVERVIEW' });
}

/** At the table with the featured frame open. */
function toFrame(stage: TourStage) {
  settle(stage);
  const { state, dispatch } = stage;
  if (state().roomMode !== 'inspect') stage.approachTable();
  dispatch({ type: 'SET_FILM_MODE', mode: 'positive' });
  dispatch({ type: 'OPEN_FRAME', frameIndex: FEATURED_FRAME });
}

/** A slow figure across the open frame, like a hand moving the loupe. */
function glideLoupe(stage: TourStage, elapsed: number) {
  const state = stage.state();
  if (!state.loupe.isActive || state.loupe.inspecting || stage.reducedMotion) return;
  const frame = locateFrame(state.roll, state.activeFrameIndex);
  const { layout, scale } = frame.strip;
  const width = (layout.frameWidths?.[frame.localIndex] ?? layout.frameWidth) * scale, height = layout.frameHeight * scale;
  const t = Math.max(0, elapsed - 700) / 1000;
  stage.dispatch({ type: 'SET_LOUPE_POSITION', x: frame.x + Math.sin(t * .9) * width * .26, y: frame.y + Math.sin(t * 1.6) * height * .18 });
}

/** Turn from the table toward the cabinet on the right-hand wall. */
const CABINET_YAW = -1.3;
function turnToCabinet(stage: TourStage, elapsed: number) {
  if (elapsed < 900 || elapsed > 3600 || stage.state().shelfFocused) return;
  const t = stage.reducedMotion ? 1 : Math.min(1, (elapsed - 900) / 2400);
  const eased = t * t * (3 - 2 * t);
  stage.dispatch({ type: 'UPDATE_ROOM_POSE', pose: { yaw: CABINET_YAW * eased, pitch: .06 * eased } });
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome', chapter: 'room', kicker: 'Welcome to Film Reverie',
    title: 'A darkroom for film photographs',
    body: 'Photographs shot on real film, shown the way photographers look at them: in a darkroom, on a glowing light table. Here is a one-minute look around.',
    duration: 8500, enter: toRoom,
    tags: [{ id: 'shelf', at: 1800 }, { id: 'table', at: 3200 }],
  },
  {
    id: 'shelf', chapter: 'shelf', kicker: 'The film shelf',
    title: 'Every box is a roll of film',
    body: 'The shelf holds the collection. Choose a box and its photographs are laid out on the light table.',
    duration: 7000,
    enter: stage => { settle(stage); stage.dispatch({ type: 'APPROACH_SHELF' }); },
  },
  {
    id: 'table', chapter: 'table', kicker: 'The light table',
    title: 'The whole roll, lit from below',
    body: 'Photographers check their film on a backlit table. The roll lies here in strips, with its sprocket holes and edge printing.',
    duration: 7000,
    enter: stage => {
      toTable(stage);
      if (negativeFilm(stage)) stage.dispatch({ type: 'SET_FILM_MODE', mode: 'negative' });
    },
  },
  {
    id: 'positive', chapter: 'table', kicker: 'Negative to positive',
    title: 'See what the film saw',
    body: 'Film records an inverted, orange-tinted negative. One switch turns it into the finished photograph, with the colour and grain of its film stock.',
    duration: 7000, available: negativeFilm,
    enter: stage => { toTable(stage); stage.dispatch({ type: 'SET_FILM_MODE', mode: 'negative' }); },
    beats: [{ at: 2200, run: stage => stage.dispatch({ type: 'SET_FILM_MODE', mode: 'positive' }) }],
  },
  {
    id: 'frame', chapter: 'table', kicker: 'Look closer',
    title: 'Open any frame',
    body: 'Select a photograph to bring it up on its own. Step through the roll frame by frame, or zoom in on a detail.',
    duration: 6000, enter: toFrame,
  },
  {
    id: 'loupe', chapter: 'table', kicker: 'The loupe',
    title: 'A magnifier for grain and focus',
    body: 'Move the loupe over the film to check sharpness, as a photographer would. Look through it to see the grain itself.',
    duration: 9500,
    enter: stage => { toFrame(stage); stage.dispatch({ type: 'SET_LOUPE_ACTIVE', active: true }); },
    tick: glideLoupe,
    beats: [
      { at: 5600, run: stage => stage.dispatch({ type: 'INSPECT_LOUPE' }) },
    ],
  },
  {
    id: 'screening', chapter: 'table', kicker: 'Screen a roll',
    title: 'Play the roll as a short film',
    body: 'Screening turns a roll into a moving reel with seven styles to choose from. Save it as a video to share.',
    duration: 9000,
    enter: stage => {
      toTable(stage);
      // The reel starts once the camera has settled over the whole roll.
      stage.dispatch({ type: 'SET_FILM_MODE', mode: 'positive' });
    },
    beats: [{ at: 1200, run: stage => stage.screen() }],
  },
  {
    id: 'cabinet', chapter: 'cameras', kicker: 'The camera cabinet',
    title: 'The cameras behind the photographs',
    body: 'Turn around and there is a cabinet of film cameras, each one modelled in 3D in fine detail.',
    duration: 7500,
    enter: stage => { toRoom(stage); },
    tick: turnToCabinet,
    beats: [{ at: 4600, run: stage => stage.dispatch({ type: 'APPROACH_CAMERA_SHELF' }) }],
    tags: [{ id: 'cabinet', at: 1900 }],
  },
  {
    id: 'camera', chapter: 'cameras', kicker: 'Pick one up',
    title: 'Turn a camera in your hands',
    body: 'Open a camera to rotate it, zoom into its dials and read its story: when it was made and what makes it special.',
    duration: 8500,
    enter: stage => { settle(stage); stage.dispatch({ type: 'APPROACH_CAMERA_SHELF' }); },
    beats: [{ at: 600, run: stage => stage.dispatch({ type: 'OPEN_CAMERA', id: CAMERAS[0].id }) }],
  },
  {
    id: 'finale', chapter: 'cameras', kicker: 'Your turn',
    title: 'Start with a roll',
    body: 'Pick a roll from the film shelf, or use the strip at the top of the screen to move between the room, shelf, table and cameras.',
    duration: Infinity, enter: toRoom,
    tags: [{ id: 'shelf', at: 600 }, { id: 'table', at: 900 }],
  },
];

/** Looking through the loupe holds most viewer actions, so steps wait until it has pulled back. */
export function tourStageBusy(stage: TourStage) {
  const state = stage.state();
  if (state.loupe.inspecting && state.transitionKind !== 'loupe') stage.dispatch({ type: 'PULL_BACK_LOUPE' });
  return state.loupe.inspecting || state.transitionKind === 'loupe';
}

/** Ending the tour, at any step, returns the visitor to the room with the film as they found it. */
export function leaveTour(stage: TourStage, filmMode: ViewerState['filmMode']) {
  toRoom(stage);
  stage.dispatch({ type: 'SET_FILM_MODE', mode: filmMode });
}
