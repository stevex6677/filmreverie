# M20 — Camera shelf and close inspection

## Olympus OM-1 cabinet addition — 2026-09-24

The current `20260924-om1-top3-final` model joins the upper tier as the fifth
camera, at a 136 mm body width (0.4896 world units). The shared catalog cites the
Olympus museum and the manufacturer's service manual for its history and size.
The 6,712,804-byte browser GLB has SHA-256
`7f34a969985e61aead361a4bb4af4eb4175307bcaddac4bdad65625fa1b70e06`.
Cabinet and inspection use the same published binary as the standalone viewer;
optional camera downloads include it automatically. The editable master remains
in shared durable authoring storage, selected by `blender/olympus_om1/CURRENT.json`.

Five upper positions preserve each camera's physical scale and leave the lower
film props clear. Nameplates alternate vertically on desktop and form two
columns on phones, preventing overlap as the collection grows to five.

Validation: the production build, all 241 integration tests, standalone catalog
test and CURRENT/master/export checksum verification passed. Desktop browser
assertions confirmed all five loaded widths, non-overlapping nameplates, and
OM-1 inspection with its 13.6 cm information label. The cabinet screenshot was
visually reviewed in `artifacts/m20-candidates/desktop-five-camera-shelf.png`.
An independent 390 × 844 mobile Chromium check also confirmed five loaded models
and non-overlapping nameplates within the viewport.
The complete desktop/mobile browser and stopped-server offline suite did **not**
pass on this host: screenshot and input timeouts occurred under software WebGL (including
an OM-1 inspection capture after 60 seconds). An isolated bundled Chromium /
SwiftShader retry with 60-second assertion waits was also stopped after the
capture stalled. These checks do not establish physical-phone/iPad acceptance.

The production preview runs locally from the `aloof-walrus` checkout as
`film-photo-cabinet-20260924` on port 4181. Both
[localhost](http://localhost:4181/?mode=room) and
[private Tailscale](http://upcloud.tail2b1388.ts.net:4181/?mode=room) returned HTTP
200 and the exact current model checksum. Select **Cameras**, then **Olympus
OM-1**. Port 4180 remains the separate standalone model viewer. These are direct
local Serve mappings; no SSH tunnel is used.


## Canon Demi EE17 cabinet addition — 2026-09-23

The accepted `20260923T-top2-b` compact model is now the third of four upper-tier
cameras. Its owner-specified width is **116 mm**, uniformly mounted at 0.4176
world units using the shared 0.0036 units/mm scale. The GLB remains 8,283,892
bytes with SHA-256 `fef17d78b1357b012bf0771909adfaea893e44f34cf1a6f63476524f791f23ae`;
the editable master and model geometry were not changed for this integration.
Four upper positions leave the existing lower film props clear. Both cabinet
and inspection use locally served Draco decoders included in the offline shell.

Validation: production build and six physical-cabinet integration checks passed;
desktop/mobile Chrome catalog, physical-click and stopped-server offline scenarios
passed (six browser cases). The initial width assertion compared decimal strings;
it now compares numeric values to accommodate `0.41759999999999997`. Both affected
catalog cases passed after that test correction. The standalone catalog test
also passed. Desktop and phone cabinet captures and the Demi inspection capture
were visually reviewed under shared `ignored_generated/blender/canon_demi_ee17/cabinet/20260923-a/`.
This focused addition does not close the historical cumulative M20 gate below.

The production preview runs from `/workspace/worktrees/paseo/plant-yak` on
remote port 5202, forwarded to [localhost:5284](http://localhost:5284/?mode=room)
and [macbook:5284](http://macbook:5284/?mode=room). Both routes returned HTTP 200.
Choose **Cameras**, then **Canon Demi EE17**. Other services were preserved.

## Earlier cabinet work

Status: M20.1–M20.3 implemented and focused validation passed; M20.4/cumulative acceptance remains open. Human approval: pending.

Implementation commit: **`9ca8a4a`** (`Add camera shelf and shared Mamiya inspection view`), based on `3296430`. Code, catalog, tests and plan are committed; generated models and review images remain ignored.

Review preview: [localhost:5280](http://localhost:5280/?mode=room) and [macbook:5280](http://macbook:5280/?mode=room) over Tailscale. The application process runs remotely from the active `infra` checkout; both HTTP endpoints returned 200. This is a separate review preview, preserving existing services. Physical-device offline installation requires a secure origin and is not established by this HTTP preview.

## Delivered behavior

- Camera cabinet replaces the right-wall chemistry shelf. The complete developing bench, sink, faucet and three trays now sit below the chemicals, timer and drying wire/clips beside the rear door. The cabinet is shifted slightly forward along the right wall to clear the bench corner. Box storage and the redundant wet-wall drying rail are removed. The camera occupies the upper-left tier; three film cartons and two cartridges decorate other positions with generous open space.
- The room eye starts at X = 0 and the midpoint between the front/rear walls, with a centered heading toward the film cabinet. Standing elevation and fixed-eye look-around remain unchanged.
- Current black-body Mamiya Universal, scaled uniformly to 210 mm including grip. Actual GLB bounds after scaling: 0.756 × 0.6270513 × 0.7484764 world units (210 × 174.18 × 207.91 mm). Cabinet dimensions are 900 mm wide × 558 mm high × 240 mm deep, with its back flush to the right wall. Its top and bottom align with the film cabinet; two tiers each provide 249 mm clear height and three layout positions.
- Model loading starts alongside photographs and shares its decoded result with the shelf. Normal initial room readiness waits for the camera's first rendered frames, preventing the delayed pop-in. Model errors release loading; the existing 12-second safety fallback remains so failed/slow assets cannot indefinitely block film viewing.
- Inspection coalesces synchronous orbit-control updates into a single animation chain, then settles to idle. Full model detail is preserved.
- Room rendering batches static camera geometry by compatible material/attributes. Tinted reflective lens layers avoid full-scene transmission passes in the darkroom; inspection retains the original detailed optical materials. All geometry, textures and source assets remain intact.
- Cameras in the room navigation approaches the shelf. Clicking the shelf in the room approaches it; clicking the camera/nameplate while approached opens inspection. Shelf dragging returns to the room. Model dragging only orbits the model.
- Responsive inspection with six directional presets, zoom/pan/reset, optional auto rotation, keyboard controls, information panel/sheet, and restored focus/history on return.
- Same reusable viewer core and catalog as the standalone viewer, preserving existing model links. A failed model or graphics context can retry without losing photographs.
- Optional model caching and explicit download in Backups & offline. The required film cache remains independent.

## Asset and information sources

The authoritative record is `blender/mamiya_universal/CURRENT.json`, selecting Hybrid v2 — black body. The current GLB agrees with `standalone/model-viewer/models.json` and has SHA-256 `6d426487c0a5c5fc59ad969158bee3d2612ce67a6bf6934f82cc78c1bbd96b73`. Asset ensure and the production preparation step independently verified those bytes. The editable master's checksum agrees with the recorded export source; no model binaries were edited.

The [Mamiya Universal history](https://mamiya.awane-photo.com/camera/press/universa/index.htm) supports the 1969 introduction and interchangeable-back system. The modeled 100 mm f/2.8 lens comes from the existing catalog. The individual body's manufacture year is unknown and is labeled separately from introduction.

## Review steps

1. From the room, select Cameras or turn toward the right wall and tap the cabinet. Compare the camera's size with the film packaging and the cabinet; inspect grounding, lighting and furniture clearance.
2. Tap the camera. Drag through front/rear/both sides, then use Top and Bottom; inspect the lens, body texture and rear markings with zoom/pan. Reset returns to whole-camera framing.
3. On a phone, open the information strip, scroll the sheet, close it, and rotate the device. On an iPad, test one-finger rotation and two-finger pinch/pan. Check that each gesture has only one owner.
4. Back to shelf, then Back to room restores the previous room heading. Browser Back/Forward and keyboard Escape should follow the same hierarchy. Verify the film shelf, selected roll and table/loupe are still usable.
5. In Backups & offline → Offline & storage, download the camera. Reopen with networking disabled and separately with the server stopped. An undownloaded model should explain its unavailability while film viewing remains usable.

## Larger desktop and iPad cabinet view

Desktop/iPad framing now uses the entire measured region between the header and cabinet toolbar, with 8 px vertical clearance and up to 98% width. The viewing eye and target shift vertically together to center the cabinet in that usable region. Desktop camera-shelf mode hides the unrelated film action row and redundant footer hint, and brings the cabinet toolbar down to 12 px from the bottom. The full room controls return when leaving the cabinet. Phone framing remains unchanged.

At the reviewed 1280 × 800 desktop viewport, the cabinet grows from approximately 775 × 480 px to 1025 × 636 px. At 1024 × 768 tablet landscape it nearly fills the space between controls. Screenshots in ignored `artifacts/m20-larger-review/` were visually inspected for full cabinet bounds, camera label placement and toolbar clearance. Production build and all 18 camera/inspection/touch browser checks passed across desktop Chrome, mobile Chrome and mobile WebKit, including repeated tablet rotations and direct model taps. Release: `7732c1c3caa1eddf5cce`. Physical-device acceptance remains pending.

## Cabinet-only approach framing

The focused cabinet view now fits the actual 900 × 558 mm cabinet, including its nearest front corners. Portrait framing uses 94% of the available width instead of the former 1430 mm allowance. A ResizeObserver measures the header and cabinet toolbar so landscape/desktop fitting leaves the cabinet clear of both controls. Cabinet and camera physical sizes are unchanged.

After the approach completes, room meshes, ceiling fixtures, the film cabinet and light table are hidden while lighting remains available. The room returns immediately when leaving the cabinet. Mounted assets and collection state are retained. The surrounding canvas is a quiet dark background.

Validation: production build and four camera geometry/navigation integration checks passed. Final camera/inspection/touch browser checks passed **18/18** across desktop Chrome, mobile Chrome and mobile WebKit; all three room-drag checks passed in the preceding run. Framing assertions project actual cabinet corners, check control clearance, and require it to occupy at least 80% of the limiting available dimension. Desktop, phone and settled tablet-rotation screenshots were visually reviewed in ignored `artifacts/m20-focus-review/`. Release `17bf140e09f1af79cbde` is verified on both preview URLs. Physical-device acceptance remains pending.

## Upper-tier camera and light shelf styling

The cabinet moves 0.6 world units (approximately 167 mm) toward the light table along the right wall, from Z = 3.5 to 2.9. Its 900 × 558 × 240 mm dimensions and flush wall mounting remain intact; clearance from the developing bench increases to approximately 339 mm. The Mamiya moves to the upper-left tier with its contact shadow, nameplate and physical tap bounds. Its measured 210 mm width is unchanged. The nameplate sits below the model without covering its front.

Three existing film cartons (Portra 400, Ektar 100 and Provia 100F) and two 35 mm cartridges are scattered across the tiers at their existing physical sizes. These are inert decorations, not saved rolls. Both cabinets share one packaging texture loader; the new props need no additional texture assets. Most space remains available for future cameras.

Validation: production build and **239/239 integration tests** passed; **36/36 browser checks** passed across desktop Chrome, mobile Chrome and mobile WebKit for camera inspection, direct tablet taps, room dragging and film-shelf behavior. After the final nameplate adjustment, the build and **9/9 targeted camera/touch checks** passed again. Shelf, tablet, phone and room screenshots were visually reviewed under ignored `artifacts/m20-styling-review/`. Final release: `6f4a0b838b8f4628099f`, verified at localhost and the MacBook Tailscale preview. The app continues to run remotely from this checkout on port 5280. Physical-iPad acceptance and the earlier cumulative gate limitations remain open.

## Compact cabinet and tablet taps — 2026-09-19

Following the user's further clearance feedback, the cabinet is shortened from 1200 to 900 mm and reduced from 260 to 240 mm deep. Its rear end is now at Z = 5.12, while the developing bench starts at Z = 5.74: approximately 172 mm physical clearance. The front moves another 20 mm toward the wall. Six future layout positions remain, three per tier. A less angled camera presentation (−0.04 radians) keeps its actual geometry safely inside the shallower shelf; the camera remains 210 mm wide and the contact shadow fits the board.

The user reported that iPad taps on the model failed while the label worked. Basic native touchscreen taps passed in browser emulation before the fix, so the exact device sequence was not reproduced. The old model handler depended on a later compatibility click; a suppressed click could also leave cancelled press state for the next tap. Touch and pen now activate from pointer release, with fresh primary presses resetting stale state. Mouse clicks retain their existing path. Physical hit bounds use the same decorative rotation as the model, and shelf drags/multiple contacts remain excluded.

The new tablet regression uses actual touchscreen taps at the projected model, asserts that the hit is on the canvas rather than its label, and explicitly blocks compatibility clicks. It repeats inspection/return across 1024×768 and 768×1024 viewports in Chrome and WebKit. This verifies the input contract without claiming physical-iPad acceptance. Review captures are under ignored `artifacts/m20-compact-camera/`.

Validation passed: production build, four actual-geometry/navigation integration cases, and **21/21 camera, tablet-tap and room-drag browser checks**. After fitting the contact shadow to the reduced shelf depth, the final build and all **three tablet tap checks** passed again. Commands: `npm run build`; `npm run test:integration -- tests/integration/m20-camera.test.ts`; `PLAYWRIGHT_PORT=5283 PLAYWRIGHT_WORKERS=3 npx playwright test tests/e2e/m20-camera-touch.spec.ts tests/e2e/m20-camera-shelf.spec.ts tests/e2e/m20-room-performance.spec.ts`. Final release: `5cce01b3777058b753c9`. The room corner gap and tablet shelf presentation were visually inspected; both verified preview URLs serve the new build. Earlier cumulative/physical-device limitations remain open.

## Wall mounting and label revision — 2026-09-19

The user compared left/right views and asked to move the camera cabinet farther toward the wall and remove “Explore the collection.” Its backing was already near the wall; excessive shelf depth made the front project toward the center. The backing now touches the wall at X = 3.8, and depth is reduced from 330 to 260 mm. The front moves from X = 2.532 to 2.8388, just behind the opposite bench's inner edge at |X| = 2.81. Camera slots move rearward with the shallower furniture. Actual rotated camera bounds clear both the backing and front edge without changing the 210 mm scale.

The entire floating room label is removed. The physical cabinet and header Cameras button retain room entry; the camera nameplate remains available after approaching the shelf. Source/current model records are unchanged.

Validation: production build, all four `m20-camera.test.ts` integration cases, and all **15 camera-shelf browser checks** passed across desktop Chrome, mobile Chrome and mobile WebKit. Checks include physical entry without the removed label, actual model clearance, inspection, drag exit, history, offline/retry and responsive re-entry. Desktop/phone room and shelf captures were inspected under ignored `artifacts/m20-wall-mount/`. Commands: `npm run build`; `npm run test:integration -- tests/integration/m20-camera.test.ts`; `PLAYWRIGHT_PORT=5283 PLAYWRIGHT_WORKERS=3 npx playwright test tests/e2e/m20-camera-shelf.spec.ts`. Release `f5314fc05effaafb5d8c` is served by the existing remote `infra` preview; both localhost:5280 and the verified MacBook Tailscale endpoint return the current entry bundle. Earlier full-gate and physical-device limitations remain unchanged.

## Second room revision — 2026-09-19

The wet bench had remained beneath the camera cabinet after the first equipment move. The entire station is now rotated onto the rear wall beside the door. Cabinet dimensions and placement above describe the revised 558 mm height and aligned mounting; the former 720 mm cabinet is superseded. The room's starting eye previously sat approximately 0.60 world units right of center and farther toward the rear; it now starts at the horizontal center, facing straight toward the film cabinet.

The room slowdown was separate from the previously fixed inspection scheduler. The GLB has 125 mesh primitives, and its three transmissive lens materials require an extra scene render when visible. `roomCameraModel.ts` flattens static transforms, batches compatible opaque geometry and gives the optical layers a low-cost tinted reflection/transparency material. It clones all owned geometry/materials, preserves every triangle and the measured bounds, and cannot modify or dispose the shared source used by inspection. No new GLB derivative or change to CURRENT.json was needed.

A room-drag check measures WebGL draw commands with the camera facing toward/away, checks that the camera is actually onscreen and limits the shelf mesh count. The first representative desktop comparison reduced visible-camera draw commands from approximately 375 to 125 per frame. Layout and viewpoint also changed, so this is a representative scene-cost comparison, not an isolated GPU speed multiplier. Both versions reached approximately 16.8 ms p95 frame intervals on the remote GPU; this does not establish smoothness on the user's device. The full geometry is retained, so a slower device may still justify a separate shelf LOD later.

The same room gesture review caught an out-and-back drag being mistaken for a click because native hit handling checked only the final displacement. It now remembers maximum movement and suppresses activation after any qualifying drag. Tests keep room mode active after that gesture.

Integration checks verify center position, aligned cabinet bounds, actual model triangle/bounds preservation, batching, original transmission material preservation and source-resource ownership. The earlier M2 off-center assertions were updated to the user's centered-view requirement. The M18 physical table test now samples a visible central patch instead of the near edge that moved behind the desktop toolbar; it explicitly asserts the target is the canvas before clicking.

Revision artifacts: `artifacts/m20-room-revision/` remotely; performance/log copies in local `artifacts/m20-room-results/`, room/cabinet/door captures in `artifacts/m20-room-layout/`. Earlier cumulative failures and physical-device acceptance remain open as documented below.

Final validation: production build, **239 integration tests / 33 files**, and **36/36 browser checks** passed without retries or skips. The browser run includes all 27 camera scenarios and nine film-shelf navigation regressions across desktop Chrome, mobile Chrome and mobile WebKit. Final production release: `f7d051aaaa63b1f21342`. Run `npm run build`, `npm run test:integration`, then `PLAYWRIGHT_PORT=5283 PLAYWRIGHT_WORKERS=3 npx playwright test tests/e2e/m20-room-performance.spec.ts tests/e2e/m20-initial-camera.spec.ts tests/e2e/m20-camera-shelf.spec.ts tests/e2e/m20-render-performance.spec.ts tests/e2e/m20-camera-cache.spec.ts tests/e2e/m18-shelf-navigation.spec.ts`. Final browser log: `artifacts/m20-room-revision/final-tests.log` remotely and `artifacts/m20-room-results/final-tests.log` locally.

After aiming the benchmark directly at the actual camera and asserting its projected center is onscreen, the final desktop room sample recorded about **102 draw commands/frame** versus 234 looking toward the film cabinet, with **16.8 ms p95 frame interval**. The shelf uses at most 30 batches in all browser variants. Screenshots were inspected for the centered start, cabinet framing/materials, phone presentation and complete rear developing station. Both verified preview URLs serve the latest build from the remote `infra` checkout.

One intermediate run reproduced the previously recorded film-shelf drag-during-transition timing failure on desktop. It passed before and in the final run without changing that gesture assertion; this does not establish a fix for its intermittent behavior. The older complete gate was not rerun or reclassified as passing.

## First user feedback revision — 2026-09-19

The user reported delayed shelf appearance, stuttering inspection, insufficient cabinet capacity and unsuitable placement. All four behaviors were revised as described above. The selected GLB, textures, checksum and 210 mm scale are unchanged.

The original inspection callback cleared its animation handle before `controls.update()`. That update emitted a synchronous `change` event, scheduling another frame, while the current callback also scheduled its successor. Rotation therefore accumulated duplicate render chains. The reusable `render-loop.js` keeps the scheduled handle throughout drawing and schedules only one successor; its scheduler test reproduces reentrant invalidation, checks a maximum queue size of one and verifies settling/disposal.

On the same remote desktop Chrome/Vulkan setup with the actual 670,713-triangle model, a 24-move drag benchmark changed from **106 maximum callbacks per animation timestamp and 50.1 ms p95 frame interval** to **one callback and 16.8 ms**. Mobile Chrome/WebKit emulation also recorded one callback, with approximately 17 ms p95 intervals. These are remote browser measurements, not physical iPhone/iPad performance claims. JSON evidence: ignored `artifacts/m20-revision-performance/` locally and `artifacts/m20-performance/` remotely.

Revision checks: production build and **238 integration tests / 33 files passed**; **34/34 focused browser tests passed** across desktop Chrome, mobile Chrome and mobile WebKit, including all 24 camera checks, initial-load blocking/release, render scheduling, offline/graphics recovery, responsive re-entry, nine film-shelf navigation checks and the loading-page regression. The enlarged cabinet initially exposed nameplate/toolbar overlap in short landscape; responsive placement keeps the label clear of both the toolbar and camera.

Commands: `npm run build`, `npm run test:integration`, and `PLAYWRIGHT_PORT=5283 PLAYWRIGHT_WORKERS=3 npx playwright test tests/e2e/m20-initial-camera.spec.ts tests/e2e/m20-render-performance.spec.ts tests/e2e/m20-camera-shelf.spec.ts tests/e2e/m20-camera-cache.spec.ts tests/e2e/loading-page.spec.ts tests/e2e/m18-shelf-navigation.spec.ts`. The earlier full-gate failures below were not rerun or reclassified. Logs and placement captures: remote `artifacts/m20-revision/`, local `artifacts/m20-revision-images/`; landscape captures under `artifacts/m20-candidates/` remotely and `artifacts/m20-revision-final-images/` locally. No visual baselines were approved.

After the final landscape label adjustment, production build and **9/9 affected checks** passed again: initial loading, physical camera taps/drag exit, and responsive graphics recovery/re-entry in all three browsers. Final release: `53db0a43e139988d0551`; log `artifacts/m20-revision/framing-tests.log`. The initial focused run's three responsive failures were corrected rather than skipped. Visual review covers the enlarged shelf on desktop/phone, landscape re-entry and relocated door equipment. The active preview remains on port 5280, serving this checkout's rebuilt distribution; both localhost and verified MacBook Tailscale URLs respond successfully.

## Original implementation validation evidence

- Local worktree: Orca `infra`; mapped runtime: `/workspace/worktrees/orca/film_photo/infra`.
- Sync: `rs-film-photo-orca-infra-4d2f70d66b16`, two-way-safe, connected endpoints, no reported conflict; flushed before runtime commands.
- Production build and all **237 integration tests / 32 files passed**. The new geometry test uses actual GLB meshes/node transforms and embedded binary buffers, omitting only image decoding in Node; browser checks load all real materials/textures. Final built release: `a52f7f9c681ece5b5425`.
- Final focused production browser run: **30/30 passed** without retries/skips, across desktop Chrome, mobile Chrome and mobile WebKit. This includes all **18 M20 checks** and 12 film-shelf, loupe and update regressions. Scenarios cover all rendered sides, history/focus, physical entry/click, drag exit, reversal, keyboard, resizing, touch rotation/pinch/pan, load/cache failure and recovery, offline/stopped-server reopening, graphics loss/retry and repeated visits without extra model requests or growing geometry counts.
- After correcting projected-label pointer capture, **8/8 repeated WebKit resize/recovery/re-entry checks passed** under three workers. Before the fix, the same scenario failed in both the cumulative run and repeated focused runs. Event evidence showed down/up on different projected descendants followed by a click on the page; capture now keeps that press owned by the button until an actual shelf drag transfers it.
- Standalone `npm test`, `npm run test:reuse`, and `npm run test:browser` passed after the shared-core/catalog changes. Desktop/iPad real-model browser checks reported no page errors, with 670,713 triangles; report under shared `ignored_generated/model-viewer/qa/2026-09-20T01-02-41-488Z/`.
- Complete `npm run validate:m20` attempt: **195/218 E2E passed; 23 failed**, after a passing build/integration phase. Its `&&` chain stopped at E2E; the three standalone commands were run independently afterward. The full historical gate was not reclassified as passing after scoped corrections. Full log: `artifacts/m20-candidates/gate.log`; final scoped log: `artifacts/m20-candidates/final-checks.log` remotely and `artifacts/m20-final/final-checks.log` locally.
- Candidate screenshots: remote `artifacts/m20-candidates/`, final local copies `artifacts/m20-final/`. These are review candidates, not approved regression baselines.
- Visual inspection covered front, rear, both sides, top and underside, desktop/1024 px inspection, and the phone shelf. Final phone review caught and corrected the canvas-to-overlay offset so the label sits below the camera. The final production rebuild and **18/18 camera checks passed again** after that projection-only correction; log `artifacts/m20-candidates/final-camera.log`.

The final scoped command used `PLAYWRIGHT_PORT=5283 PLAYWRIGHT_WORKERS=3`, the two `m20-camera-*.spec.ts` files plus M17 loupe/M18 film-shelf, shelf-navigation and offline specs, selecting the six M20 scenarios and `scene optics|cabinet click|transitions keep|update download is atomic`. The full gate used port 5279 and three workers. All runtime commands were run after flushing the matching checkout.

## Cumulative failures and remaining work

An isolated detached checkout at starting commit **`3296430`** was synchronized independently to `/workspace/worktrees/orca/film_photo/m20-baseline-check`. Baseline build passed. Focused comparisons reproduced **16** of the cumulative failures without M20:

- M10 ordered transmission: the same road-frame detail deviation, 3.7863 versus required >4.
- M11 keyboard selector matches both loading and application headings; combined stock test records ten detail requests versus its expected five.
- M12 three library cases: cancellation return focus, loader intercepting the unavailable-local-roll return link, and an obsolete crop/review navigation target.
- M13 room illumination sampling and all five photo-independence comparisons.
- M2/M4 historical fixed-screen room luminance samples, and M6/M7 legacy 100% zoom expectations versus current 491% framing.

Three other failures—desktop film-cabinet drag pose, mobile Chrome transition timing, and WebKit loupe positioning—passed isolated baseline checks and the final scoped run. Their cumulative intermittency remains recorded; a later passing run does not establish that their timing sensitivity is resolved.

Three update failures came from asserting that the entire Cache Storage inventory contained only the film cache. The test now checks the app-cache namespace and separately asserts that the actual downloaded camera bytes survive activation. All three browser variants pass. The remaining M20 WebKit re-entry failure was corrected with pointer capture as described above.

Resume M20.4 by resolving the inherited historical assertions/behavior and timing-sensitive checks, then obtain a clean complete `validate:m20` run and physical-device acceptance. No old assertions were weakened, skipped, or removed to claim completion. The one changed historical test explicitly verifies the newly required camera-cache preservation behavior.

The temporary baseline checkout was removed after stopping its own synchronization session. Additional comparison logs were copied to local ignored `artifacts/m20-baseline-comparison/`; the main cumulative log retains every original failure and assertion.

## Diagnostics and limits

Initial checks exposed and corrected a Cameras-button/header overlap, return-focus timing, dark shelf materials, and a disappearing offline-download action. A physical-click test initially targeted the empty side of the shelf because its world Z coordinate had the wrong sign; corrected to the visible camera location. The initial standalone test used slow software rendering; its real-model gate now uses the same hardware Chrome/Vulkan configuration as the main app on Linux and has bounded action timeouts.

The remote checkout initially lacked packaging source assets and the standalone Playwright browser. Assets were transferred with checksums. The browser installer removed other cached browser versions automatically; those versions were restored with garbage collection disabled before continuing validation. Vite retains its large-entry-chunk warning (about 1.29 MB before gzip); the model itself downloads independently, now concurrently with essential film loading.

Physical iPhone/iPad Safari and Home Screen review has not been performed. Automated touch and WebKit emulation are distinct from device acceptance. As in M18, Playwright WebKit's offline emulation rejects service-worker navigation before dispatch: Chrome checks `navigator.onLine=false`, while WebKit exercises failed model responses and a stopped production server. No approved image baselines were changed; routine video recording remains off. No existing deployed service was restarted or modified.
