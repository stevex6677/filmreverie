# Darkroom Film Viewer Implementation Plan

## Goal and definition of done

Build a desktop-only, high-realism interactive web experience that places one five-frame 35mm film strip on an illuminated viewing table inside a physically plausible 3D darkroom.

The experience is done when a user can:

1. Enter a convincingly scaled and lit darkroom and drag with the mouse to inspect it from a constrained camera position.
2. Select the illuminated viewing table and transition smoothly into a close inspection view.
3. See the five supplied photographs arranged in order on one continuous 35mm-style strip, initially rendered as color negatives with an orange film base, frame lines, edge markings, and transparent sprocket holes.
4. Pick up or activate a physical loupe and move it over the strip to inspect genuinely enlarged source-image detail.
5. Operate a control on the viewing table to transition between the simulated negative and the original positive photographs.
6. Return to the room view and repeat the flow without stale state, broken controls, or camera jumps.

“High realism” means realistic proportions, beveled geometry, locally stored PBR materials, plausible indirect/reflected light, contact and cast shadows, subtle optical effects, restrained post-processing, and interactions modeled after handling processed 35mm film. It does not mean a free-roaming game, a scientifically calibrated film scanner, or a photoreal offline render that sacrifices interactive frame rate.

## Context and confirmed decisions

- The project presents a single roll represented by exactly five photographs.
- The initial presentation is a continuous color-negative strip on a glowing light table; a user-operated control reveals the positives.
- A magnifying loupe must enlarge local film detail.
- The surrounding darkroom is a real 3D scene that can be inspected by mouse dragging.
- The implementation stack is React, TypeScript, and Vite, with Three.js through React Three Fiber and Drei.
- Only desktop browsers are supported. Mobile layout, touch interaction, and mobile performance are out of scope.
- 3D rendering will use real-world scale, PBR materials, low-intensity HDR environment/reflection lighting, and a small number of deliberate local lights.
- Locally generated assets and CC0 assets are allowed. Runtime third-party asset fetching is not allowed; selected assets must be copied into the project and their provenance recorded.
- Deployment and hosting are out of scope for this implementation.
- The five existing PNG files remain the source masters. Film borders and negative appearance must be generated non-destructively by the application, not baked into those masters.

## Current-state evidence

The project root is the current directory. It is not currently a Git repository and contains no package manifest, application source, test configuration, README, project-specific agent instructions, or prior implementation plan.

The only existing product assets are these positive 3:2 PNG masters, each 1536 × 1024:

- `photos/roll-01/frame-01-harbor.png`
- `photos/roll-01/frame-02-diner.png`
- `photos/roll-01/frame-03-bicycle.png`
- `photos/roll-01/frame-04-laundromat.png`
- `photos/roll-01/frame-05-road.png`

All application, model, texture, shader, test, and documentation paths below are therefore proposed new paths. The implementation agent must re-check the root before scaffolding in case another task has initialized the project in the meantime.

There are no currently supported validation commands. `T1` establishes the package scripts used by subsequent tasks; later tasks must verify those scripts exist rather than assuming the repository remained empty.

## Scope

### In scope

- A single-page desktop 3D experience.
- A realistically scaled, enclosed darkroom focused on a central work table and illuminated viewing table.
- Constrained orbit-style room inspection by mouse drag.
- A guided camera transition from room view to film-inspection view and back.
- One continuous five-frame 35mm-style color film strip using the supplied photos.
- Physically suggestive film substrate, gloss, edge curl, perforations, frame gaps, frame numbers, and backlit behavior.
- A shader-based negative simulation with an orange film base and a smooth transition to the original positive imagery.
- A physical 3D loupe whose circular view samples higher-resolution local image detail.
- Desktop resize handling, loading and WebGL failure states, keyboard alternatives for core controls, and reduced-motion behavior.
- Local optimization of photos, models, PBR textures, and HDR environment data.
- Unit, interaction, end-to-end, visual, browser, and performance validation appropriate to WebGL.

### Out of scope

- Mobile and tablet layouts, touch gestures, or mobile GPU tuning.
- Free first-person walking, collision physics, avatars, VR/AR, multiplayer, or game mechanics.
- Uploading new rolls, a CMS, user accounts, persistence, analytics, or backend APIs.
- Audio ambience or interaction sounds.
- Full-screen gallery pages or navigation to other rolls.
- Scientifically calibrated film-stock emulation, ICC color management, or exact optical ray tracing through real glass.
- Paid or restrictively licensed models, materials, fonts, or HDRIs.
- Hosting, domain configuration, publishing, or deployment.

## Target design

### Experience and state flow

The app has three primary view states and two independent inspection controls:

```text
loading -> room -> approaching -> inspect
                    ^             |
                    +-------------+  (Escape / back control)

film mode: negative <-> positive
loupe mode: resting <-> active
```

- **Room:** The camera begins at standing eye height with a natural perspective centered on the table. Primary-button mouse drag rotates around a restrained target near the viewing table. Zoom is either disabled or tightly bounded so the camera cannot cross walls or clip through props.
- **Approaching:** Selecting the viewing table disables orbit input and interpolates position, target, focus, and exposure into a stable close inspection view. Repeated clicks cannot start competing camera animations.
- **Inspect:** The whole five-frame strip remains visible. Orbit is disabled. The light-table control and loupe receive pointer events. `Escape` or a visible back control returns to the exact room camera pose saved before approach.
- **Film mode:** The initial value is `negative`. The table control transitions a continuous shader mix uniform between negative and positive in approximately 0.8 seconds. It must be interruptible and converge cleanly if clicked again mid-transition.
- **Loupe mode:** The loupe begins resting beside the strip. Selecting it activates inspection; pointer movement over the film moves the loupe within physical bounds. A second selection, `Escape` from loupe mode, or leaving inspect mode returns it to its rest position.

Keep application interaction state in a typed reducer or small explicit state machine outside scene components. Do not scatter mutually dependent booleans across meshes. Suggested domain values are `viewMode`, `filmMode`, `filmMix`, `loupeMode`, `loupeHit`, `savedRoomCamera`, `isTransitioning`, and `assetStatus`.

### Proposed component and asset boundaries

```text
App
├── ExperienceShell / loading and WebGL fallback
├── DesktopHUD / concise controls and accessible DOM buttons
└── Canvas
    └── DarkroomScene
        ├── RendererSetup / color management and quality policy
        ├── CameraRig / constrained orbit and guided transitions
        ├── DarkroomEnvironment / shell, furniture, props, lighting
        └── InspectionStation
            ├── WorkTable
            ├── LightTable
            ├── FilmStrip
            │   └── five FilmFrame instances using FilmMaterial
            ├── Loupe
            └── PhysicalModeControl
```

Proposed locations:

- App entry and shell: `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`
- State and roll data: `src/domain/viewerState.ts`, `src/data/roll01.ts`
- 3D scene: `src/scene/`
- Shader/material logic: `src/scene/materials/`, `src/scene/shaders/`
- Accessible DOM controls: `src/components/`
- Asset preparation: `scripts/prepare-assets.mjs`
- Runtime assets: `public/assets/photos/`, `public/assets/models/`, `public/assets/textures/`, `public/assets/environment/`
- Asset attribution: `THIRD_PARTY_ASSETS.md`
- Automated checks: `tests/unit/`, `tests/e2e/`

Exact filenames inside these proposed directories may change if the scaffold establishes a stronger convention, but responsibilities must remain separated and the plan must be updated when paths change.

### Darkroom geometry and realism rules

- Use meters as scene units. Start from an approximately 4.2 m × 3.4 m × 2.6 m room, a roughly 1.8 m × 0.85 m work table, and a viewing surface around 0.6 m × 0.4 m. Adjust only if camera or composition testing shows a concrete problem.
- Build the room shell and simple furniture from deterministic geometry in the codebase. Use local GLB assets only for hero props whose silhouette and material detail materially improve realism, such as the enlarger or loupe.
- Include restrained darkroom context: a sink/work counter, enlarger, trays, tongs, labeled-but-not-brand-specific bottles, drying clips, vents, and cables. Props must support the scene without competing with the film strip.
- Bevel visible hard edges. Perfectly sharp boxes are not acceptable for the table, light box, counters, or prominent props.
- Apply PBR materials at plausible real-world texel scale: painted plaster or tile, sealed concrete, worn wood, brushed/painted metal, frosted glass, and slightly scratched plastic. Use normal and roughness variation; avoid uniformly glossy surfaces.
- Use a dark, processed-film inspection-room interpretation. A dim red practical light may provide ambience because the film has already been developed, but it must not bathe the entire room in saturated red or imply active color-film development under a safelight.
- Use a low-intensity local HDRI for reflections/ambient fill, not as a visible background. The visible illumination should come from modeled practical fixtures.
- The viewing-table diffuser is an emissive frosted surface. Pair the visible emissive plane with a soft shadow-capable local light because a Three.js rectangular area light alone does not cast the required shadows.
- Bake or fake broad indirect light where useful, then reserve real-time shadows for the viewing table, loupe, film, hands-free props near the hero area, and one or two principal fixtures.
- Use ACES-style tone mapping and correct sRGB/linear color handling. Bloom, ambient occlusion, vignette, depth of field, and grain must remain subtle. Disable or reduce depth of field in inspect mode so the strip and loupe stay legible.
- Add human-scale evidence such as realistic tabletop height, outlet size, bottle size, and consistent texture scale. Reject floating props, intersecting meshes, z-fighting, repeated texture tiling, and camera clipping during visual QA.

### Film strip construction

- Preserve the existing PNG files as immutable masters. The asset-preparation script may derive web-optimized copies but must never overwrite the originals.
- Model a 35 mm-wide strip with five 36 × 24 mm image gates in landscape orientation and eight sprocket perforations per frame along each edge. Use the real ratios even if the whole strip is uniformly scaled up slightly for readability on the table.
- The strip should be one continuous translucent substrate. Use an alpha/cutout mask or actual lightweight geometry so perforations reveal the light table underneath rather than appearing as painted black rectangles.
- Render each image gate as its own material/mesh region so the full-resolution source for the frame under the loupe can be sampled without requiring a single oversized five-image texture atlas.
- Include small frame gaps, restrained edge codes/frame numbers, subtle dust and micro-scratches, surface roughness variation, and slightly curled ends. Do not add heavy damage that obscures the photographs.
- Use enough vertex subdivisions for a millimeter-scale end curl or gentle undulation, but keep the central gates nearly flat as they rest on the illuminated surface.
- Separate the optical roles into layers where practical: translucent orange-tinted base, photographic dye image, edge/perforation mask, and a thin glossy/specular response. This avoids forcing one shader to approximate every property and reduces z-fighting risk when implemented with deliberate layer offsets.

### Negative and positive color behavior

The negative view must not be implemented as a CSS `invert()` filter or a bare `1.0 - color` shader.

Implement a density-domain approximation in a custom Three.js material:

1. Decode the photograph texture from sRGB into linear color.
2. Convert the source exposure/color into channel dye density using a tunable 3 × 3 matrix with small cross-channel terms.
3. Add a base density whose transmitted color appears orange/amber, with more blue absorption than green and more green absorption than red.
4. Convert total density back into transmission with an exponential/power-of-ten response.
5. Apply toe/shoulder compression, limited saturation, subtle local grain/dust contribution, and a backlight intensity term.
6. For positive mode, show the original color-managed texture through a restrained film/scanner response rather than bypassing all material properties.
7. Interpolate between the two results using one continuous `filmMix` uniform, with the light-table exposure and bloom responding subtly during the transition.

Keep the transform constants in one typed configuration object so they can be calibrated against reference negatives without rewriting shader logic. Provide a deterministic debug view or controls available only in development for tuning base density, exposure, and per-channel response. Production UI must not expose these calibration controls.

### Loupe behavior

- Use a physical 3D loupe with a metal or dark plastic ring, glass element, bevels, realistic resting position, and contact shadow.
- In active mode, raycast the pointer onto the film. Convert the hit to a frame index and local UV. Clamp the loupe center so it cannot slide off the light-table inspection area.
- Inside the circular lens, sample the selected frame’s full-resolution texture around the hit UV at approximately 2.5× magnification. This must reveal additional image detail rather than merely scaling already-rasterized screen pixels.
- Keep the outer ring and glass optical response physically suggestive, but implement the actual enlargement with a controlled shader/render target rather than relying solely on Three.js refraction.
- Add only slight edge distortion, Fresnel reflection, and chromatic fringing. The center of the lens must remain sharp and color-consistent with the current negative/positive mode.
- When the loupe crosses a frame gap or film edge, show the substrate/edge detail rather than sampling an unrelated image. If exact cross-frame compositing becomes disproportionately complex, clamp the optical image to the active gate while the physical ring may cross the gap; document this compromise in the plan progress evidence.

### Desktop interaction and accessibility

- Support current desktop Chrome, Safari, Firefox, and Edge at viewports of at least 1024 × 720. At narrower widths, show a clear desktop-required message instead of attempting an unsupported compressed layout.
- Use pointer events, not mouse-only event APIs, while still treating desktop pointer input as the supported target.
- Provide visible but understated initial guidance for dragging, selecting the table, using the loupe, toggling film mode, and returning. Fade guidance after successful use and keep it available through a help control.
- Mirror essential mesh actions with real DOM buttons or keyboard controls so the WebGL canvas is not the only operable surface. At minimum: `Enter` to approach the focused table/control, `N` or `P` to set the film mode, `M` to toggle the loupe, and `Escape` to exit loupe or inspection mode.
- Respect `prefers-reduced-motion`: shorten camera travel, remove decorative motion and flare, and make film-mode transitions brief while preserving understandable state changes.
- Prevent browser text selection, page scrolling, and context-menu interference only within the canvas interaction surface; do not globally disable normal browser behavior without need.

### Asset and performance policy

- All runtime assets must be local. Record source URL, author, license, original filename, and any modification for every CC0 asset in `THIRD_PARTY_ASSETS.md`.
- Derive web copies of the five photos under `public/assets/photos/roll-01/`; keep sufficient resolution for the loupe and use a format supported by all target browsers, with fallback where needed.
- Prefer 1K/2K PBR maps, compressed GLB meshes, and an HDR environment resolution justified by reflection quality. Do not ship 4K textures on hidden or small props.
- Clamp device pixel ratio to a tested desktop range rather than blindly using the monitor’s full DPR. Use anisotropic filtering selectively on the shallow-angle film and tabletop surfaces.
- Lazy-load secondary room props after the hero table, film, camera, and lighting are ready. The user must never see empty film frames after entering inspect mode.
- Add a deterministic test mode, for example through a documented development-only query parameter, that fixes camera pose, time-based noise, exposure, and animation completion for visual regression tests.
- Provide a loading screen with progress and a retryable failure state. If WebGL is unavailable, show an explanatory fallback rather than a broken black canvas.

## Data and interface changes

No backend, API, database, storage, authentication, or migration is required.

Define a typed roll manifest in `src/data/roll01.ts` rather than hard-coding file paths inside meshes. The minimum contract is:

```ts
type FilmFrame = {
  id: string;
  order: number;
  src: string;
  sourceMaster: string;
  alt: string;
};

type FilmRoll = {
  id: string;
  label: string;
  frames: readonly FilmFrame[];
};
```

`sourceMaster` is documentation/build metadata and must not cause the browser to request files outside `public/`. Validate at development time that there are exactly five unique, consecutively ordered frames and fail visibly if an asset cannot load.

Define reducer events explicitly, for example `ASSETS_READY`, `APPROACH_TABLE`, `APPROACH_COMPLETE`, `RETURN_TO_ROOM`, `SET_FILM_MODE`, `TOGGLE_LOUPE`, and `LOUPE_HIT_CHANGED`. Camera animation completion must dispatch state transitions; meshes must not infer global state from animation progress.

Do not store user interaction or image data remotely. No runtime network permissions are needed after the local application bundle loads.

## Progress TODO

### Progress protocol

The implementation agent may complete any sensible subset of unblocked tasks in one run and does not need to finish the entire plan at once. Before stopping, update this section: check only tasks whose completion criteria and validation have passed, preserve unchecked work, record partial progress or blockers beside the affected task, and replace each relevant `Evidence: Pending` line with commands/results, visual QA notes, and commit identifiers when available. Multiple coherent commits are allowed; include the TODO update in the completing commit or immediately afterward when practical. If implementation changes the plan, preserve completed history, revise or append tasks explicitly, and record why. Because the directory is not currently a Git repository, do not fabricate commit evidence; re-check Git state before implementation.

- [ ] **T1 — Scaffold the desktop application and validation foundation**
  - **Paths/components:** new `package.json`, Vite/TypeScript configuration, `index.html`, `src/main.tsx`, `src/App.tsx`, base styles, test configuration, `README.md`.
  - **Dependencies:** none; re-check the root first.
  - **Work:** initialize React + TypeScript + Vite; add compatible stable releases of Three.js, React Three Fiber, Drei, and only the post-processing/test packages actually used. Establish scripts for development, production build, type checking, linting, unit tests, and desktop end-to-end tests. Add a full-viewport canvas shell, desktop minimum-size guard, error boundary, WebGL capability fallback, and placeholder loading state. Document local usage and asset policy.
  - **Completion criteria:** the empty scaffold renders a full-window desktop canvas without console errors; narrow viewports receive the desktop-required message; all newly established validation scripts execute successfully.
  - **Validation:** run every script added in `package.json`; open the production build locally in at least one supported desktop browser; record the exact commands after they exist.
  - **Evidence:** Pending.

- [ ] **T2 — Establish local assets and a physically scaled darkroom model**
  - **Paths/components:** new `public/assets/models/`, `public/assets/textures/`, `public/assets/environment/`, `THIRD_PARTY_ASSETS.md`, `src/scene/DarkroomEnvironment.tsx` and supporting scene components.
  - **Dependencies:** T1.
  - **Work:** build the room shell, counters, central table, viewing-table housing, and simple props at meter scale; create or select local CC0 PBR materials and low-intensity HDR reflection environment; add any justified GLB hero props; record provenance. Apply bevels, plausible UV scale, material variation, prop placement, and collision-free geometry. Keep the central viewing surface unobstructed.
  - **Completion criteria:** the room reads as a believable processed-film inspection darkroom from every allowed camera angle; dimensions and texture scale are internally consistent; there are no missing runtime asset requests, visible intersections, floating objects, or uncredited third-party assets.
  - **Validation:** inspect wireframe/normal/material debug views during development; run the build and asset-load checks established in T1; perform desktop visual QA at 1024 × 720 and 1440 × 900.
  - **Evidence:** Pending.

- [ ] **T3 — Implement physically plausible lighting, rendering, and room camera control**
  - **Paths/components:** new renderer setup, `CameraRig`, room controls, lighting rig, and restrained post-processing under `src/scene/`.
  - **Dependencies:** T2.
  - **Work:** configure color space, tone mapping, exposure, DPR cap, antialiasing, shadows, environment intensity, and subtle post-processing. Add the glowing frosted viewing surface and shadow-producing companion light. Implement a natural standing room camera with damped, constrained drag rotation and no wall/table clipping. Add deterministic renderer/camera behavior for tests.
  - **Completion criteria:** mouse dragging consistently inspects the room within intentional bounds; highlights retain detail; the viewing table attracts attention without clipping to featureless white; the room retains readable shadow detail; the camera cannot escape or cross geometry.
  - **Validation:** unit-test camera bound helpers; end-to-end test pointer drag and camera-state change; compare fixed-pose screenshots in deterministic mode; manually inspect in all four supported desktop browser families.
  - **Evidence:** Pending.

- [ ] **T4 — Prepare the photo roll and construct the continuous physical film strip**
  - **Paths/components:** existing `photos/roll-01/*.png`; new `scripts/prepare-assets.mjs`, `public/assets/photos/roll-01/`, `src/data/roll01.ts`, `src/scene/InspectionStation.tsx`, `LightTable`, `FilmStrip`, and `FilmFrame` components.
  - **Dependencies:** T1 and T3.
  - **Work:** create non-destructive, browser-ready derivatives of all five masters; define and validate the typed roll manifest; model the film base, five gates, 35mm proportions, eight perforations per frame per edge, frame gaps, edge markings, subtle surface wear, and restrained end curl. Ensure perforations reveal the illuminated diffuser and each gate can retain its own high-resolution texture.
  - **Completion criteria:** all five images appear once, in source order, on one strip; proportions and perforation cadence are consistent; no source master is modified; the strip remains stable without z-fighting and looks translucent/specular under changing view angles.
  - **Validation:** unit-test roll manifest ordering/uniqueness and film geometry calculations; verify generated asset dimensions and paths; visually inspect top-down and shallow-angle deterministic views.
  - **Evidence:** Pending.

- [ ] **T5 — Implement realistic negative simulation and positive reveal**
  - **Paths/components:** new `src/scene/materials/FilmMaterial.tsx`, shader/config modules under `src/scene/shaders/`, film control component, and color-transform tests.
  - **Dependencies:** T4.
  - **Work:** implement the linear-color, density-matrix, orange-base, transmission, curve, grain, and backlight pipeline; keep calibration constants centralized; add a development-only calibration view; implement the physical table control and interruptible negative/positive transition; synchronize table emission/exposure subtly without flash clipping.
  - **Completion criteria:** initial frames clearly resemble backlit color negatives rather than simple inverted JPEGs; positive mode matches the original masters within the intended film/scanner treatment; every frame changes together; rapid repeated toggles settle on the requested state without flicker or desynchronization.
  - **Validation:** unit-test any CPU-side reference color-transform functions and reducer transitions; end-to-end test initial negative mode and both direction changes; visually compare representative dark, neutral, skin-free, and saturated regions against the source and curated color-negative references.
  - **Evidence:** Pending.

- [ ] **T6 — Implement guided inspection and the optical loupe**
  - **Paths/components:** new `CameraRig` inspection transitions, `Loupe`, loupe shader/render-target logic, raycast-to-frame/UV helpers, and interaction state.
  - **Dependencies:** T4 and T5.
  - **Work:** transition into a stable whole-strip inspection view and back to the saved room view; model the resting and active loupe; raycast/clamp its position; sample full-resolution frame detail at about 2.5× magnification; match negative/positive color state inside and outside the lens; handle gaps and edges; add restrained glass reflection, edge distortion, and contact shadow.
  - **Completion criteria:** camera transitions never jump or clip; the loupe follows the pointer smoothly within bounds; the lens center is sharp and visibly more detailed than the base view; the loupe never samples the wrong frame; exiting restores its resting state and the saved room camera.
  - **Validation:** unit-test UV mapping, frame selection, bounds, and transition-state guards; end-to-end test approach, loupe activation/movement, film toggle while magnifying, and return to room; capture deterministic screenshots at a frame center, frame edge, and gap.
  - **Evidence:** Pending.

- [ ] **T7 — Complete desktop guidance, keyboard operation, resilience, and motion preferences**
  - **Paths/components:** `src/components/` HUD/help/loading/error controls, global focus styles, reducer integration, loading orchestration.
  - **Dependencies:** T3, T5, and T6.
  - **Work:** add concise first-use guidance, accessible DOM mirrors for essential mesh controls, documented keyboard mappings, focus management, reduced-motion behavior, loading progress, retryable asset errors, and WebGL fallback. Define pointer-event precedence so camera drag, table selection, physical toggle, and loupe movement never fight each other.
  - **Completion criteria:** the complete flow is discoverable without external instructions; keyboard controls reach the same stable states as pointer controls; reduced-motion mode has no long camera or flare animation; missing assets and WebGL failure produce readable recovery/fallback UI rather than a blank canvas.
  - **Validation:** automated reducer and DOM interaction tests; end-to-end pointer and keyboard journeys; manual keyboard-only, focus-visible, reduced-motion, resize, and failure-injection checks.
  - **Evidence:** Pending.

- [ ] **T8 — Optimize, validate realism, and close acceptance gaps**
  - **Paths/components:** all runtime code/assets/tests plus `README.md`, `THIRD_PARTY_ASSETS.md`, and this plan.
  - **Dependencies:** T1–T7.
  - **Work:** profile GPU/CPU/render calls, loading waterfall, texture memory, and layout; remove unused assets and overdraw; compress textures/models without visible hero degradation; finalize deterministic screenshots and browser coverage; conduct a realism pass for material scale, bevels, shadows, film color, light-table response, camera height, and loupe optics. Reconcile any documented compromise with the goal and update this plan.
  - **Completion criteria:** all definition-of-done items pass; the production build has no missing resources or runtime warnings; interaction remains responsive at 1440 × 900 on a representative modern desktop; the hero film and loupe stay crisp; all third-party assets are locally stored and documented; no mobile or deployment work has slipped into scope.
  - **Validation:** run the complete script suite established in T1 against a production build; execute deterministic end-to-end and visual tests; manually verify current desktop Chrome, Safari, Firefox, and Edge; record tested OS/browser versions and reference hardware because none exists in the current repository.
  - **Evidence:** Pending.

## Validation strategy

Because the repository currently has no tooling, exact command names become authoritative only after `T1` adds and documents them. The completed scaffold should cover these layers:

- **Static:** TypeScript without emit, linting, and production bundling.
- **Unit:** reducer/state guards, roll manifest validation, film geometry ratios, camera bounds, loupe frame/UV mapping, and any CPU reference for the density transform.
- **Component/interaction:** DOM controls, help/loading/error UI, keyboard mappings, and reduced-motion behavior.
- **End-to-end:** room drag, approach transition, initial negative state, positive/negative toggling including rapid reversal, loupe movement over each of five frames, gap behavior, return-to-room restoration, resize, failed asset, and WebGL-unavailable paths.
- **Visual:** deterministic room overview, inspection view, negative strip, positive strip, loupe at center/edge/gap, and reduced-motion end states. Keep tolerances narrow enough to catch material or camera regressions but account for known WebGL rasterization variance.
- **Manual realism:** scale, bevels, material roughness, normal-map strength, shadow contact, red-light restraint, highlight clipping, film translucency, orange mask, positive fidelity, end curl, sprocket cutouts, loupe sharpness, and absence of visible intersections.
- **Performance:** capture the test machine, browser, resolution, DPR, frame pacing, texture memory indicators where available, initial asset payload, and worst inspection-state render cost. Optimize based on evidence rather than disabling core realism features preemptively.

## Delivery considerations

- There is no deployment step. Delivery is a verified local production build and documented local run procedure.
- Keep original photos separate from generated web derivatives so an asset-pipeline error is recoverable by regeneration.
- Keep all CC0 assets and attribution inside the project so the experience does not break when an external host changes.
- If a shader or post-processing change causes a serious visual regression, the density-transform constants and effect intensities must be independently revertible without removing the physical strip or interaction state machine.
- Do not initialize Git or create commits unless the user or active workspace convention authorizes it. If Git exists when implementation starts, use coherent commits and record their identifiers in the TODO evidence.

## Risks and confirmed constraints

- **Realism versus browser performance:** Realistic lighting, transparency, shadows, and loupe rendering can multiply render cost. The design deliberately uses baked/faked indirect light, limited shadow-casting lights, selective high-resolution textures, and a controlled loupe shader.
- **Negative accuracy:** A display shader can create a convincing color negative but is not a calibrated emulation of a named film stock or scanner. Scientific calibration is explicitly out of scope; visual calibration against representative references remains required.
- **WebGL visual regression variance:** GPU and browser differences can change antialiasing and shader pixels. Deterministic state plus one canonical screenshot environment should gate regressions; the remaining browsers receive functional and manual visual checks.
- **No reference hardware:** The user confirmed desktop-only support but did not specify a target machine. `T8` must record the representative test machine rather than claiming universal frame-rate guarantees.
- **Asset availability:** CC0 material or HDR selections may change during implementation. Any replacement must meet the local-storage and provenance rules and must not change the confirmed visual or licensing scope.
- **Desktop-only:** Touch, responsive mobile composition, and low-end mobile GPU fallbacks are intentionally excluded. A narrow-viewport notice is required so unsupported layouts fail clearly.

No blocking questions remain under the confirmed scope.

## Handoff checklist

- Read this plan first, then re-check the project root for newly added instructions, manifests, plans, or Git state.
- Verify the five source PNG files and their dimensions before creating derivatives; never overwrite them.
- Start with `T1`; all later validation depends on its scripts and application shell.
- Re-verify compatible stable package versions and the selected CC0 asset licenses at implementation time.
- Treat the `Progress TODO` as the source of truth and update evidence before every stop.
- Do not expand into mobile, free-roaming navigation, audio, CMS/backend, gallery pages, or deployment without explicit user approval.
- There are currently no blocking user questions.
