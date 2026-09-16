# M18 — Saved-roll display shelf

Implemented on `new-rolls`, based on local master `80aa57a`; working-tree changes
are not yet committed. Human acceptance and physical iOS review remain pending.
M16/M17 acceptance is unchanged. The cumulative gate is not clean; do not mark the milestone accepted. Validation results are recorded below.

## Delivered behavior

- A 4×4 wood cabinet behind the light table. Each populated compartment is one
  saved photographic roll, including repeated stocks. Empty cells contain stable
  pseudo-random gray packages with no button, hover card or keyboard stop.
- All five supported stocks in both formats. Saved 35mm rolls use a cartridge
  beside a framed cover; 120 uses its matching box beside the frame. Gray
  placeholders retain the original box/cartridge layout. Real multipack artwork is only
  a stock illustration. It never sets the number of saved rolls.
- New roll enters the existing import flow. Successful saves populate the
  shelf; canceled/failed transactions do not allocate a slot. Existing records
  are backfilled without changing timestamps or image data.
- Desktop hover reveals cover, stock, ISO, format, process, film type, photograph
  count and current-roll status. Click/tap opens the combined roll editor directly. Keyboard Arrow Down pins
  the card, which contains Open, Edit and Delete actions. Escape closes it. Drag cancellation
  does not open a roll or prevent subsequent keyboard use.
- Placement survives edits and reload. Trash frees a slot; restore takes a free
  slot. Additional pages retain access to rolls beyond 16. Cards stay inside
  phone and iPad viewports. Missing textures retain functional plain packages.

## Sources and reproducibility

See the [packaging module](../../public/assets/film-packaging/README.md) and
[manifest](../../public/assets/film-packaging/manifest.json). Ten box photographs
and five matching cartridges were downloaded; URLs, SHA-256, dimensions and
panel coordinates are recorded. Fourteen originals come from Kodak Photo
Systems and the E100 cartridge from Macodirect. Original bytes are unchanged;
3D material projection extracts front/top panels and cylindrical labels.

The shared directories are under `/Users/zhangzimou/Projects/film_photo/` locally
and `/workspace/film_photo/` remotely:

- `ignored_assets/film-packaging/kodak-20260915/`: source photographs.
- `ignored_generated/film-packaging/textures/<sha256>/`: byte-identical serving copies.
- `ignored_generated/film-packaging/runs/20260915-shelf-review/`: earlier focused captures.
- `ignored_generated/film-packaging/runs/20260915-final/`: final candidate captures and logs.

Artwork loads from this app's own origin; the capacity journey asserts zero
external requests, page errors and console errors. Build preparation verifies
all source hashes. No image binaries were added to Git.

## Validation environment

Local source: `/Users/zhangzimou/orca/workspaces/film_photo/new-rolls` (Orca).
Remote runtime: `/workspace/worktrees/orca/film_photo/new-rolls`.
`orca-worktrees` and the shared `film-photo` route were verified connected,
conflict-free and flushed. The main media route includes just the new packaging
subdirectories rather than syncing all unrelated ignored media.

The shared container has a 768-process/thread limit. An initial four-worker
browser attempt hit that limit (2 passed, 4 browser-launch failures). Later
checks use one worker. A concurrent diagnostic browser also failed to start
while another worktree's tests exhausted the limit. These are not app passes.

### Results and investigation

- Production build and all **199 integration tests in 24 files passed**.
- Earlier shelf subset: **7/7 browser tests passed** with one worker.
- The first cumulative attempt was stopped after 14 passed, 10 failed and one
  interrupted test (99 not run), when the shared host reached its thread limit.
  Its log is `20260915-final/validation.log`; this is not a clean cumulative gate.
- Investigation found the cabinet initially overhung the diffuser in overhead
  view. Cabinet depth and placement were corrected. A new rendered pixel check
  protects the clear, neutral illuminated area at three horizontal positions.
- Unmodified master `80aa57a` was independently built/tested in the detached
  `shelf-baseline-check` worktree. M10 negative 30%, 1.5× failed with the identical
  hole color difference, 65.8889 versus a limit of 16. M1's journey also fails on
  that baseline at its final hover assertion (#5 instead of #2). Its earlier
  table-background checks pass on master. These older failures are distinct
  from the corrected cabinet overlap; thresholds and baselines were not weakened.

The baseline diagnostic command was:

```sh
PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_PORT=5196 PLAYWRIGHT_OUTPUT_DIR=test-results-baseline \
  npm run test:e2e -- --project=desktop m1-viewer m10-light-transmission \
  --grep 'validates nonblank|negative 30% at 1.5'
```

## Visual review and limits

Desktop room, all-ten-stock cabinet, saved-cover card, portrait phone and rotated
iPad/landscape candidates are generated by the normal import/library UI.
The earlier review caught and corrected panel coordinates for E100 120 and
Portra 400 35mm. The overhead cabinet clearance was also corrected.

Some original photographic lighting remains visible. Unseen box faces and
cartridge reverse faces use simplified materials without invented lettering.
No physical iPhone/iPad testing or performance measurement is claimed. Browser
emulation and screenshots are the available evidence; video recording is off.

Preview runs remotely on port 5197 with a localhost SSH forward and a private
Tailscale HTTP mapping. HTTPS Serve could not be enabled with the current
Tailnet configuration. Phone HTTP preview can display the app; new photo import
requires a secure context. Use localhost on the Mac for saving review rolls.

## Final candidate validation

Final builds use `RAYON_NUM_THREADS=2 TOKIO_WORKER_THREADS=2 UV_THREADPOOL_SIZE=2`
to reduce native worker pressure. The production build and 199 integration tests
passed again after the cabinet clearance correction. Integration used
`npm run test:integration -- --maxWorkers=2`.

`20260915-final/focused.log` records 22 consecutive passes across M16/M17 and
shelf tests before an SSH disconnect ended the run. This includes all desktop
shelf interactions and all desktop/mobile Chrome M16/M17 interaction journeys;
it is not a completed 37-test pass.

`20260915-cumulative/validation.log` records a later build failing to create a
native worker thread (exit 134). `20260915-constrained/validation.log` records
10 browser passes and four desktop browser-launch failures from the same host
limit. The ten passes cover shelf capacity/edit/trash/restore, rendered overhead
clearance, and all four shelf journeys in mobile Chrome and WebKit.
A desktop-only follow-up (`20260915-desktop-completion/validation.log`) also
failed four browser launches. These attempts did not reach app assertions.

Visual inspection then identified the existing generic mobile button style
painting over occupied packages and enlarging targets into adjacent cells.
The shelf now overrides that style; its active package stays visible and hit
areas remain inside their compartments. A browser assertion checks both.
The card also honors the application's reduced-motion setting.

`20260915-mobile-fix/` contains the build log and WebKit recheck of that final
mobile styling correction. All run folders are preserved independently; no
failed results or historical screenshot baselines were replaced.

### Captures inspected

- `20260915-final/all-ten-packaging.png`: correct stock/format matrix, recognizable
  front panels, matching 35mm cartridges and muted unused packages.
- `20260915-constrained/overhead-clearance.png`: illuminated diffuser fully clear.
- `20260915-constrained/mobile-webkit-saved-card.png` and rotated 820×1180,
  1180×820, 844×390 and 375×667 candidates: cover and details legible; short
  landscape cards scroll to their Open action. Mobile target styling was then
  corrected as noted above.

Remaining acceptance work: obtain a clean cumulative regression gate after the
recorded baseline failures and server contention are resolved, and perform
physical iPhone/iPad review. No test thresholds or accepted baselines were changed.

Final mobile-fix result: **production build passed; two WebKit tests passed and
two failed during browser page creation**, before app assertions. The successful
responsive journey saves a roll, verifies cards at all four viewport sizes, and
checks drag cancellation plus subsequent keyboard access. Its final iPad and
phone-landscape screenshots were inspected: the active Portra 400 package is
visible through the transparent hit target and the cover/details remain legible.
The new explicit transparent-background assertion in the separate save/reload
journey could not run in this attempt because that browser page failed to open.

Both `http://localhost:5197/?mode=room` and
`http://macbook.tail2b1388.ts.net:5197/?mode=room` returned HTTP 200 for the final
build. The preview process is Python's static HTTP server in the remote
checkout's `dist/` directory. Other preview ports and Tailnet mappings are
preserved. Master was fast-forwarded to `80aa57a` at the start of this task;
master subsequently advanced in another workstream, and those newer changes
are outside this implementation's recorded base.

## Follow-up — click/tap to approach the shelf (2026-09-16 UTC)

Room mode now provides one cabinet hit target, including gray compartments.
A click/tap approaches a centered shelf view; individual saved-roll cards and
open actions are available in that view. Gray compartments still have no roll
card or open action. The camera frames the whole cabinet for the viewport,
preserves the original room heading, and respects reduced motion. Back to room
or Escape returns to the original room pose, including reversing an approach.
Dragging/multiple contacts do not activate the cabinet. Shelf focus locks room
look-around and clears when opening the light table or loading a roll.

Changed the viewer reducer, CameraRig, FilmShelf, scene/App wiring, toolbar and
shelf browser helpers. Added reducer coverage for heading preservation,
transition reversal, input ownership and leaving the shelf, plus browser
coverage for cabinet drag/click/tap, real camera movement and Back/Escape.

Validation in the same mapped Orca checkout:

- Production build passed (after correcting a tuple type during implementation).
- All **200 integration tests in 24 files passed**, with `--maxWorkers=2`.
- The 17-test shelf browser attempt hit two Chrome launch failures with
  `pthread_create: Resource temporarily unavailable`; it was stopped during a
  third launch (one interrupted, 14 not run).
- A five-test WebKit attempt failed during page creation/navigation before the
  relevant assertions. A single cabinet-journey check with two-CPU affinity and
  reduced worker counts also crashed on navigation. No browser pass or visual
  verification is claimed for this follow-up. No screenshot was produced.
- `git diff --check` passed. Both existing preview URLs returned HTTP 200 for
  the updated build. Physical-device and full regression acceptance remain open.

## Shelf replaces the archive — 2026-09-16

The old Your rolls grid and Open built-in example action are removed. Rolls
approaches the cabinet from room or table; the importer is extracted into
`RollEditor.tsx`. Each package card offers Open, Edit and Delete. Delete moves the
roll to a restorable Trash shelf and offers Undo; deleting the current roll
clears its photographs from the table. New roll and Cancel return through the
shelf. The cabinet has no mouse-hover frame; keyboard focus remains visible.

The five bundled photographs are saved once as Roll 01 in slot 01. Inserting the
example shifts existing active slots atomically without changing their image
data or timestamps. Concurrent tabs cannot duplicate it, overwrite edits or
resurrect a deleted example. Seed download failure leaves existing rolls usable
and supports Retry. The normal photo crop/import/edit flow remains available.

Validation for this revision:

- Production build passed. All **204 integration tests in 25 files passed**,
  including atomic first-slot insertion, preserved originals, concurrent seed
  requests, edit/trash persistence, failed-download retry and transaction rollback.
- Existing archive interaction tests now use package cards; new shelf-library
  browser journeys cover first-roll editing, deletion, empty-table state, Undo,
  Trash/Restore, reload, import cancellation and the removed hover frame.
- Desktop Chrome failed before app load (`browserContext.newPage: Target crashed`)
  with one worker, including a two-CPU affinity attempt. The shared host reported
  630/768 process/thread slots in use while other worktrees had browsers running.
  A temporary single-process SwiftShader diagnostic also exited at navigation;
  its configuration was removed. These attempts are failures, not visual proof.
- **7/7 mobile WebKit browser checks passed** with one worker and two-CPU
  affinity: both new shelf-library workflows and all five existing shelf checks.
  This covers the five-photo example, edits, Delete/Undo/Trash/Restore, reload,
  zero saved rolls, cancelled drafts, new 120 rolls, missing packaging, gray
  placeholders, drag handling and the shelf camera approach.
- Inspected the new portrait-phone and landscape-card screenshots: the example
  uses its actual harbor cover, the card exposes the new actions, and the cabinet
  has no hover frame. The landscape card scrolls to reach its lower actions.
  Adjusted the toolbar to use the available phone width. Captures are under
  shared `ignored_generated/film-packaging/reviews/20260916-shelf-library/`.
  Physical-device review and full cumulative browser acceptance remain pending.

Build/test commands use the mapped Orca checkout, with `orca-worktrees` flushed
first and `RAYON_NUM_THREADS=2 TOKIO_WORKER_THREADS=2 UV_THREADPOOL_SIZE=2`. The
browser attempts use `PLAYWRIGHT_PORT=5196 PLAYWRIGHT_WORKERS=1 LP_NUM_THREADS=2`
and `npm run test:e2e -- m18-shelf-library --project=desktop --max-failures=1`.
The remote static preview on port 5197 serves the updated production build.

- **6/6 desktop WebKit checks passed**: both new shelf-library journeys, the
  existing real import/edit/duplicate/trash journey, quota rollback/retry, the
  17-roll capacity and complete-stock matrix journey, and the rendered overhead
  light-table clearance check. Desktop room and package-card screenshots were
  inspected: the shelf is the library, actions are readable, and no cabinet
  hover rectangle remains. The 13 passing targeted WebKit checks do not replace
  a clean cumulative Chrome gate or physical iOS review.

The desktop review used a temporary configuration importing `playwright.config.ts`
and replacing `projects` with a single `desktop-webkit` project using
`browserName:'webkit', channel:undefined, launchOptions:{args:[]}`. All assertions
and the default 1280×800 viewport were retained; the temporary file was removed.
The selected files were `m18-shelf-library`, `shelf-capacity`, `m12-roll-library`,
with grep `M18|real import, editing|quota and unavailable`. All runs used video off.

The localhost and private MacBook Tailscale preview endpoints both returned HTTP
200 after updating the build. The application process remains remote.

## Combined editor and room dragging — 2026-09-16

- Dragging on the cabinet uses the room camera's existing mouse and touch
  handlers. The overlay keeps pointer capture, drag release includes the last
  sample, and dragging cannot accidentally approach the shelf. Canvas input
  retains its existing listener order so the physical loupe keeps gesture priority.
- Clicking/tapping a saved package opens its editor directly. Hover details
  remain available; keyboard Arrow Down pins the information card. Trash
  packages still expose Restore. Delete is also available in the editor.
- Saved-roll editing has one workspace: identity/format/stock and capacity on
  the left, frames at the upper right, crop and frame actions below. Frame
  thumbnails remain visible while the preview/control area scrolls. Phone
  sections stack, with persistent save/cancel/delete controls. The New roll
  import steps remain unchanged.

Validation: production build and all **204 integration tests passed**. The
**12 shelf/editor checks passed** in desktop Chrome, mobile Chrome and mobile
WebKit (four per project), including native Chromium touch dragging, direct
package-to-editor clicks/taps, combined layout, crop/cover/format/name persistence,
cancellation, deletion and restoration. WebKit drag release initially exposed a
coalesced-last-move issue, corrected by including the release position. An older
delete/reload test was racing its storage transaction; it now waits for the
visible deletion before reloading. These failures are not concealed retries.

Inspected desktop and phone screenshots under shared
`ignored_generated/film-packaging/reviews/20260916-combined-editor/`. Desktop
review prompted separate scrolling for frames and crop controls and a compact
preview/control layout; the final desktop capture shows both complete. Phone
captures show the stacked sections and reachable footer. Physical-device review
and the full cumulative gate remain separate from these targeted checks.

Commands used the mapped Orca checkout after flushing `orca-worktrees`, with
`RAYON_NUM_THREADS=2 TOKIO_WORKER_THREADS=2 UV_THREADPOOL_SIZE=2`. Browser runs
used `PLAYWRIGHT_PORT=5196 PLAYWRIGHT_WORKERS=1 LP_NUM_THREADS=2 taskset -c 0,1`:
`npm run test:e2e -- m18-editor-workspace m18-shelf-library --project=desktop
--project=mobile-chrome --project=mobile-webkit --max-failures=1`. Video was off.

Seven additional desktop/mobile Chrome regressions passed: crop drag and rotation
with save/reload/cancel, the real import/edit/Trash journey, staged imports and
crop persistence, plus mouse and native-touch loupe dragging/pinching in both
Chrome projects. This brings the final targeted browser coverage to **19 passing
checks**. An initial crop regression run was interrupted after finding a stale
Close action for the removed archive page; that test now returns straight to the
shelf after Cancel edits. No scene-image thresholds were changed.

The final localhost and private MacBook preview endpoints returned HTTP 200.
Source remains in the named Orca worktree; the application runs remotely on 5197.

## Framed saved-roll covers — 2026-09-16

- Saved 35mm blocks show the matching cartridge and a rounded wood picture
  frame; their box is removed. Saved 120 blocks show the matching box at a
  smaller scale beside the same frame. Unused gray blocks retain their existing
  geometry, materials, artwork and inert behavior.
- White mats surround the cover print. The opening follows the saved format,
  crop and rotation, including free sizing. A rear easel, beveled wood edges
  and contact shadows ground the frame in the cabinet.
- Covers load from browser-local thumbnails, with stored frame metadata returned
  alongside the image. Texture and object-URL cleanup handles cover changes,
  paging and unmounts. Missing covers retain an empty mat and usable roll actions.

Validation: production build and all **204 integration tests passed**. All
**9 focused browser checks passed** across desktop Chrome, mobile Chrome and
mobile WebKit: framed-cover changes and persistence, unchanged gray-block image
samples and noninteraction, room dragging, and direct editing with save/cancel/
delete/undo. The new pixel check caught an initial asynchronous map/shader issue;
the photo material now recreates when its texture arrives. An inert-placeholder
hover test was corrected to move the pointer by coordinates, since that element
intentionally cannot receive pointer events. Final runs had no retries or skips.

Screenshots are under shared
`ignored_generated/film-packaging/reviews/20260916-cover-frames/`; desktop and
mobile captures were inspected for cover visibility, format-specific objects,
spacing and unchanged gray packages. This is browser emulation, not a new
physical-device review. The previously recorded cumulative gate remains separate.

Source was flushed through the connected, conflict-free `orca-worktrees` route.
Build and tests ran in `/workspace/worktrees/orca/film_photo/new-rolls`, with
the resource limits recorded above. Browser command:
`npm run test:e2e -- m18-cover-frames m18-editor-workspace --project=desktop
--project=mobile-chrome --project=mobile-webkit --max-failures=1`. Video was off.
The existing remote preview on 5197 serves the new build; localhost and the
private MacBook Tailscale hostname returned HTTP 200.

## Shared physical scale — 2026-09-16

- Film, cartridges, cartons and picture frames now share one millimeter-to-world
  conversion. Saved 120 cartons no longer shrink beside a cover frame; saved and
  placeholder cartons use identical dimensions. Film on the table retains its
  physical size across formats and roll lengths, with camera fitting and a wider
  table surface for exceptionally wide free-format frames.
- The 4×4 cabinet uses 480×255×100 mm compartments. Cover frames have an
  8×10-inch mat board and a wood surround, giving a 274×223.2 mm outer face.
  Object placement preserves a 20 mm gap without shrinking the contents.
- Shelf camera framing adapts to the larger cabinet and viewport. The room's
  initial heading, field of view and wall props accommodate it. The cabinet
  remains behind the table and clear of its overhead view. Legacy saved camera
  views migrate once to the new film scale while preserving crop data.
- Retail carton dimensions are nominal envelopes, not verified measurements of
  every photographed edition. The packaging README records the dimensions,
  sources and conflicting retailer data. Exact edition-specific measurements
  remain a limitation; relative saved/placeholder scale is now consistent.

Validation: production build and **208 integration tests passed**. **42 distinct
targeted browser checks passed** across desktop Chrome, mobile Chrome and mobile
WebKit: 24 shelf/editor checks and 18 additional table, loupe, crop and overhead
clearance checks. Room entry and shelf approach were repeated on all three
projects after the final room-camera adjustment. This does not claim a new full
cumulative gate or physical-device review.

Regression tests now express film targets and movement thresholds in the fixed
physical scale. Shelf helpers wait for camera projection to settle before
measuring HTML targets, resolving an exposed timing race. Existing optical pixel
thresholds remain unchanged. New integration coverage checks format dimensions,
compartment fit, shelf camera bounds and idempotent saved-view migration.

Build and tests ran in the mapped remote Orca checkout after synchronization,
using the resource limits recorded above. Main browser selections were
`m18-cover-frames m18-editor-workspace m18-film-shelf`, followed by focused
`m16-table-view m17-loupe-states crop-recompose shelf-capacity` regressions.
Video was off. Inspected desktop and mobile screenshots are in shared
`ignored_generated/film-packaging/reviews/20260916-physical-scale/`, including
cover-frame layouts, the final room view and unobstructed overhead table.

The remote preview on 5197 serves the final production build. Both localhost
and the private MacBook Tailscale endpoint returned HTTP 200.

## Compact frames and shelf navigation — 2026-09-16

- Room clicks/taps resolve the nearest physical table or shelf surface. The
  cabinet's HTML overlay can no longer route a click on the light table into
  shelf mode. Keyboard activation of the shelf remains available.
- Dragging an owned block or the shelf background returns to the saved room
  pose through the existing camera journey. Pointer capture survives the shelf
  labels unmounting, and a trailing drag click cannot open the editor. A fresh
  press immediately after returning remains usable, including reduced motion.
- Picture frames are half their former width and height: 137×111.6 mm, with a
  4×5-inch mat board. Compartments are now 320×145×100 mm, retaining the 20 mm
  gap and the unchanged physical dimensions of negatives, cartridges and
  cartons. The cabinet remains 4×4 and gray blocks remain inert on hover.
- The desktop shelf hint explains click-to-edit and drag-to-return.

Validation: production build and **209 integration tests passed**. All **30
targeted browser checks passed** across desktop Chrome, mobile Chrome and mobile
WebKit. Coverage includes room table/shelf selection at several viewing angles,
owned and gray-block dragging, native Chromium touch dragging, preserved room
pose, editing after returning, cover changes, crop persistence and deletion.
Rendered camera samples verify intermediate positions during the return
journey; video was off. The first run caught click suppression consuming a new
toolbar press after a reduced-motion return; the handler now resets suppression
on a fresh pointer press, and the complete selected suite passed afterward.

Desktop and phone screenshots were inspected under shared
`ignored_generated/film-packaging/reviews/20260916-compact-shelf/`. This is browser
emulation, not a physical-device review. Carton measurement limitations from
the dimension audit still apply.

The infrastructure replaced the Orca root sync during this session. Validation
used the verified, connected, conflict-free checkout mapping
`rs-film-photo-orca-new-rolls-111db3b5ba82` to
`/workspace/worktrees/orca/film_photo/new-rolls`, flushing it before remote work.
The selected browser files were `m18-shelf-navigation m18-film-shelf
m18-cover-frames m18-editor-workspace`, with the resource limits above.

## Smaller borders and interruptible shelf flights — 2026-09-16

- Frames are two-thirds of the previous width and height, about 91.3×74.4 mm.
  The wood surround is 2 mm, with a 3 mm mat margin before fitting the saved
  photograph's aspect ratio. Frame depth, bevels and rear easels were reduced
  proportionally. Film, cartridges, cartons and compartment sizes are unchanged.
- Shelf entry and return to the room use a finite 0.42-second camera animation,
  including position, orientation and field of view. Reversing the flight starts
  from the rendered pose. Reduced-motion mode still completes immediately.
- Navigation stays enabled during these flights. Approach Table can redirect
  entry or exit immediately, and mouse/touch dragging can interrupt entry and
  continue turning the room view during return. Shelf targets remain interactive.
- Labels now survive transitions. Their pointer tracking resets when changing
  views so a captured drag's release cannot leave a stale contact that suppresses
  the next touch tap. The first browser run exposed this issue; it was fixed
  before the final regression runs.

Validation: production build and **210 integration tests passed**. On the final
code, **9 navigation/timing checks plus 24 shelf/editor checks passed**, covering
desktop Chrome, mobile Chrome and mobile WebKit. Navigation tests assert enabled
buttons while entering/exiting, immediate redirection to the table, dragging
before settlement, native Chromium touch interruption, subsequent roll editing,
multiple intermediate camera samples and bounded transition duration. Existing
cover-change image comparisons sample the resized print; their difference
thresholds remain unchanged. Video was off; no physical-device review is claimed.

Desktop and phone screenshots were inspected under shared
`ignored_generated/film-packaging/reviews/20260916-responsive-shelf/`.
Checks ran in the mapped remote Orca checkout using the verified
`rs-film-photo-orca-new-rolls-111db3b5ba82` synchronization route and resource
limits above. Local diff whitespace checks passed. Both preview endpoints on
5197 served the final `index-C9JbTJNl.js` production build.

## Tighter compartments and angled objects — 2026-09-16

- Compartment pitch decreased from 320×145×100 mm to 260×100×85 mm, and the
  gap between objects decreased from 20 to 12 mm. The shelf remains 4×4.
  Negatives, cartridges, cartons and picture frames retain their physical sizes.
- Film packages and cartridges turn 10° around the vertical axis. Frames turn
  12° in the opposite direction. Contact shadows follow the film orientation;
  frame bases stay level on the shelf. Rotated footprints determine placement
  so the wider carton corners clear the dividers and the neighboring frame.
- Shelf dimensions continue to drive the camera and interaction targets.

Validation: production build and **210 integration tests passed**. The physical
fit checks now transform object corners to verify side, depth and gap clearance.
**15 distinct targeted browser checks passed** across desktop Chrome, mobile
Chrome and mobile WebKit, covering cover updates/reload, gray-block noninteraction,
room/table hit targets, approach/return, drag-to-room and interruptible animation.
Two browser measurement races were corrected: projection now waits for the
rendered camera after keyboard look, and timing waits to observe the transition
state before measuring its duration. The timing checks then passed on all three
projects with the existing duration and intermediate-frame requirements.

Desktop and phone screenshots were inspected in shared
`ignored_generated/film-packaging/reviews/20260916-tight-angled-shelf/`.
Video was off. Tests ran in the mapped remote Orca checkout through the verified
`rs-film-photo-orca-new-rolls-111db3b5ba82` synchronization route. Source and
documentation edits stayed local; local whitespace checks passed. Both preview
endpoints on 5197 served `index-Jl9tbe3s.js`.

### Single-roll 35mm cartons and matching direction — 2026-09-16

- Portra 160/400 35mm now use 60×40×38 mm single-roll display cartons with
  authored SVG faces. Typography is laid out for the compact face and the
  five-roll label is removed. Original photographs and provenance are retained.
- Frames share the cartons' 10° yaw. Cartridge, frame and 120 carton dimensions
  are unchanged; placement still uses each object's rotated footprint.
- Production build, 13 relevant integration tests and the desktop/mobile Chrome
  cover-rendering browser checks passed. Inspected both screenshots in shared
  `ignored_generated/film-packaging/reviews/20260916-single-cartons/`: compact
  gray cartons match the other singles, and frames face the same way as boxes.
- Validated in the mapped remote checkout after flushing the verified
  `rs-film-photo-orca-new-rolls-111db3b5ba82` session. Local whitespace check passed.
  Both private preview endpoints responded successfully on port 5197.

### Taller covers and restored 35mm boxes — 2026-09-16

- Enlarged the photo opening to 133.03×105.33 mm: its height is 4/3 of the
  79 mm 120 carton. The frame is 143.03×115.33 mm with the same 2 mm wood
  border, 3 mm mat and 6 mm core. Covers still preserve their crop/aspect;
  wide photographs fit inside this opening. Lowered the easel to the new base.
- Saved 35mm blocks now hold cartridge, single-roll carton and cover frame.
  All objects retain the shared 10° direction. Compartments are 310×135×85 mm;
  arrangement and fit checks include both gaps in the three-object display.
- Production build, 13 relevant integration tests, and desktop/mobile Chrome
  cover-rendering checks passed. Inspected both shelf screenshots in shared
  `ignored_generated/film-packaging/reviews/20260916-taller-covers/`.
- Verified and flushed the active Orca checkout sync route before remote checks.
  Local whitespace checks passed. Both private port-5197 preview endpoints
  served `index-DyS3V-Ak.js`.
