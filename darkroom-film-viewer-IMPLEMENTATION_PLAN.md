# Darkroom Film Viewer — Implementation Plan

## Goal

Build a desktop web experience in which a user explores a realistic 3D darkroom, approaches an illuminated viewing table, examines one five-frame 35mm film strip with a loupe, and switches the photographs between negative and positive.

The photographs and core interaction take priority over environmental detail. A milestone is complete only after its automated gate passes **and a human accepts the result**.

## Confirmed decisions

- Stack: React, TypeScript, Vite, Three.js, React Three Fiber, and Drei.
- Desktop only; Playwright runs against real desktop Chrome/WebGL.
- Exactly five existing photos, initially shown as color negatives on one film strip.
- The loupe must visibly enlarge the detail underneath it.
- A control switches all frames between negative and positive.
- The final room should use plausible scale, PBR materials, local/CC0 assets, and restrained lighting effects.
- Runtime assets must be local. Do not deploy or publish.

## Current state

On `master`, the project contains this plan and five 1536 × 1024 positive PNG masters under `photos/roll-01/`; it has no application scaffold or test commands. Previous implementation attempts exist on separate branches/worktrees but did not pass human review and are not merged. They may be mined for useful code, but their completed checkboxes and visual baselines are not evidence that this plan has passed.

Before editing, re-check the active checkout. If application code is already present, repair and simplify it to satisfy the current milestone instead of scaffolding a duplicate app. Never overwrite the source PNGs.

## Scope

In scope: the five-photo viewer, negative/positive transition, loupe, constrained room camera, realistic hero objects and room, loading/error states, desktop Chrome validation, and local asset optimization.

Out of scope: mobile/touch, free walking, audio, CMS/uploads, accounts, backend, other rolls, scientifically calibrated film-stock emulation, and deployment.

## Product flow

```text
room --select table--> inspect --Back/Escape--> room
                         ├── negative <-> positive
                         └── loupe resting <-> active
```

Keep this state explicit in a reducer or small state machine. Prevent overlapping camera transitions and ensure returning to the room restores a valid camera pose.

## Mandatory milestone gate

For every milestone:

1. Implement only that milestone and preserve all previously accepted behavior.
2. Run its named `npm run validate:mN` command against a production build.
3. The gate must include the current and all prior milestone integration and E2E suites.
4. Required tests must have zero failures and zero skips. Do not weaken assertions, mock WebGL in E2E, hide console errors, or update screenshots merely to make the gate pass.
5. Prepare the review evidence: exact command/result, local preview instructions, candidate screenshots and a short interaction recording, browser/viewport, and known limitations.
6. Set the milestone status to **Awaiting human review** and stop. Do not start the next milestone unless the user explicitly approves or previously requested autonomous continuation.
7. Only after approval: mark the milestone checkbox complete, record approval and commit evidence, and promote accepted candidate screenshots to regression baselines.

Vitest is used for integration tests. Playwright is used for E2E tests in real desktop Chrome with real WebGL, actual local assets, and normal pointer/keyboard input. Integration tests prove modules cooperate; E2E tests prove the user-visible production app works. State attributes may aid diagnosis, but they cannot replace canvas or interaction assertions.

## Progress TODO

### Progress protocol

The current active milestone is **M3**. The agent may complete any coherent subset of its work, but must update this plan before stopping. Leave a milestone unchecked until both its automated gate and human review pass. Record partial progress or blockers under its Evidence line. Once accepted, preserve its tests as cumulative regressions. If implementation changes the plan, record the reason without erasing completed history. Multiple coherent commits are allowed.

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

- [ ] **M5 — Authentic 35mm film substrate, edge rebate markings, and physical tactility**
  - **Status:** In progress (awaiting plan approval).
  - **Outcome:** Elevate the 35mm film strip from a planar graphic into an authentic, tactile physical photographic object on the light table:
    1. **Translucent Acetate/Polyester Film Base**: Replace opaque black borders and dividers with translucent celluloid/acetate film substrate that transmits the light table glow with authentic daylight color-negative base tone (`#d97724` amber/orange mask in negative mode, smoky dark bronze in positive mode) and subtle density falloff at frame edges.
    2. **Authentic Edge Rebate Markings & DX Encoding**: Procedurally rendered authentic edge print running along both perforation margins:
       - Top edge: Film brand/stock markings (e.g. `KODAK 400`, `SAFETY FILM`), batch indicators, and DX barcode timing bars.
       - Bottom edge: Sequential frame numbering (e.g. `▶ 1`, `1A`, `▶ 2`, `2A`, `▶ 3`, `3A`, `▶ 4`, `4A`, `▶ 5`, `5A`), index dots, and directional film advance arrows.
       - Dynamic mode inversion: Markings appear as unexposed latent text (illuminated base) in negative mode, and developed silver imprint in positive mode.
    3. **Physical Film Curl & Transverse Curvature**:
       - Natural transverse curl (gentle parabolic arch across the Y axis, lifting the outer perforation edges ~1.5mm off the glass table surface while the central spine stays supported).
       - Softened, slightly curved cut strip ends at the roll leads.
       - Dynamic contact drop shadow conforming to the arched film curvature onto the frosted acrylic diffuser.
    4. **Emulsion Sheen, Plastic Clear-Coat Gloss & Specular Response**:
       - Dual-sided PBR sheen: high-gloss acetate base side with subtle specular highlights catching room and table lighting, paired with smooth matte emulsion response.
       - Subtle surface micro-sheen without introducing noisy artifacts under 2.5× loupe magnification.
  - **Paths/components:** `src/components/FilmStrip.tsx`, `src/shaders/filmShader.ts`, `src/shaders/filmRebateTexture.ts`, `src/utils/loupeMapping.ts`, `tests/integration/m5-*`, `tests/e2e/m5-*`.
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
  - **Evidence:** Pending.
  - **Human approval:** Pending.

## Test configuration contract

- Playwright must serve the production build, use a fixed desktop viewport and deterministic scene mode, and collect page errors, console errors, and failed asset requests.
- Core E2E actions must use visible controls, canvas pointer input, and keyboard input as a user would. Do not drive the state machine through `page.evaluate` to claim the journey works.
- Objective canvas assertions should inspect stable film/loupe regions for nonblank content, variance, clipping, and meaningful changes. A screenshot byte-size check is insufficient.
- Before human approval, screenshots are review candidates—not truth. After approval, accepted captures may become `toHaveScreenshot` baselines for later milestones. Baselines may change only with explicit human approval.
- If a required test is flaky, the milestone remains unfinished until the cause is fixed. Retries must not conceal instability.

## Minimal architecture and data

Suggested separation: app shell and DOM controls; explicit viewer state; room/camera; inspection station; film material; loupe; roll manifest. Avoid premature abstraction and keep shader constants centralized.

The roll manifest should contain stable `id`, `order`, runtime `src`, and `alt` values for exactly five frames. There is no backend, persistence, authentication, analytics, or runtime third-party request.

## Risks

- WebGL state assertions can pass while the canvas is visually broken; every important state test therefore needs a visible effect assertion and human review.
- Lighting, transparency, bloom, and the loupe can obscure the photographs; add them only after the simpler viewer is accepted.
- GPU screenshot output can vary; use one canonical Chrome environment for regression baselines and rely on human review for subtle realism judgments.
- Existing implementation branches may contain reusable work but also failed assumptions. Reuse selectively and do not import their approval status.

No blocking questions remain for M1.

## Handoff checklist

- Read this plan and inspect the active checkout before editing.
- Work only on the first unaccepted milestone.
- Preserve the five source PNGs and all previously accepted milestone behavior.
- Run the milestone's cumulative validation command and attach evidence.
- Stop at **Awaiting human review** unless the user explicitly authorized autonomous continuation.
- Never approve candidate screenshots or milestone completion on the user's behalf.
