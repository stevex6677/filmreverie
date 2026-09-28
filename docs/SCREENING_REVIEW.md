# M22 — Screening review

Status: **Implemented locally; awaiting human review.** The three reels, live
preview, exact restoration and in-browser MP4 export work in desktop and
phone-emulated Chrome. **The physical iPad spike (M22.1 measurements) and
physical iPad acceptance have not been performed**: no iPad was available to
this session, and Playwright WebKit cannot be installed on this macOS 13 host.
Browser emulation is not iPad acceptance. Nothing was pushed or deployed.

## Review revision (2026-09-27)

After the user reviewed the first build (commit `ed4ee42`):

- **Loupe Walk → Tracking Shot.** The loupe added nothing, so it is hidden
  during every screening and its timeline tracks were removed (`Loupe.tsx` is
  back to its pre-M22 form). The low tracking camera stays; every sixth frame it
  pushes in to an 18° close-up and drifts across a detail.
- **Develop without flicker.** The opening previously struck the table light
  like a fluorescent tube (0 → 55% → 5% → 80% → 25% → 100%). Now the title
  shows over the dark table and the light rises smoothly as it fades; an
  integration test checks that brightness never decreases in the opening. The
  overlay canvas starts black until its first draw, avoiding a one-frame flash.
- **Projector direction and feel.** Photographs always enter from the right
  and leave to the left. A change of strip continues past the strip's end with
  the shutter closing, then re-enters the next strip from its right as it opens;
  tests check that every advance moves the camera rightward with no vertical
  motion and that the only discontinuity is behind a fully closed shutter.
  Lighter effects: an Academy countdown (5–2) that fades up from black, warm
  lamp light, a bloom on the gate plate, shutter darkening during each
  pull-down, slow gate weave (<1% of frame width), and occasional dust and a
  hair in the gate. Dust, hair, weave and flicker are off with reduced motion.
  Wall projection is deferred.
- **Deferred:** three new reels (Darkroom, Flyover, Orbit) are designed in the
  implementation plan as M22.6.

Reviewed exports after the revision (5-frame example roll, 16:9, Normal):
Tracking Shot shows no loupe and a detail push-in on frame 3; the Develop
opening goes black → title → smooth rise → negatives; Projector shows the
countdown, then each photograph sliding in from the right through a white-lit
gate, with the neighbours masked. Verification: 317 integration tests and all
11 M22 browser cases (8 desktop, 3 phone-size Chrome) pass.

The sections below describe the first build; where they mention Loupe Walk,
its loupe or the tube strike, the revision above supersedes them.

## What was built

| Part | State |
| --- | --- |
| M22.1 feasibility spike | Engineering decisions made and measured on a desktop Mac (below). **Physical iPad measurements, thermals and Save Video behavior remain open.** |
| M22.2 timeline, live playback, Loupe Walk (now Tracking Shot) | Implemented. |
| M22.3 Develop and Projector | Implemented. |
| M22.4 video export | Implemented. |
| M22.5 validation and review | This record; cumulative gate results below. |

- **Timeline** (`src/screening/timeline.ts`, `reels.ts`): each reel is a pure
  function of roll, reel, output aspect, pace and time. Segments are explicit
  (`act`, `kind`, frame, start/duration, camera and loupe poses, light, reveal,
  gate/aperture, blur) and frame changes are recorded as `beats` for a future
  soundtrack. Framing uses `fitRollView`/`locateFrame` with the requested aspect.
  Establish → Tour → Return; overview breaks at strip boundaries (none below 8
  frames, every other boundary under 16 frames and on 120).
- **Reels.** *Loupe Walk*: low 32° camera following the physical loupe, which
  lifts from a rest spot beside the roll, glides across the rebate, inspects
  every sixth frame (8×, then 4× alternately) with a pan across a detail, crosses
  to the next strip during overview breaks and is set down at the end. *Develop*:
  dark open, table light strikes, negatives; a glowing band turns each frame
  positive as the camera pushes in; reversal stock brings up the backlight
  instead. *Projector*: push into a fixed soft-edged aperture; frames jump through
  it on a 0.3 s half-beat grid with 270° shutter motion blur in export, gate
  flicker, and speed-up runs on 35 mm rolls of 10+ frames; 120 advances slower
  with a heavy overshoot and no runs.
- **Pace and reduced motion.** Relaxed ×1.3 / Normal / Brisk ×0.72. Reduced
  motion (system setting or `reduced_motion=true`) turns every move into a
  ≥1.1 s hold–dip–hold cut, removes drift, loupe arcs, blur and flicker.
- **Portrait video** turns whole-roll shots 90° so strips run down the frame;
  close shots keep photographs upright.
- **Rendering overrides, not state.** A `ScreeningSession` supplies samples;
  `CameraRig`, `Loupe` and the film/rebate shaders read them. Screening never
  dispatches viewer actions, so the table, loupe, film mode, dimmer, saved
  framing, roll data and saved views are untouched; exit snaps back in one frame.
  The film and rebate shaders gained a spatial reveal uniform (`uReveal`).
- **Entry.** A **Screen roll** pill in Overview, a Focus header button (hidden on
  phones) and a Settings entry, whenever the loupe is put away.
- **Live preview.** Play/pause, previous/next frame (seek to the frame's first
  segment; Next leaves the establishing shot), tap the scene to pause/resume,
  Space/←/→/Escape, auto-hiding controls, hidden page pauses. Texture priority
  follows the timeline 1.2 s ahead.
- **Export** (`src/screening/export/`, lazy `ScreeningExportView` chunk,
  10.5 kB): frame n renders the timeline at n/30 s at the exact output size,
  composites cards/gate/dips onto a 2D canvas, and encodes a `VideoFrame` with
  WebCodecs. 1280 × 720, 720 × 1280, 720 × 720; 30 fps; H.264 (first accepted
  of High 4.0, Main 4.0, Baseline 3.1, Baseline 4.2); 5 Mbit/s (3.5 at 1:1);
  keyframe every 2 s. The view shows the actual frame, progress, time left and
  Cancel; holds a wake lock; pauses while hidden; delivers via Web Share with a
  file (iPad: Save Video) or a download; names files from the sanitized roll
  name (`harbour-night-develop.mp4`). Cards show roll name, stock, format,
  frame count and a small *filmreverie.app* mark only.

## M22.1 decisions

- **Muxer:** an in-repo single-track MP4 writer (`mp4.ts`, fast start, `stss`,
  `ctts` + edit list for reordered frames, `colr`). `mp4-muxer` (MIT) is
  deprecated in favor of Mediabunny, which is MPL-2.0 and ~10.8 MB unpacked.
  Screening needs one silent AVC track, so no dependency or licence obligation
  was added. An independent reader in `tests/helpers/mp4.ts` checks the output.
- **MediaRecorder fallback:** not added. It needs the physical iPad result; the
  current unsupported path shows a clear message and leaves the table unchanged.
- **Deviation — textures:** the plan asked to load full-resolution textures for
  the whole roll before export. That would hold up to 36 × 1536 px RGBA textures
  (the existing 192 MB budget). Export instead waits, before each frame, until
  the on-screen photograph's viewing texture is resident (neighbours stay
  resident; far frames in overviews may use their thumbnails). No frame renders
  a placeholder. Screening disables source-detail decoding.
- **Not implemented:** depth of field (iPad budget unknown); motion blur in live
  preview (export only); background music (deferred by the plan).

## Desktop measurements (not iPad evidence)

Host: MacBook Pro, Intel Core i7-7567U, Intel Iris Plus 650, macOS 13.7.8,
Google Chrome 154.0.8037.57 headless via Playwright, `--use-gl=angle`. Guest roll
of 36 distinct 1800 px JPEGs imported through the real editor; 16:9 Normal pace.

| Reel | Video | Frames | Export wall time | File | JS heap start → peak |
| --- | --- | --- | --- | --- | --- |
| Loupe Walk | 153.9 s | 4617 | 166 s | 95.8 MB | 178 → 272 MB |
| Develop | 161.6 s | 4848 | 157 s | 101.0 MB | 272 → 285 MB |
| Projector | 59.2 s | 1776 | 78 s | 37.1 MB | 191 → 211 MB |

Five-frame example roll: Projector Brisk (333 frames) ~20 s inside the E2E run;
portrait Develop Brisk (645 frames) 20 s. ffprobe reports H.264 High, yuv420p,
bt709, 30/1 fps and the expected frame counts; `ffmpeg -f null` decodes cleanly.

Reel durations (Relaxed / Normal / Brisk, seconds): 5 × 35 mm — Loupe Walk
37.1 / 28.5 / 20.5, Develop 38.7 / 29.8 / 21.5, Projector 20.0 / 15.4 / 11.1;
36 × 35 mm — 200.1 / 153.9 / 110.8, 210.1 / 161.6 / 116.4, 77.0 / 59.2 / 42.6;
12 × 6×6 — 87.7 / 67.5 / 48.6, 92.2 / 71.0 / 51.1, 39.5 / 30.4 / 21.9.

Risk for iPad: encoded chunks are held in memory and copied once into the final
Blob, so peak video memory is about twice the file size (~200 MB for a 36-frame
Loupe Walk at 5 Mbit/s).

## Video review observations

Exported videos were decoded with ffmpeg and inspected as frame sheets
(`artifacts/m22/`, untracked):

- Loupe Walk (36 frames): angled walk shots keep the loupe centered on each
  frame, lens content is the magnified film, inspections show detail at 8×/4×,
  and overview breaks show the lifted loupe crossing between strips. Real
  photographs appear in every sampled frame. The loupe body hides much of the
  frame under it in the angled shots; this is a property of the physical scale.
- Develop: dark open and flicker, orange negatives, a visible band with
  developed positives on one side; portrait video uses the rotated overview.
- Projector: fixed aperture with dark surround, visible motion blur on advances,
  vignette flicker; portrait gate fills the width.
- An earlier landscape Loupe Walk establishing shot clipped the resting loupe;
  the margin was widened. The first overview/Projector captures showed neighbours
  inside the "gate"; a fixed aperture mask was added.

## Validation run for this revision

Commands were run locally in this worktree (`auto-navigate-light-table`).

- `npm run build`: passed (69 required offline assets, including the lazy export
  chunk).
- `npm run test:integration`: **314 passed in 45 files**, including
  `m22-screening-timeline` (determinism, in-order single visits, acts, strip
  breaks, pace scaling, camera bounds for 5 rolls × 3 aspects × 3 reels,
  develop/backlight reveal, band continuity, reduced-motion cuts, cards/fades,
  no storage imports, session playback) and `m22-mp4-writer`.
- `PLAYWRIGHT_WORKERS=1 npx playwright test m22-screening --project=desktop
  --project=mobile-chrome`: **11 passed** (8 desktop, 3 mobile Chrome): preview,
  pause/seek/tap/keys and exact restoration from Overview, from Focus with 60%
  dimmer and negative mode, and after loupe use (glass/large/8×); full-reel
  export decoded in the page and by the MP4 reader; Cancel; missing encoder;
  single-frame 120 roll in 9:16; anonymous published reversal roll in 1:1 with
  only GET requests and no owner API or private database; export from a
  prepared app offline. Library contents are compared before and after.
- The final fixes (renderer resolution after export, Settings entry for phones)
  were verified at `c740900` with the same 11 cases, including a
  device-scale-factor 2 case that checks the canvas resolution after Cancel and
  an unavailable encoder.

## Cumulative gate

**Not completed.** `npm run validate:m22` was started on `936514e`; build and
314 integration tests passed, and the E2E stage reached 28 of 336 tests
(16 passed, 12 failed) before it was stopped at the user's instruction to focus
on the Screening feature rather than the full cumulative suite. The failures
inspected were in pre-existing specs and not in M22 code: `crop-recompose` and
`film-edge-alignment` expect the table to open in negative mode ("Switch to
Positive"), while the default has been positive; `m11-full-roll-navigation`
opens `/guest?fixture=36`, which shows "No roll on the light table" because the
guest shelf does not contain the fixture roll. These were not rerun on `master`
for comparison. No cumulative pass is claimed.

## Open items before acceptance

1. Physical iPad (Safari and Home Screen app): device model and iPadOS version;
   export time and memory for a 36-frame 35 mm roll and a 120 roll at 720p;
   thermals; background/foreground interruption; Save Video to Photos from the
   share sheet in both Safari and the Home Screen app; inspect the saved videos.
2. Decide on a `MediaRecorder` fallback from that result.
3. Mobile-WebKit browser runs on a host where Playwright WebKit installs.
4. iPhone and desktop layouts are usable but not accepted (phones hide Screen
   roll in the Focus header to keep one row; Overview and Settings offer it).
5. A complete cumulative `validate:m22` run (see above).
