// Keeps screening playback smooth on slower devices. Frames that miss 60 fps
// read as stutter, so when too many are late in a window of frames, playback
// steps down: fewer depth-of-field samples, then no depth of field, and only
// then a little render resolution. A lower resolution scaled up shows as jagged,
// blocky edges on the film while the camera moves, so it is the last resort. After
// sustained smooth playback it steps back up; a level that failed soon after
// being restored waits longer before the next attempt, so it does not
// oscillate. Paused frames and export always use full quality.

/** `samples: 0` renders without depth of field. */
export interface QualityLevel { scale: number; samples: number }
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { scale: 1, samples: 128 },
  { scale: 1, samples: 80 },
  { scale: 1, samples: 0 },
  { scale: .85, samples: 0 },
  { scale: .75, samples: 0 },
];

/** A frame is late when it misses the 60 fps budget by half a frame. */
export const LATE_FRAME = 1.5 / 60;
/** A window is 45 frames, or at least 0.6 s and 8 frames on a slow device. */
const WINDOW = 45, WINDOW_SECONDS = .6, MIN_FRAMES = 8;
const LATE_SHARE = .1;
/** Frames ignored after a change, while the new level settles. */
const SETTLE = 12;

export class PlaybackGovernor {
  level = 0;
  private frames = 0;
  private late = 0;
  private elapsed = 0;
  private settle = SETTLE;
  private calm = 0;
  private patience = 3;
  /** Windows since the last step up; a quick failure means that level is too costly. */
  private sinceRaise = Infinity;
  /** `raise: false` only ever steps down, for films that cut between shots of very different cost. */
  constructor(private readonly raise = true) {}

  get quality() { return QUALITY_LEVELS[this.level]; }

  /** Record one playback frame interval (seconds). Returns true when the level changed. */
  frame(interval: number): boolean {
    // Pauses, hidden pages and seeks are not rendering cost.
    if (!(interval > 0) || interval > .25) return false;
    if (this.settle > 0) { this.settle--; return false; }
    this.frames++; this.elapsed += interval;
    if (interval > LATE_FRAME) this.late++;
    if (this.frames < WINDOW && (this.frames < MIN_FRAMES || this.elapsed < WINDOW_SECONDS)) return false;
    const share = this.late / this.frames, mean = this.elapsed / this.frames;
    this.frames = this.late = this.elapsed = 0;
    this.sinceRaise++;
    if (share > LATE_SHARE && this.level < QUALITY_LEVELS.length - 1) {
      if (this.sinceRaise <= 2) this.patience = Math.min(32, this.patience * 2);
      // Far below 60 fps (under 30), step down two levels at once.
      return this.change(Math.min(QUALITY_LEVELS.length - 1, this.level + (mean > 2 / 60 ? 2 : 1)));
    }
    this.calm = share === 0 ? this.calm + 1 : 0;
    if (this.raise && this.calm >= this.patience && this.level > 0) { this.sinceRaise = 0; return this.change(this.level - 1); }
    return false;
  }

  private change(level: number) {
    this.level = level; this.calm = 0; this.settle = SETTLE;
    return true;
  }
}
