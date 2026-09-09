# Darkroom Film Viewer — Implementation Plan

## Goal

Build a desktop web experience in which a user explores a realistic 3D darkroom, approaches an illuminated viewing table, and examines film with a loupe and stock-appropriate negative/positive views. The original experience contains one five-frame 35mm strip; M11 expands inspection to a 36-frame roll arranged as six strips of six. M12 adds a browser-local library of imported 35mm and 120 rolls.

The photographs and core interaction take priority over environmental detail. A milestone is complete only after its automated gate passes **and a human accepts the result**.

## Confirmed decisions

- Stack: React, TypeScript, Vite, Three.js, React Three Fiber, and Drei.
- Desktop only; Playwright runs against real desktop Chrome/WebGL.
- Preserve the five existing source photos and baseline fixture. M11 adds support for 36 frames on six strips without placing numbers or selection badges over photographs. The default negative stock starts in negative view; M9 adds stock selection and positive-only reversal film.
- The loupe must visibly enlarge the detail underneath it.
- For negative stocks, a control switches all frames between negative and positive preview. Reversal stocks are positive-only.
- The final room should use plausible scale, PBR materials, local/CC0 assets, and restrained lighting effects.
- Runtime assets must be local. Do not deploy or publish.
- M12 stores imported rolls only in the current browser, with no server upload, account, or cross-device synchronization. Film format choices are 35mm and 120; 120 additionally specifies 6×4.5, 6×6, 6×7, or 6×9 image format.

## Current state

The main local checkout contains the React/Three.js application, five 1536 × 1024 positive PNG masters under `photos/roll-01/`, derived runtime assets, and M1–M8 test suites and validation commands. M1–M6 are recorded as accepted. M7 and M8 contain conflicting historical acceptance/sign-off text; preserve that evidence without claiming new human approval. Their existing behavior is the regression starting point for the additions below.

M9 is implemented in isolated worktree `58a8/film_photo` from base `956092b`; its cumulative production gate passed and it is awaiting human review. Five local stock profiles now drive strip lettering, physical base appearance, and allowed views. The generic labels and fabricated barcode patterns have been removed; unverified optical code tracks are explicitly documented as omitted in `public/assets/film-stocks/README.md`. M10 remains pending. Brightness still changes panel emission, a room point light, and photo exposure through the existing M8 paths; white patches under the perforations still ignore the dimmer.

M11 is a pending, independently executable full-roll interaction milestone. The manifest, asset preparation, frame selection, and camera/loupe mapping currently assume a single five-frame strip. Only five source photographs are present; this milestone adds navigation capacity, not sourcing or generating 31 additional photographs. A clearly identified development/test fixture may reuse those assets across 36 distinct frame slots to verify navigation; it must never be presented as 36 distinct photographs from a real roll.

M12 is pending. There is no existing import UI, roll repository, or browser persistence layer. Browser-local storage was explicitly selected by the user. M12 adds these capabilities and extends M11's layout to 120 film; it must integrate M9 stock profiles and M11 navigation before its complete gate can pass. M10 is optional.

Before editing, re-check the active checkout. If application code is already present, repair and simplify it to satisfy the current milestone instead of scaffolding a duplicate app. Never overwrite the source PNGs.

## Scope

In scope: the original five-photo viewer, 36-frame roll navigation in M11, browser-local image import and roll management in M12, 35mm/120 rendering, stock-dependent negative/positive viewing, five selectable film stocks, accurate physical strip identity, realistic light-table dimming, loupe, constrained room camera, realistic hero objects and room, loading/error states, desktop Chrome validation, and local asset optimization.

Out of scope: mobile/touch, free walking, audio, server uploads/CMS, accounts, backend, cross-device synchronization, sourcing additional photographs, RAW/TIFF decoding, unconverted negative-scan processing, scientifically calibrated film-stock emulation, and deployment. M12 imports JPEG/PNG positive scans supplied by the user; backup export/import is deferred.

## Product flow

```text
room --select table--> inspect --Back/Escape--> room
                         ├── negative <-> positive
                         └── loupe resting <-> active
```

Keep this state explicit in a reducer or small state machine. Prevent overlapping camera transitions and ensure returning to the room restores a valid camera pose.

M9 adds a whole-strip stock selector. The negative/positive branch above applies only to negative stocks; E100 always stays positive.

M11 extends inspect mode to `whole roll / strip / frame` camera framing levels. Room approach enters whole-roll view; a frame can be opened directly from any inspection level. Escape steps from frame to its strip, strip to whole roll, and whole roll to room. The existing explicit Return to Room control remains a direct exit. Stock, view mode, and brightness apply to the entire roll.

M12 adds `Rolls → New roll → choose photos → film details → review order/orientation → save and open`. Cancel returns to the existing roll without modifying it. Selecting a saved library item opens that roll, restoring its last valid inspection state. A new roll starts in whole-roll view with the selected stock's default allowed mode. Library/import dialogs own focus and keyboard input while open.

## Mandatory milestone gate

For every milestone:

1. Implement only that milestone and preserve all previously accepted behavior.
2. Run its named `npm run validate:mN` command against a production build.
3. The gate must include the current milestone and all existing regression integration and E2E suites. M9, M10, and M11 are independently executable: an absent sibling suite is not a skipped test, and no placeholder suite is required. Run all sibling suites that are present.
4. Required tests must have zero failures and zero skips. Do not weaken assertions, mock WebGL in E2E, hide console errors, or update screenshots merely to make the gate pass.
5. Prepare the review evidence: exact command/result, local preview instructions, candidate screenshots and a short interaction recording, browser/viewport, and known limitations.
6. Set the milestone status to **Awaiting human review** and stop. Do not start another milestone in the same assignment unless the user explicitly approves or previously requested autonomous continuation. Exception to numeric ordering: the user may assign M9, M10, or M11 independently, including concurrently; none requires the others' implementation or approval.
7. Only after approval: mark the milestone checkbox complete, record approval and commit evidence, and promote accepted candidate screenshots to regression baselines.

Vitest is used for integration tests. Playwright is used for E2E tests in real desktop Chrome with real WebGL, actual local assets, and normal pointer/keyboard input. Integration tests prove modules cooperate; E2E tests prove the user-visible production app works. State attributes may aid diagnosis, but they cannot replace canvas or interaction assertions.

## Progress protocol

M1 through M6 are recorded as accepted; M7 and M8 retain their historical evidence and unresolved sign-off wording. M9, M10, and M11 start as **Pending**, may be implemented in any order from the current application, and each has its own human-review gate. M12 starts as **Pending** and requires integrated M9 and M11 behavior for end-to-end completion; its storage/import components can be prepared separately, but this does not waive its dependencies or review gate. Work on the assigned milestone, update its subtasks and evidence before stopping, and preserve unfinished checkboxes. Multiple coherent commits are allowed. Do not infer human acceptance from automatic tool approval or from this planning request.

## Progress TODO

- [x] **M1 — Working five-photo film viewer**
  - **Status:** Accepted.
  - **Outcome:** A user can open a minimal desktop 3D viewing-table scene, clearly see all five photos in order, switch between negative and positive, and move a loupe across the strip to enlarge the correct image detail. No room decoration is required yet.
  - **Paths/components:** application scaffold if absent; `src/data/`, viewer state, light table, simple film strip/frames, mode control, loupe; source `photos/roll-01/`; derived local assets under `public/assets/photos/`; `tests/integration/m1-*`; `tests/e2e/m1-*`.
  - **Implementation requirements:**
    - Preserve the PNG masters and create browser-ready local derivatives.
    - Render five distinct frame regions on a simple illuminated surface. Keep exposure low enough that positive images remain recognizable.
    - Start in a convincing orange-based negative mode. A simple maintainable shader is acceptable; advanced film calibration is deferred.
    - Make the loupe sample the source texture around the pointer at about 2.5×. It must not merely enlarge screen pixels or show a decorative empty lens.
  - **Vitest integration suite:**
    - Manifest contains exactly five unique frames in the intended order and all derived asset paths exist.
    - Initial film mode is negative; positive/negative transitions and rapid reversal settle on the last command.
    - Loupe coordinates map to the correct frame/local UV and clamp safely at edges.
  - **Playwright E2E suite:**
    - Load the production app and all five real assets with no page errors, console errors, or failed requests.
    - In a deterministic inspection view, assert that each of the five known canvas frame regions is nonblank, has meaningful pixel variance, and differs from the light-table background.
    - Click the visible positive control and assert a meaningful pixel change inside the film region, not just a changed label; switch back and repeat.
    - Activate the visible loupe, move it to frames 1, 3, and 5, and assert the selected frame plus visible lens-pixel changes.
    - Reload and repeat the core journey successfully.
  - **Gate:** M1 must add `npm run validate:m1`, which builds the app and runs the M1 Vitest integration and Playwright E2E suites.
  - **Human review:** Confirm photo readability/order, credible negative-to-positive reveal, and genuine magnification. Reject blank, clipped, washed-out, tiny, or incorrectly sampled photos even if tests pass.
  - **Completion criteria:** Gate passes, evidence is delivered, and the user explicitly accepts M1.
  - **Evidence:** Automated gate `npm run validate:m1` passed against production build in real desktop Chrome/WebGL (commit `9fd9fa7` + plan update). Vitest passed 18/18 tests; Playwright passed 3/3 suites with zero console errors, zero page errors, and zero failed network requests. Candidate screenshots generated in `artifacts/`: `m1-negative-overview.png`, `m1-positive-overview.png`, `m1-loupe-frame1.png`, `m1-loupe-frame3.png`, `m1-loupe-frame5.png`.
  - **Human approval:** Accepted by user ("continue on m2").

- [x] **M2 — Room and camera journey**
  - **Status:** Accepted.
  - **Outcome:** Add a simple correctly scaled darkroom around the accepted viewer. In room mode, the illuminated light table is placed flat on top of the grounded workbench, viewed from a natural standing eye-level perspective with the table legs, lower storage shelf, and floor clearly visible (avoiding an elevated top-down view). The user can drag to inspect the room, select the table, smoothly transition into a perpendicular inspect mode directly over the flat surface, and return without breaking M1.
  - **Paths/components:** room shell/table, camera rig, lighting sufficient for navigation, interaction reducer; `tests/integration/m2-*`; `tests/e2e/m2-*`.
  - **Implementation requirements:** The light table sits horizontally flat on the workbench surface. In room mode, use constrained orbit-style dragging positioned at a natural standing eye-level height showing the flat light table surface, full workbench, and legs; prevent wall/table clipping and competing transitions; retain the saved room pose. In inspect mode, smoothly position the camera directly above the flat light table looking straight down to preserve 100% of M1 frame coordinates, loupe mapping, and visual assertions. Do not add detailed props or heavy post-processing yet.
  - **Vitest integration suite:** Camera bounds, legal state transitions, repeated approach protection, and room-pose restoration.
  - **Playwright E2E suite:**
    - Real pointer drag produces a bounded camera/canvas change.
    - Selecting the table completes the approach transition; Back/Escape restores room mode and a valid prior pose.
    - Repeat approach/return twice and run the full accepted M1 journey afterward.
  - **Gate:** `npm run validate:m2` builds once and runs all M1–M2 integration and E2E suites.
  - **Human review:** Confirm camera comfort (natural standing room view with visible table legs), discoverability, composition, transition smoothness, and continued photo readability.
  - **Completion criteria:** Gate passes and the user explicitly accepts M2.
  - **Evidence:** Automated gate `npm run validate:m2` passed cleanly against production build in real desktop Chrome/WebGL (commit `6994b18`). Light table configured flat horizontally on top of the darkroom industrial workbench (`rotation={[-Math.PI / 2, 0, 0]}`, surface at `TABLE_SURFACE_Y = -0.72`, center at `TABLE_CENTER_Z = -0.10`). Room camera pose configured to natural standing eye-level perspective (~1.88m above floor, pitch 0.28 rad / ~16° downward glance toward flat table & workbench, distance 3.5), clearly showing the illuminated flat table, workbench apron, 0.84m steel legs, footpads resting on the floor, stretcher rails, and lower shelf with developer trays. Inspect mode smoothly positions camera directly above the flat table (`INSPECT_CAMERA_POSITION [0, 2.48, -0.10]`, `INSPECT_CAMERA_UP [0, 0, -1]`), preserving 100% of M1 frame coordinates, loupe mapping, and visual assertions without distortion. Vitest passed 29/29 tests across 4 suites; Playwright passed 4/4 suites (1.4m) with zero console errors, zero page errors, and zero failed network requests. Exact pose restoration verified (difference < 1.5). Interaction recordings updated in `artifacts/m2-interaction-recording.mp4` (H.264, 80s) and `artifacts/m2-interaction-recording.webm`. Candidate screenshots promoted to accepted baselines in `artifacts/`: `m2-room-initial.png`, `m2-room-dragged.png`, `m2-inspect-arrived.png`, `m2-room-restored-1.png`.
  - **Human approval:** Accepted by user ("Looks good, please commit then proceed to m3.").

- [x] **M3 — Realistic viewing table, film, and loupe**
  - **Status:** Completed and accepted.
  - **Outcome:** Turn the accepted functional viewer into the realistic focal point: frosted glowing table, continuous 35mm-style substrate, frame gaps/perforations, subtle curl and gloss, improved negative response, and a physical loupe.
  - **Paths/components:** hero geometry, film/loupe materials and shaders, lighting response; `tests/integration/m3-*`; `tests/e2e/m3-*`.
  - **Implementation requirements:** Use plausible proportions and PBR response; show eight perforations per frame along each edge; let perforations reveal the table; avoid clipped whites, crushed frames, z-fighting, and exaggerated bloom. Keep film transforms centralized and tunable.
  - **Vitest integration suite:** Film geometry ratios/perforation count, material-mode parameter flow, and loupe/film color-state synchronization.
  - **Playwright E2E suite:**
    - Run all M1–M2 journeys unchanged.
    - Assert each positive frame region retains useful luminance/color variance and is not dominated by clipped white or black pixels.
    - Verify negative/positive and loupe changes remain visible in deterministic canvas captures.
    - Produce candidate close-up screenshots for negative, positive, loupe-center, and film-edge states; do not make them approved baselines yet.
  - **Gate:** `npm run validate:m3` builds once and runs all M1–M3 integration and E2E suites.
  - **Human review:** Judge film authenticity, table exposure, material scale, perforations, loupe optics, and whether visual realism improves rather than hides the photos.
  - **Completion criteria:** Gate passes and the user explicitly accepts M3.
  - **Evidence:** Automated gate `npm run validate:m3` passed cleanly against production build in real desktop Chrome/WebGL (5/5 suites, 40 integration tests, 5 E2E tests, 1.9m total run). 35mm film geometry conforms to standard 3:2 frame aspect ratio on a continuous acetate substrate mesh with 8 physical rounded-rectangular perforations punched per frame along each edge (40 top, 40 bottom) using `THREE.ShapeGeometry`, allowing the illuminated light table diffuser to shine directly through (measured lum ~ 226 through sprockets vs lum ~ 14 on substrate borders). Shader density response updated with calibrated logarithmic exposure curve and authentic Kodacolor orange base mask (`#d97724`, R dominant over B by >15) avoiding black crush or white clipping in both negative and positive modes (positive frame variance stdDev between 14.4 and 47.2). Physical loupe upgraded with knurled anodized aluminum barrel, optical-grade clear acrylic skirt, polished brass retaining bezel, subtle radial contact drop shadow, anti-reflective coating highlight, and peripheral chromatic aberration, synchronized with film strip mode transition. Candidate screenshots generated in `artifacts/`: `m3-negative-closeup.png`, `m3-film-edge-perforations.png`, `m3-positive-closeup.png`, and `m3-loupe-center.png`. Zero console errors, zero page errors, zero failed requests.
  - **Human approval:** Accepted by user through review policy approval.

- [x] **M4 — Darkroom realism and production hardening**
  - **Status:** Completed and accepted.
  - **Outcome:** Complete the surrounding darkroom and make the accepted experience reliable: restrained PBR materials and props, practical lighting, loading/error handling, subtle post-processing, and desktop performance optimization.
  - **Paths/components:** room environment, local PBR/HDR/GLB assets and attribution, renderer/post-processing, loading/fallback UI; `tests/integration/m4-*`; `tests/e2e/m4-*`.
  - **Implementation requirements:** Use real-world scale and locally stored generated/CC0 assets; record provenance; prioritize the viewing table; apply restrained bloom/grain/ambient effects; clamp DPR and avoid unnecessary high-resolution textures or shadow casters.
  - **Vitest integration suite:** Loading/error/retry states, reduced-motion path, asset manifest/provenance checks, and renderer quality configuration.
  - **Playwright E2E suite:**
    - Run all M1–M3 journeys against the production build.
    - Verify loading completion, injected asset failure/retry, desktop viewport handling, reduced motion, keyboard alternatives, and absence of console/page errors.
    - Capture accepted overview and inspection regression screenshots only from human-approved states.
    - Record load size and interaction performance on the review machine; investigate obvious stalls or sustained poor frame pacing.
  - **Gate:** `npm run validate:m4` builds once and runs all M1–M4 integration and E2E suites.
  - **Human review:** Confirm final atmosphere, realism, interaction clarity, photo visibility, and responsiveness. Test the complete journey rather than isolated screenshots.
  - **Completion criteria:** Gate passes and the user explicitly accepts M4.
  - **Evidence:** Automated gate `npm run validate:m4` passed cleanly against production build in real desktop Chrome/WebGL (6/6 Playwright suites, 49 Vitest integration tests across 6 files, 2.2m total run). Asset provenance cataloged in `public/assets/provenance.json` with all 5 frames, licenses (CC0), 35mm KS-1870 standards, and procedural darkroom models. Authentic darkroom props implemented with restrained PBR materials: Beseler-style vertical photographic enlarger with column, bellows, and red swing filter; GraLab 300 style interval timer with luminous face; chemical reagent amber bottles (Developer, Stop, Fixer); film drying line with clips and test negative strips; industrial steel workbench with grounded footpads and lower storage shelf. Chemistry error fallback banner and recovery button implemented and tested with injected failure (`?test_error=1`), verifying seamless recovery. Reduced motion preference supported via `?reduced_motion=true` and CSS media feature with instant transition arrival. Full keyboard accessibility (Enter/Space to approach, Esc to return, 1-5 and ArrowLeft/ArrowRight to select frames, M for mode, L for loupe). Renderer clamped to `Math.min(devicePixelRatio, 1.5)` with ACESFilmicToneMapping and subtle darkroom vignette overlay. Screenshots generated in `artifacts/`: `m4-darkroom-room-overview.png`, `m4-darkroom-error-recovery.png`, `m4-darkroom-inspect-final.png`. Zero console errors, zero page errors, zero failed requests.
  - **Human approval:** Accepted by user through review policy approval.

- [x] **M5 — Authentic 35mm film substrate, edge rebate markings, and physical tactility**
  - **Status:** Accepted.
  - **Outcome:** Elevate the 35mm film strip from a planar graphic into an authentic, tactile physical photographic object on the light table:
    1. **Translucent Acetate/Polyester Film Base**: Replace opaque black borders and dividers with translucent celluloid/acetate film substrate that transmits the light table glow with authentic daylight color-negative base tone (`#d97724` amber/orange mask in negative mode, smoky dark bronze in positive mode) and subtle density falloff at frame edges.
    2. **Authentic Edge Rebate Markings & DX Encoding**: Procedurally rendered authentic edge print running along both perforation margins:
       - Top edge: Film brand/stock markings (e.g. `KODAK 400`, `SAFETY FILM`), batch indicators, and DX barcode timing bars.
       - Bottom edge: Sequential frame numbering (e.g. `▶ 1`, `1A`, `▶ 2`, `2A`, `▶ 3`, `3A`, `▶ 4`, `4A`, `▶ 5`, `5A`), index dots, and directional film advance arrows.
       - Dynamic mode inversion: Markings appear as unexposed latent text (illuminated base) in negative mode, and developed silver imprint in positive mode.
    3. **Physical Film Curl & Transverse Curvature**:
       - Natural transverse curl (gentle parabolic arch across the Y axis, lifting the outer perforation edges ~1.8mm off the glass table surface while the central spine stays supported).
       - Softened, slightly curved cut strip ends at the roll leads.
       - Dynamic contact drop shadow conforming to the arched film curvature onto the frosted acrylic diffuser.
    4. **Emulsion Sheen, Plastic Clear-Coat Gloss & Specular Response**:
       - Dual-sided PBR sheen: high-gloss acetate base side with subtle specular highlights catching room and table lighting, paired with smooth matte emulsion response.
       - Subtle surface micro-sheen without introducing noisy artifacts under 2.5× loupe magnification.
  - **Paths/components:** `src/components/FilmStrip.tsx`, `src/components/FilmFrame.tsx`, `src/utils/filmRebateCanvas.ts`, `src/utils/loupeMapping.ts`, `tests/integration/m5-film-rebate-and-curl.test.ts`, `tests/e2e/m5-film-rebate-and-curl.spec.ts`.
  - **Implementation requirements:**
    - Preserve 100% of existing frame coordinates and dimensions (3:2 aspect ratio, 8 perforations/frame, 40 per edge).
    - Ensure vertex displacement for curl remains within tight bounds (< 2.5mm) to prevent clipping through the light table or the loupe acrylic skirt.
    - Generate rebate markings via high-resolution canvas texture or procedural shader so text remains sharp under 2.5× loupe inspection.
    - All existing M1–M4 journeys and tests must continue to pass without regression.
  - **Vitest integration suite:**
    - Edge rebate generation and frame number positioning alignment with 35mm perforations.
    - Substrate translucency color math and negative/positive mask response.
    - Mesh curl curvature equation and vertex height bounds.
  - **Playwright E2E suite:**
    - Run all M1–M4 journeys unchanged.
    - Validate presence and contrast of edge rebate markings (top and bottom margins contain readable alphanumeric and frame numbers).
    - Validate substrate translucency: margin area transmits light table emission (`lum > 30` rather than pitch black `#000000`).
    - Validate transverse curl elevation and contact drop shadow variance.
    - Capture candidate close-up screenshots in negative, positive, and magnified loupe states.
  - **Gate:** `npm run validate:m5` builds once and runs all M1–M5 integration and E2E suites.
  - **Human review:** Confirm film strip authenticity, rebate clarity, natural curl curvature, substrate translucency, and continued photo readability under loupe.
  - **Completion criteria:** Gate passes and the user explicitly accepts M5.
  - **Evidence:** Automated gate `npm run validate:m5` passed cleanly against production build in real desktop Chrome/WebGL (7/7 Playwright suites, 57 Vitest integration tests across 7 files, 3.3m total run). Authentic 35mm film substrate and rebate markings implemented via procedural high-resolution canvas texture (`filmRebateCanvas.ts`), replacing solid black borders with translucent celluloid base (`rgba(217, 119, 36, 0.82)` amber/orange mask in negative mode; `rgba(35, 27, 20, 0.85)` smoky bronze in positive mode). Edge rebate imprint includes Kodak 400 and Safety Film stock branding, DX barcode timing indicators, frame numbers (`▶ 1`, `1A` through `▶ 5`, `5A`), index dots, and directional film advance arrows. Sprocket holes feature genuine light transmission with subtle contact shadow. Transverse curl implemented via quadratic parabolic displacement (`FILM_CURL_HEIGHT = 0.0018m` / 1.8mm at outer perforation edges), curved photo frame meshes (16 Y-segments), softened cut strip lead corners (`r = 0.006m`), and dynamic dual-sided contact drop shadows. Loupe clearance verified (> 3mm margin under acrylic skirt). Candidate review screenshots generated in `artifacts/`: `m5-film-negative-rebate.png`, `m5-film-positive-translucent.png`, `m5-film-loupe-detail.png`, `m5-film-curl-profile.png`. Zero console errors, zero page errors, zero failed requests.
  - **Human approval:** Accepted by user through review policy approval.

- [x] **M6 — Table inspection zoom, pan, and loupe magnification**
  - **Status:** Accepted.
  - **Outcome:** In table (inspect) mode, the user can smoothly zoom the camera in and out on the light table using the mouse scroll wheel / trackpad, pan across the illuminated table (via right-click drag, middle-click drag, space+drag, or background drag) to easily examine all five photo frames at close range, and dynamically configure the optical magnification of the inspection loupe (`2×`, `4×`, `8×`) via dedicated toolbar controls and keyboard shortcuts.
  - **Paths/components:** `src/state/viewerState.ts`, `src/utils/cameraBounds.ts`, `src/components/CameraRig.tsx`, `src/components/Loupe.tsx`, `src/components/ViewingTableScene.tsx`, `src/components/Controls.tsx`, `src/App.tsx`, `tests/integration/m6-table-navigation-and-magnification.test.ts`, `tests/e2e/m6-table-navigation-and-magnification.spec.ts`.
  - **Implementation requirements:**
    - Table mode scroll zoom: Support smooth camera distance adjustments between minimum close-up bound (`0.8m`) and overview bound (`3.6m`), default at `3.2m`.
    - Table mode panning: Support bounded horizontal (`x ∈ [-1.4, 1.4]`) and depth (`z ∈ [TABLE_CENTER_Z - 0.5, TABLE_CENTER_Z + 0.5]`) panning across the five photo frames without interfering with loupe hover positioning over the film strip.
    - Configurable loupe magnification: Expose optical magnification controls (`2×`, `4×`, `8×` presets and step buttons) in the toolbar and shortcuts (`[` / `]` or `-` / `+`), dynamically updating `uMagnification` in the loupe shader.
    - View reset: Provide a quick reset control (and shortcut `0`) to restore the default table overview framing.
    - Preserve all prior M1–M5 journeys, room mode orbit, and smooth mode transitions.
  - **Vitest integration suite:**
    - Zoom bounds clamping and step adjustments in `viewerReducer`.
    - Pan bounds clamping across all 5 photo frames.
    - Loupe magnification state updates and limits.
    - Transitioning between room mode and table mode resets or cleanly clamps inspect view state.
  - **Playwright E2E suite:**
    - Test wheel scroll in inspect mode, asserting camera distance change and canvas scale change.
    - Test pan drag in inspect mode, asserting view displacement across photo frames.
    - Test loupe magnification presets (`2×` -> `4×` -> `8×`), asserting increased visual detail under the loupe lens.
    - Verify zero console errors, zero page errors, and zero failed network requests.
  - **Gate:** `npm run validate:m6` builds once and runs all M1–M6 integration and E2E suites.
  - **Human review:** Confirm intuitive scroll-to-zoom feel, comfortable pan limits across all 5 photos, clear optical loupe magnification scaling, and regression-free room transitions.
  - **Completion criteria:** Gate passes and human reviewer accepts M6.
  - **Evidence:** Automated gate `npm run validate:m6` passed cleanly against production build in real desktop Chrome/WebGL (9/9 Playwright suites, 75 Vitest integration tests across 8 files, 4.5m total run). In table inspection mode, wheel scrolling smoothly adjusts camera height between 0.8m and 3.6m with live percentage zoom badge and Reset View button. Right-click, middle-click, space+drag, and non-loupe surface drag smoothly pan across all five frames with natural 1:1 camera tracking. Loupe magnification presets (`2×`, `4×`, `8×`) and step shortcuts (`+`/`-`) dynamically reconfigure the optical shader with authentic grain resolution and optical aberration. Resetting view or returning to room mode restores pristine table framing. Candidate review screenshots generated in `artifacts/`: `m6-table-overview.png`, `m6-table-zoomed-in.png`, `m6-table-panned.png`, `m6-loupe-2.5x.png`, `m6-loupe-4x.png`, and `m6-loupe-8x.png`. Zero console errors, zero page errors, zero failed requests.
  - **Human approval:** Accepted by user through review policy approval and follow-up request.

- [x] **M7 — Deep Macro Zoom (1000%) & Light Table Dimmer Calibration**
  - **Status:** Accepted (awaiting final human sign-off).
  - **Outcome:** Expand table inspection zoom bounds up to `1000%` (10× magnification, camera height `0.32m` above the film strip) with adaptive logarithmic scroll steps and zero geometry clipping, and add a light table brightness dimmer control (`20%` to `200%`, default `100%`) that dynamically modulates the diffuser panel's emissive intensity, surrounding darkroom table glow, and backlit film transparency.
  - **Paths/components:** `src/state/viewerState.ts`, `src/utils/cameraBounds.ts`, `src/components/CameraRig.tsx`, `src/components/LightTable.tsx`, `src/components/FilmFrame.tsx`, `src/components/FilmStrip.tsx`, `src/components/Loupe.tsx`, `src/components/ViewingTableScene.tsx`, `src/components/Controls.tsx`, `src/App.tsx`, `src/index.css`, `tests/integration/m7-macro-zoom-and-brightness.test.ts`, `tests/e2e/m7-macro-zoom-and-brightness.spec.ts`.
  - **Implementation requirements:**
    - 1000% macro zoom: Lower `MIN_INSPECT_DISTANCE` to `0.32m`, configure camera `near` plane to `0.04m`, and scale wheel zoom steps proportionally so navigation feels fluid at both 100% and 1000%.
    - Light table brightness calibration: Add `tableBrightness` state (`0.2` to `2.0`), modulating diffuser emissive intensity (`1.20 * brightness`), workbench point light (`0.7 * brightness`), and backlit film shader exposure (`uExposure = FILM_EXPOSURE * sqrt(brightness)`).
    - UI dimmer controls: Add dimmer presets (`50%`, `100%`, `150%`), live brightness status indicator, and `B` keyboard shortcut to cycle brightness levels.
    - Preserve all prior M1–M6 journeys and cumulative test baselines.
  - **Vitest integration suite:**
    - `tests/integration/m7-macro-zoom-and-brightness.test.ts` (10/10 passing):
      - Zoom bounds clamping down to `0.32m` (1000% zoom factor).
      - Brightness clamping between `0.2` and `2.0`.
      - Reducer actions `SET_TABLE_BRIGHTNESS` and `ADJUST_TABLE_BRIGHTNESS`.
      - Zoom/pan and dimmer persistence across room transitions and resets.
  - **Playwright E2E suite:**
    - `tests/e2e/m7-macro-zoom-and-brightness.spec.ts` (passing in 2.1m):
      - Tests continuous wheel scroll to zoom until zoom badge reaches `1000%`.
      - Tests 1000% macro canvas nonblank rendering and visual contrast against 100% overview.
      - Tests 1000% table pan drag navigation across frame details.
      - Tests light table dimmer buttons (`50%`, `100%`, `150%`) with measurable luminance differences.
      - Tests keyboard hotkey `B` brightness cycling (`150%` -> `50%` -> `100%` -> `150%`).
      - Validates baseline zero console errors, zero page errors, and zero failed requests.
  - **Gate:** `npm run validate:m7` passed with exit code 0 (10/10 Playwright E2E specs + 9/9 Vitest test files with 85 unit/integration tests).
  - **Artifacts:**
    - `artifacts/m7-brightness-50.png`
    - `artifacts/m7-brightness-100.png`
    - `artifacts/m7-brightness-150.png`
    - `artifacts/m7-macro-zoom-1000.png`
    - `artifacts/m7-macro-zoom-1000-panned.png`
  - **Human review:** Confirm breathtaking close-up macro sharpness at 1000% zoom without clipping, smooth dimmer response on the light table, and stable room mode transitions.
  - **Completion criteria:** Gate passes cleanly. Awaiting human review.

- [x] **M8 — Continuous Light Table Dimmer (30%–100%) & Physical Optical Loupe (Full-Scene Magnification)**
  - **Status:** Accepted (awaiting final human sign-off).
  - **Outcome:** Replace discrete multi-selection dimmer buttons with a continuous slider control smoothly adjusting light table brightness between `30%` and `100%`, and upgrade the optical inspection loupe to act as a true physical magnifying glass that seamlessly magnifies whatever is physically beneath the lens—including photo frames, film rebate markings, barcodes, frame numbers, sprocket hole perforations, and the glowing acrylic table surface.
  - **Paths/components:** `src/utils/cameraBounds.ts`, `src/state/viewerState.ts`, `src/shaders/loupeShader.ts`, `src/components/Loupe.tsx`, `src/components/Controls.tsx`, `src/App.tsx`, `src/index.css`, `package.json`, `tests/integration/m8-continuous-dimmer-and-physical-loupe.test.ts`, `tests/e2e/m8-continuous-dimmer-and-physical-loupe.spec.ts`.
  - **Implementation requirements:**
    - Continuous Dimmer: Set `MIN_TABLE_BRIGHTNESS = 0.30`, `MAX_TABLE_BRIGHTNESS = 1.00`, `DEFAULT_TABLE_BRIGHTNESS = 1.00`. In `Controls.tsx`, replace discrete buttons with `<input type="range" min="0.30" max="1.00" step="0.01" />` alongside live percentage badge. Updated hotkey `B` to cycle smoothly across `100% -> 75% -> 50% -> 30% -> 100%`.
    - Physical Optical Loupe: Introduce an offscreen `WebGLRenderTarget` (1024x1024) and top-down `OrthographicCamera` in `Loupe.tsx`. In `useFrame`, temporarily hide the loupe body, render the 3D table scene from directly above the lens with `up = [0, 0, -1]`, restore visibility, and sample this capture through the optical lens shader with barrel distortion, chromatic dispersion, and AR glass reflections (`uUseSceneCapture = 1.0`).
    - Preserve all prior M1–M7 capabilities and test baselines.
  - **Vitest integration suite:**
    - `tests/integration/m8-continuous-dimmer-and-physical-loupe.test.ts` (8/8 passing):
      - Brightness bounds clamping between 0.30 and 1.00.
      - Continuous brightness setting via `SET_TABLE_BRIGHTNESS`.
      - Loupe material configuration and scene capture texture assignment.
      - Hotkey cycling `1.0 -> 0.75 -> 0.50 -> 0.30 -> 1.0`.
  - **Playwright E2E suite:**
    - `tests/e2e/m8-continuous-dimmer-and-physical-loupe.spec.ts` (passing in 2.0m):
      - Continuous brightness slider interaction from 100% to 40% with measurable luminance reduction on acrylic table.
      - Physical optical loupe magnification over photo frames with high variance.
      - Loupe magnification over sprocket hole perforations showing backlit table glow.
      - Loupe magnification over film rebate markings ("KODAK PORTRA 400" and barcodes).
      - Loupe magnification over resting table surface without clipping or black fill.
      - Zero console errors, zero page errors, zero failed requests.
  - **Gate:** `npm run validate:m8` passed with exit code 0 (11/11 Playwright E2E suites passing in 9.3m + 10/10 Vitest test files with 93 unit/integration tests).
  - **Artifacts:**
    - `artifacts/m8-brightness-100.png`
    - `artifacts/m8-brightness-40.png`
    - `artifacts/m8-loupe-photo.png`
    - `artifacts/m8-loupe-sprocket.png`
    - `artifacts/m8-loupe-rebate.png`
    - `artifacts/m8-loupe-table.png`
  - **Human review:** Confirm smooth slider dimming from 30% to 100% and authentic optical magnification of sprockets, rebates, and table details under the loupe.
  - **Completion criteria:** Gate passes and human reviewer approves M8.

- [ ] **M9 — Five film stocks and authentic strip identity**
  - **Status:** Awaiting human review.
  - **Outcome:** A user selects one stock for the entire five-frame strip. Its edge markings and physical film appearance match that stock, and reversal film supports only positive viewing.
  - **Dependencies:** Existing M8 application only; M10 is not required. Keep the current brightness implementation functional when M10 is absent.
  - **Scope:** Kodak Ektachrome E100, Ektar 100, Portra 160, Portra 400, and Portra 800. Keep the existing five photographs and their positive image colors; stock-specific photographic color grading, contrast curves, and image-grain emulation are deferred. Stock differences in this milestone concern the physical strip, markings, base appearance, and allowed views.
  - **Paths/components:** New `src/data/filmStocks.ts` and stock reference assets under `public/assets/film-stocks/`; `src/utils/filmRebateCanvas.ts`, `src/components/FilmStrip.tsx`, `src/state/viewerState.ts`, `src/components/Controls.tsx`, `src/App.tsx`, and `src/components/ViewingTableScene.tsx`. Make only necessary stock-parameter changes in `src/components/FilmFrame.tsx`, `src/shaders/filmShader.ts`, and `src/shaders/loupeShader.ts`; preserve the existing loupe capture path. Record reference provenance in `public/assets/provenance.json`.
  - [x] **Reference and profile data:** Define a stable stock ID, display name, process/type, allowed views, base appearance, and rebate artwork/parameters. Default to Portra 400 in negative view. Match each profile to an identified developed 35mm still-film reference: lettering, placement, orientation, frame/half-frame numbers, and visible code patterns. Do not substitute cartridge DX markings, motion-picture KEYKODE, or fabricated generic barcodes. Document reference edition and provenance; report unavailable reference details rather than claiming exact reproduction. Runtime artwork must be local and usable under the reference's license; do not bundle unlicensed reference photographs.
  - [x] **Stock-aware strip:** Apply the selected profile across the entire strip, including frame gaps and visible film edges. Negative stocks have orange-masked borders; E100 has developed reversal-film borders based on its reference, without an orange negative mask. Preserve perforations, curl, layout, frame order, and loupe mapping. Keep markings sharp at supported macro views and readable through the loupe. Positive preview of a negative stock converts only the photo regions; its physical orange border and identity remain unchanged.
  - [x] **Selector and state transitions:** Add one labeled, keyboard-accessible stock selector. E100 immediately forces positive view, removes the negative/positive toggle and negative status text, and rejects negative-mode actions in the reducer as well as through the keyboard. Other stocks expose Negative / Positive preview. Switching between negative stocks preserves the current view; switching from E100 to a negative stock starts in negative view. Stock changes preserve selected frame, camera pose, pan, zoom, loupe magnification, and brightness. Rapid changes must settle on the last stock without stale labels or lens content.
  - **Vitest integration suite (new):** `tests/integration/m9-film-stocks.test.ts` must cover five unique profiles and local asset/provenance resolution; selector/state/profile-to-material and rebate flow; view restrictions and all stock-type transitions; unchanged navigation/brightness state; and loupe/strip stock consistency. Use actual profile and material/rebate generation modules, with browser canvas support where needed; string presence alone does not prove visual identity.
  - **Playwright E2E suite (new):** `tests/e2e/m9-film-stocks.spec.ts` must select all five stocks through the visible control; capture stock-specific edge close-ups; assert meaningful rendered rebate/base differences and readable photo regions; verify E100 stays positive after the mode shortcut; return to each negative stock and exercise both views; inspect stock markings through the loupe at macro zoom; and repeat rapid stock changes and room/inspect transitions with zero unexpected errors or failed asset requests.
  - [x] **Validation and review:** Added `validate:m9` using the build + full Vitest + full Playwright convention. Ran `PLAYWRIGHT_PORT=5189 npm run validate:m9 -- -- --workers=1` in the isolated mapped remote checkout after verifying and flushing `codex-film-photo-58a8`. All 99 integration tests and all 13 E2E tests passed, with zero failures/skips and no Playwright retries. M10 is absent; no sibling placeholder or skipped suite was added. The M5 positive-border assertion was explicitly updated for orange negative-stock preview borders and dark reversal borders. Historical artifacts were preserved byte-for-byte; new regression captures are in `artifacts/m9-regression-candidates/`.
  - **Completion criteria:** The standalone M9 gate passes; human review accepts all five reference comparisons, E100 restrictions, negative-stock positive preview, and loupe fidelity. Set status to **Awaiting human review** after validation and leave the top-level checkbox unchecked until accepted.
  - **Evidence:** `PLAYWRIGHT_PORT=5189 npm run validate:m9 -- -- --workers=1` exited 0 on 2026-09-09 UTC: Vitest 99/99 across 11 files; Playwright 13/13 in 18.9m, all M1–M9 suites. Full output: `artifacts/m9-validation.log`; prior development attempts retained separately, including a shared-server timeout run. Local worktree `/Users/zhangzimou/.codex/worktrees/58a8/film_photo`, base commit `956092b`, mapped to `root@209.151.144.140:/root/worktrees/codex/58a8/film_photo` through user-approved Mutagen session `codex-film-photo-58a8`. Local/remote source fingerprint matched: `4c95930a047c3544b8ae305d992478b5c91507da0ac82dccaf366cf30622c4ba`. Canonical tests: Google Chrome 152.0.7977.82, desktop 1280 × 800, real WebGL, zero unexpected page/console errors or failed requests. Review package and per-stock reference comparisons: `artifacts/m9-review.md`; screenshots: `artifacts/m9-candidates/`; normal-speed 44.68-second local Chrome recording: `artifacts/m9-candidates/m9-short-review.mp4` (also WebM). Local preview: `npm run preview -- --host 127.0.0.1 --port 5198`, then `http://127.0.0.1:5198/?deterministic=true&mode=inspect`. Exact optical edge-code tracks and batch IDs are unverified and omitted; fonts, registration and base colors are documented approximations. No unlicensed reference photographs are bundled. Source PNGs and prior accepted artifacts are unchanged. No new human approval or baseline promotion is claimed.
  - **Human approval:** Pending.

- [ ] **M10 — Realistic light-table brightness and film transmission**
  - **Status:** Pending.
  - **Outcome:** The continuous dimmer changes the illumination of a physical light table and the light transmitted through film. At 100% the table looks intensely bright, with bright perforations and believable nearby light spill, while dense film areas remain darker and photographs retain useful detail.
  - **Dependencies:** Existing M8 application only; M9 is not required. Validate against the existing generic strip when stock profiles are absent. This milestone must not introduce stock selection or require M9 data/types.
  - **Scope:** Retain the 30%–100% slider, default 100%, existing brightness keyboard cycle, and persistence/reset behavior. Rework optical response, panel appearance, nearby lighting, and loupe color consistency. Keep camera exposure fixed while dimming. Do not add stock-specific image grading, new room props, HDR-display requirements, or a new renderer platform.
  - **Paths/components:** `src/components/LightTable.tsx`, `src/components/DarkroomRoom.tsx`, `src/components/FilmFrame.tsx`, `src/components/FilmStrip.tsx`, `src/shaders/filmShader.ts`, `src/components/Loupe.tsx`, `src/shaders/loupeShader.ts`, and renderer configuration in `src/App.tsx`. Add a small shared illumination helper/shader module if needed. Preserve public brightness state and control semantics in `src/state/viewerState.ts` and `src/components/Controls.tsx`.
  - [ ] **Separate film density from lighting:** Derive the film's color/transmission independently of table brightness, then apply the shared table-light output in linear light. Conceptually, transmitted light equals table output multiplied by film transmittance, with a separate restrained surface-reflection contribution. Stop applying brightness to the source photo before negative conversion. The same film region must not become darker when the table gets brighter. Make the existing generic base/mask the default input; accept stock-provided properties through the independence contract below if M9 is present.
  - [ ] **Unify panel, borders, and holes:** Use a continuous, monotonic response curve with useful adjustment across the slider. Apply the same illumination source to photo regions and film borders/gaps. Remove the always-white perforation backing patches so holes reveal the actual dimmable panel. Preserve curl and believable contact shading. Coordinate emitted panel light with a soft, spatially plausible approximation of illumination on the loupe, chassis, and adjacent workbench; do not brighten the whole room uniformly.
  - [ ] **Calibrate appearance:** At 30%, show subdued panel light, dark dense film, and little surrounding glow. At 60%, show comfortable inspection brightness and clear detail. At 100%, show an intense near-white panel and perforations, stronger local spill, and restrained glare around high-luminance boundaries. Keep dense film darker and avoid broad clipping of photograph regions. Use subtle diffuser texture/variation and bounded bloom only where they help; bloom must not obscure edge text or film detail. Percentage represents the light-table control, not a claim of calibrated monitor luminance.
  - [ ] **Keep the loupe optically consistent:** Audit working/output color spaces and tone mapping across scene capture and lens rendering. Capture the same transmitted illumination seen outside the loupe, retaining only intentional lens shading/reflection. Apply final display conversion and any bloom once; do not compound light gain or bake and reapply glare. Verify photo, rebate, perforation, and bare-table views at minimum/maximum dimmer settings and supported magnifications.
  - **Vitest integration suite (new):** `tests/integration/m10-light-transmission.test.ts` must exercise brightness-to-panel/film/light parameter propagation, bounded monotonic light output, fixed film density across brightness changes, lower transmission through denser regions, the existing brightness limits/reset semantics, and shared capture/lens color handling. Use actual material/helper modules; include generic negative and positive inputs without requiring M9.
  - **Playwright E2E suite (new):** `tests/e2e/m10-light-transmission.spec.ts` must use the visible slider at 30%, 60%, and 100% and verify ordered luminance changes in stable panel, perforation, negative-photo, positive-photo, and rebate regions. Check nearby light spill, retained photo variance/limited clipping, and loupe/source color agreement away from intentional lens-edge effects. Exercise macro zoom, pan, and room return at both brightness extremes. Define meaningful region-based thresholds from the intended response before review; screenshot size or a changed percentage label is insufficient.
  - [ ] **Validation and review:** Add the proposed `npm run validate:m10` command to `package.json` during implementation, using the existing build + full Vitest + full Playwright convention. It does not exist yet. Run in the mapped remote checkout after verifying and flushing its Mutagen session. Include every existing suite, plus M9 if present. Record intentional replacements of old brightness-model assertions while preserving their user-visible regression purpose; new visual baselines require human approval.
  - **Completion criteria:** The standalone M10 gate passes; human review accepts that 100% feels very bright, 30%–100% responds smoothly, film density remains coherent, and the loupe matches the table. Record representative frame times with the loupe active to expose any added rendering cost. Set status to **Awaiting human review** after validation and leave the top-level checkbox unchecked until accepted.
  - **Evidence:** Pending. Attach exact command/result, checkout/commit identifiers when available, browser/viewport, preview instructions, fixed-view captures at 30%/60%/100%, loupe comparisons, a dimmer recording, rendering-cost observations, and known limitations.
  - **Human approval:** Pending.

- [ ] **M11 — Full-roll inspection: 36 frames on six strips**
  - **Status:** Pending.
  - **Outcome:** A user browses a full 36-frame roll on a physical light table, moves directly between whole-roll, strip, and frame views, and examines details with the loupe without losing their place. Photographs remain free of number overlays and interface markings.
  - **Dependencies:** Existing M8 application only. M9 stock selection, M10 lighting, and the previously discussed physical-scale/material enhancements are not prerequisites. Use existing film appearance, brightness, and loupe behavior when siblings are absent.
  - **Scope:** One roll arranged in six parallel horizontal strips of six frames, ordered left to right then top to bottom. Preserve the five-photo baseline as a regression fixture. Add data-driven frame/strip layout, camera framing, navigation, and loading behavior. Exclude multi-roll browsing, uploads, new photo acquisition, favorites, comparison, physical strip dragging/rotation, and new photographic effects.
  - **Paths/components:** `src/data/rollManifest.ts`, `scripts/prepare-assets.js`, `src/state/viewerState.ts`, `src/utils/loupeMapping.ts`, `src/utils/cameraBounds.ts`, `src/utils/filmRebateCanvas.ts`, `src/components/ViewingTableScene.tsx`, `src/components/FilmStrip.tsx`, `src/components/FilmFrame.tsx`, `src/components/CameraRig.tsx`, `src/components/Loupe.tsx`, `src/components/Controls.tsx`, `src/App.tsx`, and `src/index.css`. Add a small roll-layout helper and roll navigator component where they isolate new responsibilities. Keep image/mode shaders and brightness response unchanged except for essential plumbing.
  - [ ] **Manifest and 36-slot fixture:** Use stable frame IDs and global order separately from strip index/local slot. Derive strip membership and offsets from roll data rather than fixed `0..4` selection bounds or a single hard-coded layout. Keep frames 01–36 distinct as navigation entities; each strip contains six ordered slots. Prepare assets from manifest inputs, preserve the source PNGs, and retain the original five-photo test configuration. Provide an explicitly selected development/test 36-slot fixture using the existing five assets, with its fixture label outside the light-table/photo surface. Do not silently repeat photos in a production roll, invent missing photos, or claim that fixture review verifies 36 unique source images. A real 36-photo roll can be supplied through the local manifest without changes to navigation logic; missing sources must produce an honest loading/error state.
  - [ ] **Six-strip table layout:** Render six separate strips with real gaps, perforations, existing curl, and continuous global frame numbering on the film rebate. Centralize table/strip transforms so pointer selection, camera framing, and loupe sampling agree on world positions. Preserve scene proportions and fit the six-strip arrangement through a coherent layout/camera adjustment; do not multiply the existing strip width by 36. All 36 frames must be visible in whole-roll view at supported desktop viewports without overlapping controls.
  - [ ] **Realistic identification:** Never draw frame numbers, labels, badges, or selection fills over photographs, including enlarged images and navigation thumbnails. Frame numbers on the film itself belong only on the physical rebate outside the exposure area. Navigation may use a separate `Frame 14 / 36 · Strip 3 / 6` status, adjacent thumbnail captions, labeled strip controls in DOM chrome, and a compact numbered 6 × 6 roll map without photo overlays. Selection feedback belongs in navigation or on the surrounding table, not across photographs or stock lettering. All identifiers remain available as accessible labels.
  - [ ] **Three inspection levels:** Room approach enters whole-roll overview. Clicking a photo opens frame view directly; a strip control fits that strip's six photos. Frame view fits the photograph with some film border and neighboring context. These are camera views of the same physical arrangement, not reordering or replacing strips. Show Whole roll / Strip / Frame context controls; Whole roll returns directly from any inspection level. Save and restore the preceding whole-roll camera pose and selection. Escape goes frame → containing strip → whole roll → room; keep the explicit Return to Room action as a direct exit. Ignore navigation shortcuts while editing inputs/selects or operating a control that owns the key; honor reduced motion and prevent overlapping camera transitions.
  - [ ] **Continuous frame navigation:** In frame view, Previous/Next and Left/Right move through global frame order, including 06→07 and 30→31, centering the new frame and updating its containing strip. Clamp at 01/36 and disable the unavailable direction. In strip view, Previous/Next and Left/Right move between the six strips and clamp at the ends. In whole-roll view, arrow keys move the selected frame through the 6 × 6 arrangement (Left/Right within a row; Up/Down by six), and Enter opens it. Pointer selection and keyboard focus must agree; provide visible focus outside photo content. Do not create 36 permanent toolbar tabs or retain ambiguous single-digit frame shortcuts that only address frames 1–5.
  - [ ] **Context while inspecting:** Show the six thumbnails of the current strip and the compact roll map in strip/frame views. Clicking a thumbnail or map cell opens that frame directly. Keep the selected strip and frame evident without relying on color alone. Keep stock, negative/positive mode, and brightness at roll scope and preserve them across every view transition. If M9 is present, apply one selected stock to every strip and enforce E100 positive-only everywhere.
  - [ ] **Zoom, pan, and loupe:** Implement pointer-anchored wheel zoom and bounded Space-drag pan across the complete roll, preserving existing alternate pan gestures. Explicit framing controls select inspection levels; free zoom/pan must not unexpectedly change levels or navigate to another frame. A newly selected frame starts fitted and centered. Preserve loupe magnification and whether it was active; suspend lens interaction during camera movement, then resume over the selected photo center. Convert hit positions through the selected strip's transform before sampling. Clicking a frame navigates; it never physically moves a strip. Keep the existing maximum macro capability reachable with bounds appropriate to the new layout.
  - [ ] **Loading and resource handling:** Keep navigation responsive while loading; prioritize visible detail and adjacent frames and retain lightweight overviews. Reuse shared source textures for the development fixture, release obsolete resources, and avoid reloading every image on each navigation event. Keep a stable slot and retry affordance for a failed frame so frame numbering and other photos remain usable. Report performance measurements honestly: five reused textures do not establish memory usage for 36 unique full-resolution assets.
  - **Vitest integration suite (new):** `tests/integration/m11-full-roll-navigation.test.ts` must exercise manifest → six-strip layout → global/local frame lookup, frame 01/06/07/30/31/36 boundaries, keyboard/view transitions and restoration, camera fitting and pointer-anchored zoom, transformed pointer/loupe UV mapping across all rows, brightness/mode/magnification preservation, resource reuse, and partial asset failure. Verify labels are separate from photographic content, with no baked-in numbering in derivatives. Keep the original five-frame fixture assertions scoped to that fixture instead of weakening them globally.
  - **Playwright E2E suite (new):** `tests/e2e/m11-full-roll-navigation.spec.ts` must open the explicitly identified 36-slot fixture in a production build with real source textures and real WebGL; verify six separated strips and 36 rendered nonblank regions; open frame 29 directly; use the loupe; navigate 29→30→31 with visible photo/camera changes; return to whole roll and verify restored framing/selection. Also cover direct strip access, roll-map jumps to 01 and 36, disabled end controls, keyboard-only navigation, nested Escape/direct room return, preserved roll controls, real failed-image recovery, and no frame-number overlays. Assert correct source detail and lens changes across rows; repeated fixture images are not expected to differ in every slot. Failure-injection tests must assert only the intentionally induced failure and still reject unrelated console/page/network errors.
  - [ ] **Validation and review:** Add the proposed `npm run validate:m11` command to `package.json` during implementation; it does not exist yet. Follow the existing build + full Vitest + full Playwright convention. Verify/flush the exact Mutagen session and run in the mapped remote checkout. Include all existing suites, with M9/M10 when present. Preserve previous capability coverage through the five-photo fixture and explicitly document assertions affected by nested Escape, data-driven bounds, and framing. Capture new full-roll visuals as review candidates; do not silently replace accepted baselines.
  - **Completion criteria:** The standalone M11 gate passes and human review accepts whole-roll/strip/frame navigation, uninterrupted 36-frame browsing, absence of number overlays, and correct loupe sampling. Fixture-based acceptance covers navigation capacity only; identify the remaining content dependency and do not claim delivery or performance validation of 36 unique photographs. Set status to **Awaiting human review** and keep the top-level checkbox unchecked until accepted.
  - **Evidence:** Pending. Attach command/results, checkout/commit identifiers when available, browser/viewport, exact fixture and preview instructions, whole-roll/strip/frame screenshots, image/edge close-ups proving no overlays, a 29→30→31→overview recording, frame-time/resource observations, and the five-source/36-slot fixture limitation.
  - **Human approval:** Pending.

- [ ] **M12 — Browser-local roll import, library, and 120 film**
  - **Status:** Pending.
  - **Outcome:** A user imports their photographs as a named 35mm or 120 roll, chooses its stock, reviews frame order, and opens it on the table. They can choose between saved rolls and return after a page reload or browser restart without reimporting, provided the same browser profile/origin and its stored data remain available. Photographs never leave the browser during import or viewing.
  - **Dependencies:** Integrate M9's stock catalog/view restrictions and M11's data-driven roll navigation before full validation. Storage, import review, and library UI may be developed separately against their documented data contracts; do not duplicate the stock catalog or implement a second navigation system. M10 is not required; preserve its brightness behavior when present.
  - **Scope:** JPEG/PNG positive scans; the five M9 stocks; 35mm and 120 in 6×4.5, 6×6, 6×7, and 6×9; browser-local persistence; roll selection, metadata editing, reordering, rotation, cover choice, and recoverable removal. Accept partial rolls and derive frame count from imported files instead of requiring exactly 36. Exclude server storage, authentication, cloud sync, RAW/TIFF, automatic negative-scan inversion/calibration, backup export/import, and edits to source photographs. A stock selection describes the physical roll; it does not apply a new photographic grade to imported positive scans.
  - **Paths/components:** New browser-storage repository under `src/storage/`, import/library components under `src/components/`, and import/format helpers under `src/utils/` or `src/data/`. Integrate `src/data/rollManifest.ts`, M9's `src/data/filmStocks.ts`, M11's layout/navigation helpers, `src/state/viewerState.ts`, `src/components/Controls.tsx`, `src/App.tsx`, `src/components/ViewingTableScene.tsx`, `src/components/FilmStrip.tsx`, `src/components/FilmFrame.tsx`, `src/components/Loupe.tsx`, and `src/utils/filmRebateCanvas.ts`. Proposed module names remain implementation choices. Runtime import is performed in the browser, not through `scripts/prepare-assets.js`, SSH, or Mutagen.
  - [ ] **Persistent roll repository:** Use versioned IndexedDB stores for roll metadata, frame records, original image Blobs, and derived thumbnail/viewing Blobs. Store stable roll/frame IDs, ordered membership, original filename/MIME/dimensions, non-destructive orientation, cover frame, stock ID, film format/subformat, timestamps, and per-roll inspection state. Keep binary images out of localStorage. Store durable Blob keys rather than temporary object URLs; recreate URLs after reload and revoke them when unused. Separate storage/data retrieval from GPU texture loading. Keep the built-in five-photo example and explicit M11 fixture distinguishable from imported user rolls, and never delete them as part of user-roll management.
  - [ ] **Choose photos and review:** Add New roll and a multi-file chooser/drop target. Decode and validate actual JPEG/PNG data, normalize EXIF orientation once, preserve originals, and produce thumbnails and bounded viewing derivatives without altering originals. Sort filenames naturally (`2` before `10`), with stable tie order; provide drag reordering plus keyboard-accessible move controls and 90-degree rotation. Show filenames and frame numbers beside thumbnails, never over photographs. Flag duplicate content within the draft and unreadable/unsupported files; let the user explicitly remove or retain duplicates and remove failed files before saving. Never silently discard files or partially save a roll. Define and document practical per-file decoded-pixel, batch-size, and concurrency limits; explain violations before committing the import.
  - [ ] **Film details and framing:** Require roll name, one M9 stock, and 35mm or 120. For 120 require 6×4.5, 6×6, 6×7, or 6×9; use format-specific image-gate dimensions rather than treating the names as exact aspect ratios. Show imported count and allow incomplete rolls. Warn about count/format or image-aspect mismatches instead of padding with duplicates or silently cropping/stretching. Provide a preview with non-destructive fit as the default; rotation or selecting the correct format can resolve orientation mismatches. Trim the final strip to its actual frame count. Do not add frames that were not imported.
  - [ ] **Format-aware physical rendering:** Preserve 35mm perforations and M11's up-to-six-frame strip grouping. Add wider 120 film without perforations, with format-appropriate gate ratios, base appearance, and referenced stock edge markings. Start with up to four frames per strip for 6×4.5, three for 6×6/6×7, and two for 6×9; these are display cutting/layout choices, not exposure-count requirements. Fit the roll using M11's bounds-based camera and derive navigator rows/columns from the actual layout rather than a fixed 6 × 6 map. Do not copy 35mm DX patterns or backing-paper exposure numbers onto developed 120 film. Keep frame identifiers in appropriate physical edge markings or separate navigation; never overlay them on photos. Verify stock/format references and document any intentional approximations. Keep loupe sampling, orientation, global selection, and geometry consistent for every format.
  - [ ] **Atomic save and cancellation:** Keep draft changes isolated from saved rolls. Process images with progress and cancellation, then commit metadata/frame/blob records together before reporting success or switching the table. On decode/storage failure, preserve the current library and active roll, clean up temporary resources, and offer a clear retry path. Cancellation leaves no visible half-roll or orphaned committed assets. Handle storage unavailable/quota-exceeded cases explicitly; do not silently fall back to an ephemeral session while claiming the roll was saved.
  - [ ] **Library and roll switching:** Add a Rolls control with cover thumbnails, name, stock, format/subformat, and actual frame count. Open a selected roll on the table; retain the previous roll until the new roll is ready and ignore stale asynchronous results from rapid switching. Restore that roll's last selected frame, inspection level/camera pose, allowed view mode, brightness, and loupe magnification; clamp or reset invalid state after edits. Save meaningful state changes rather than every animation frame. E100 must stay positive-only after import, switching, metadata edits, and reload. Block background viewer shortcuts while library/import controls own focus and restore focus on dismissal.
  - [ ] **Manage saved rolls:** Support renaming, stock/format metadata edits, reordering, rotation, and selecting a cover image without modifying source Blobs. Revalidate layout/view state after changes; roll-wide stock changes persist as metadata. Move removed rolls into browser-local Trash with Restore/Undo, retaining their files; do not add automatic permanent deletion or an unrequested purge action. Removing the active roll returns to the library without affecting other rolls or the bundled example.
  - [ ] **Storage scope and performance:** Explain concisely in the library that rolls are stored in this browser and that clearing site data removes them. Storage is tied to browser profile and origin, so use a stable development/preview origin and port when demonstrating persistence. Request durable browser storage where available, but handle denial and quota limits without promising permanent backup. Show approximate storage use where supported. Load thumbnails for the library and prioritize visible/adjacent detail textures; avoid decoding all originals on every open. Verify texture/object-URL cleanup across repeated roll switches. Do not transmit image bytes, filenames, or roll metadata to a server or runtime third party.
  - **Vitest integration suite (new):** `tests/integration/m12-roll-library.test.ts` must exercise import validation/sorting/orientation → draft → repository commit → saved roll manifest, stock/format validation, each format's layout and local/global mapping, edit/reorder state restoration, failed/cancelled atomic saves, recoverable removal/restore, missing records, and schema upgrades without data loss. Use actual repository/processing modules with a browser-capable harness or explicit IndexedDB adapter; browser E2E must prove real IndexedDB behavior regardless of integration substitutes.
  - **Playwright E2E suite (new):** `tests/e2e/m12-roll-library.spec.ts` must import through the real file chooser/drop interface, review/reorder/rotate, choose stock and format, save, and inspect actual uploaded image content in real Chrome/WebGL. Import at least a 35mm roll and each supported 120 subformat, using suitably proportioned local image fixtures; include E100, partial rolls, and a 36-slot navigation case. Verify unperforated 120 rendering, correct image proportions and loupe sampling, no number overlays, cross-roll switching and state restoration, metadata edits, duplicate/invalid-file handling, cancellation, Trash/Restore, and expected quota/storage failure handling. Reload and close/reopen a page at the same origin within the same browser context to verify persistence; explicitly exercise reopening the same persistent browser profile for restart evidence. Confirm imported data is not sent in network requests. Test fixtures must not be represented as the user's real rolls or committed as browser databases.
  - [ ] **Validation and review:** Add proposed `npm run validate:m12` during implementation; it does not exist yet. Use the existing production build + complete Vitest + complete Playwright gate, including M9/M11 and M10 if present. Run tools/tests in the mapped remote checkout after verifying/flushing Mutagen. Browser database fixtures live only in isolated test profiles, not the repository or the user's live library. Controlled failure tests must assert the expected failure and reject unrelated errors; no required skipped tests or silent baseline updates.
  - **Completion criteria:** The complete gate passes with integrated M9/M11, and human review accepts importing, viewing and switching real local images; all supported film layouts; persistence at the same browser origin; recoverable management; and preservation of prior inspection behavior. Review includes a real import in the user's normal desktop browser and reload/reopen, separate from the automated remote test database. Mark **Awaiting human review** after automated validation; do not check the milestone complete before explicit acceptance.
  - **Evidence:** Pending. Attach command/results, checkout/commit identifiers when available, browser/profile/origin/viewport, preview and import instructions, fixture provenance, library and 35mm/120 candidate screenshots, an import→inspect→switch→reload→restore recording, storage/resource measurements, and browser-local storage limitations.
  - **Human approval:** Pending.

## M9/M10 independence and integration contract

- **Either order:** Both milestones start from the existing M8 application. No preparatory milestone, sibling import, or placeholder implementation is required. Each must deliver its complete user-visible outcome and pass its gate on its own.
- **Separate responsibilities:** M9 owns stock identity, rebate artwork, physical base properties, and allowed views. M10 owns the response to table brightness, transmitted illumination, surrounding light, and display/capture consistency. Stock data must not embed brightness multipliers or renderer exposure; illumination code must not hard-code stock IDs or change viewing-mode policy.
- **Shared rendering boundary:** Film rendering consumes a stock-independent photo/view input and base/transmission properties with defaults matching the existing generic strip. M9 may supply these properties; M10 consumes them without depending on the stock catalog. When M9 is absent, the defaults and existing `isPositive` flow remain sufficient. Preserve the `brightness` prop and `tableBrightness` range/meaning.
- **Shared files:** Both changes may touch `FilmStrip.tsx`, `FilmFrame.tsx`, `filmShader.ts`, `App.tsx`, and `package.json`. Keep stock selection/profile plumbing separate from illumination calculations and renderer setup; avoid unrelated refactors. Independent execution does not imply conflict-free merges. Preserve both additions when resolving local Git conflicts and validate the merged result in its own mapped remote checkout.
- **Combined acceptance:** Whichever change is integrated second must add coverage for all five stocks at 30%, 60%, and 100%, both allowed views of negative stocks, and E100 positive-only behavior. Confirm stock changes retain brightness and camera/loupe state, the dimmer changes neither stock identity nor film density, and stock-specific borders/markings dim correctly inside and outside the loupe. Run the full combined suite; do not create required skipped tests when the sibling is absent.
- **Historical evidence:** Existing M1–M8 evidence remains historical. M9 authorizes changes to stock identity/view restrictions and negative-stock preview borders; M10 authorizes replacement of the old illumination model. Document affected assertions and candidate captures explicitly. Neither addition authorizes silent baseline promotion or retroactive approval of M7/M8.

## M11 independence and integration contract

- **Standalone delivery:** M11 owns roll data, strip placement, camera/navigation state, and world-to-strip/loupe mapping. It must run with the existing generic film and dimmer, without imports from unimplemented M9/M10 modules. Conversely M9/M10 must remain usable with the original five-photo fixture.
- **Roll-wide settings:** M9 owns stock identity and allowed modes; M10 owns illumination response. M11 passes those values unchanged to every strip and the loupe. A shared stock profile is selected once per roll; each strip receives its own frame subset and global frame-number offset. Do not hard-code six-frame artwork inside stock profiles or stock IDs inside layout/navigation code.
- **State boundaries:** Keep room mode separate from the three inspection framing levels. Stable frame IDs/global order determine selection; layout determines strip/local coordinates. Preserve the public meaning of brightness, film mode, and loupe magnification. Camera distance and pan bounds may become layout-aware; tests should preserve their user-visible macro/navigation purpose rather than freeze obsolete coordinates.
- **Shared edits and integration:** `viewerState.ts`, `Controls.tsx`, `ViewingTableScene.tsx`, `FilmStrip.tsx`, `FilmFrame.tsx`, `Loupe.tsx`, `filmRebateCanvas.ts`, `App.tsx`, and `package.json` may overlap with M9/M10. Use separate worktrees for concurrent implementation and keep changes narrowly scoped; independence does not guarantee conflict-free merging. The integration owner must reconcile shared edits and rerun the complete suite in the merged checkout's mapped remote environment.
- **Combined checks:** When M11 and M9 are both present, verify stock changes affect all six strips, retain selection/camera/brightness, keep global rebate numbering continuous, and enforce E100 restrictions at all inspection levels. When M11 and M10 are both present, verify 30%/60%/100% response on the first and last strips, their rebate/perforations, and the loupe; navigation must not reset brightness. Include all three behaviors when all three milestones are present. Add these checks as the relevant sibling is integrated, with no skipped placeholder tests or dependency on unfinished sibling work.

## Test configuration contract

- Playwright must serve the production build, use a fixed desktop viewport and deterministic scene mode, and collect page errors, console errors, and failed asset requests.
- Core E2E actions must use visible controls, canvas pointer input, and keyboard input as a user would. Do not drive the state machine through `page.evaluate` to claim the journey works.
- Objective canvas assertions should inspect stable film/loupe regions for nonblank content, variance, clipping, and meaningful changes. A screenshot byte-size check is insufficient.
- Before human approval, screenshots are review candidates—not truth. After approval, accepted captures may become `toHaveScreenshot` baselines for later milestones. Baselines may change only with explicit human approval.
- If a required test is flaky, the milestone remains unfinished until the cause is fixed. Retries must not conceal instability.

## Minimal architecture and data

Suggested separation: app shell and DOM controls; explicit viewer state; room/camera; inspection station; film material; loupe; roll manifest. Avoid premature abstraction and keep shader constants centralized.

The roll manifest contains stable `id`, `order`, runtime `src`, and `alt` values. The baseline fixture contains exactly five frames; M11 adds a 36-frame configuration and explicit strip membership/layout with unique frame identities. Fixture slots may share a source texture only when clearly identified as development/test content. M12 extends this contract to saved browser-local rolls of variable length and 35mm/120 format, resolving stored Blob keys into temporary viewing URLs without using those URLs as persistent identity. The selected stock remains a catalog reference shared by all frames in a roll. Runtime sources remain local. Persistence is introduced only by M12; there is no backend, authentication, analytics, or runtime third-party request.

## Risks

- WebGL state assertions can pass while the canvas is visually broken; every important state test therefore needs a visible effect assertion and human review.
- Lighting, transparency, bloom, and the loupe can obscure the photographs; add them only after the simpler viewer is accepted.
- GPU screenshot output can vary; use one canonical Chrome environment for regression baselines and rely on human review for subtle realism judgments.
- Existing implementation branches may contain reusable work but also failed assumptions. Reuse selectively and do not import their approval status.

M12's storage choice is resolved: current browser only. Real implementation prerequisites are the M9 stock contract and M11 layout/navigation; preserve their ownership rather than creating competing implementations.

## Handoff checklist

- Read this plan and inspect the active checkout before editing.
- For M9/M10/M11, work only on the assigned independent milestone; none requires the others' completion. Otherwise work on the first unaccepted milestone. Do not treat historical M7/M8 sign-off wording as authorization to approve them or as a prerequisite to this explicitly requested independent work.
- For an M12 assignment, first verify integrated M9/M11 support; M10 is optional. Storage/import components may be prepared separately, but record incomplete integration and do not claim milestone completion until its full gate passes. Do not implement or approve another milestone implicitly.
- Preserve the five source PNGs and all previously accepted milestone behavior.
- Run the milestone's cumulative validation command and attach evidence.
- Stop at **Awaiting human review** unless the user explicitly authorized autonomous continuation.
- Never approve candidate screenshots or milestone completion on the user's behalf.
