# Darkroom Film Viewer — Implementation Plan

## Goal and current assignment

A desktop, iPhone and iPad experience for exploring a 3D darkroom, inspecting photographic film, and closely examining the cameras in the collection.

**M1–M19 are complete per the user's instruction on 2026-09-19.** Their descriptions are condensed below; implementation history remains in Git and linked review records. This explicit closure supersedes their previous pending-review checkboxes. It does not invent missing test passes or physical-device evidence.

**M20 is implemented through M20.3 under the user's “do it” instruction.** M20.4 remains open: the cumulative gate exposed inherited failures and timing-sensitive regressions; see [camera shelf review](docs/CAMERA_SHELF_REVIEW.md) for comparisons, corrections and current evidence. Human acceptance remains pending.

## Progress TODO

- [x] **M1–M8 — Core film viewer:** Five-photo viewer, room/table journey, realistic film and loupe, zoom/pan, and light-table dimming. Accepted 2026-09-11.
- [x] **M9–M13 — Film and library foundation:** Five film stocks, transmission lighting, 36-frame navigation, browser-local imports, 35mm/120 formats, fixed-position room look-around, and independent room lighting. Accepted 2026-09-11.
- [x] **M14–M15 — Navigation and touch:** Fluid journeys, library/crop review, incremental imports, sharper detail loading, and responsive iPhone/iPad controls. Accepted through 2026-09-13.
- [x] **M16 — Overview and Focus:** Open individual frames in the same table scene; retain film context, restore Overview framing, and support responsive adjustments and navigation. Human closure: 2026-09-19. Evidence: [review record](artifacts/m16-candidates/REVIEW.md).
- [x] **M17 — Physical loupe:** Parked, activated and inspection states; full-scene magnification, physical scale, gesture ownership, and restoration. Wheel/pinch cannot change zoom during loupe Inspection. Human closure: 2026-09-19. Evidence: [review record](artifacts/m17-candidates/REVIEW.md).
- [x] **M18 — Offline/PWA:** Offline saved-roll viewing, local imports, portable archives, private HTTPS, safe updates and storage/recovery controls. Human closure: 2026-09-19. Evidence: [review record](artifacts/m18-candidates/REVIEW.md), [offline guide](docs/OFFLINE.md); cumulative gate at `70ef099`: build, 202 integration and 138 browser tests passed. Later update-UI checks are recorded separately in history.
- [x] **M19 — Saved-roll shelf:** Physical 4 × 4 cabinet, sourced packaging, cover frames, stable slots/pages, roll editing/cards, trash/restore, and reversible shelf approaches. Human closure: 2026-09-19. Evidence: [shelf review](docs/SHELF_REVIEW.md), [packaging manifest](public/assets/film-packaging/README.md). Historical shelf tests retain the `m18-` prefix.
- [ ] **M20 — Camera shelf and close inspection**
  - **Outcome:** Discover a correctly sized Mamiya Universal on a dedicated room shelf, approach it like the film shelf, then open a full-angle model inspection view with useful camera information.
  - **Dependencies:** Accepted room/shelf navigation, shared physical scale, current Mamiya GLB, and reusable standalone model viewer.
  - **Scope:** One camera, shelf placement, room navigation, integrated inspection, metadata, local asset delivery and offline preparation. Additional cameras need catalog entries later; collection editing, model uploads, exploded views, animated mechanisms, AR and new model production are deferred.
  - [x] **M20.1 — Display the current camera at physical scale:** Current GLB/path/checksum verified; right-wall shelf and equipment relocation implemented. Actual geometry measures 210 × 174.18 × 207.91 mm after uniform scaling and fits the shelf.
  - [x] **M20.2 — Complete the room → shelf → display journey:** Both physical and toolbar entry, shared shelf navigation, responsive inspection, presets, history and focus restoration implemented. WebKit re-entry after viewport rotation uses pointer capture to preserve label activation.
  - [x] **M20.3 — Complete information and resilient delivery:** Sourced metadata, shared viewer core/catalog, loading/retry, accessible controls, optional model caching, safe app updates and graphics recovery implemented. Standalone links preserved.
  - [x] **User feedback revision — Loading, rotation and room layout:** Start the shared model alongside film loading and reveal the room after its first rendered frames, retaining bounded failure recovery. Coalesce synchronous orbit updates into one animation loop. Replace the chemistry shelf with a 120 cm, two-tier camera cabinet; move chemicals/drying equipment beside the door and remove box storage. Preserve the detailed model and 21 cm scale.
  - [x] **Second room revision — Developing bench, centered eye and rendering:** Move the entire wet bench/sink/trays beneath the door-side chemicals. Center the standing eye in the room, face the film cabinet, and align camera cabinet top/bottom with the film cabinet (558 mm tall). Batch static shelf meshes and replace room-only lens transmission with tinted reflections, keeping inspection materials and all geometry intact. Suppress shelf activation after a drag that returns to its starting point.
  - [x] **Wall mounting and label revision:** Mount the back flush against the right wall and reduce cabinet depth to 260 mm so its front edge projects no farther inward than the left bench. Preserve actual camera clearance and 210 mm scale. Remove the floating room collection label; physical cabinet taps and the header Cameras button still approach it, and the inspection nameplate appears only in shelf view.
  - [x] **Focused cabinet framing:** Fit the current cabinet bounds to the available screen between controls; use 94% width on portrait screens and hide other room geometry after approaching. Preserve room return and direct camera taps. Desktop/iPad use the full region between controls, up to 98% width, with a compact desktop header and lower toolbar.
  - [x] **Cabinet styling:** Shift the cabinet toward the light table, move the camera and its touch target to the upper-left tier, and add three film boxes/two cartridges using shared film-shelf textures. Preserve physical dimensions and future camera space.
  - [x] **Compact cabinet and direct tablet taps:** Shorten the cabinet to 900 mm, retain two tiers with six positions, and reduce depth to 240 mm with a more frontal camera pose. Keep over 150 mm clearance from the developing bench. Activate touch/pen taps on pointer release, reset stale gesture state on fresh presses, and rotate physical hit bounds consistently with the visible camera. Tablet portrait/landscape tests cover direct model taps without compatibility clicks.
  - [ ] **M20.4 — Validate and prepare review:** Implement and pass the cumulative `npm run validate:m20` gate described below; inspect rendered desktop/phone/iPad views and actual model detail; deliver proposed `docs/CAMERA_SHELF_REVIEW.md` with commands, revision, captures and limitations.
  - **Acceptance:** All requirements in the design and validation sections pass; actual camera geometry is inspectable from front, back, both sides, above and below; returning preserves room and film state.
  - **Validation contract:** `npm run validate:m20` now runs production build, all integration/E2E checks and the three standalone viewer gates. Its first complete E2E run had 195 passes and 23 failures; this is not an accepted milestone or a clean cumulative pass.
  - **Evidence:** Original implementation commit `9ca8a4a`; [docs/CAMERA_SHELF_REVIEW.md](docs/CAMERA_SHELF_REVIEW.md). Latest room revision: build, 239 integration tests and 36 scoped browser checks pass. Shelf rendering batches static geometry and avoids full-scene transmission; inspection maintains one animation chain. Review candidates remain ignored; cumulative failures and intermittent film-shelf timing behavior are retained in the review.
  - **Human approval:** Pending.

### Historical validation limitations

At closure, M16's latest recorded cumulative run had an intermittent loupe failure; M17's recorded browser pass was focused; M19's cumulative gate was not clean because of older regressions and shared-server resource failures. Physical iOS evidence was incomplete. Keep those facts in the review history. User closure does not establish that the failures were fixed; M20 must report and resolve failures encountered by its cumulative gate rather than silently excluding them.

## Continuing contracts

- Reuse React, TypeScript, Vite, Three.js, React Three Fiber and Drei. Preserve saved rolls, originals, crops, table framing, film borders and accepted loupe behavior.
- Keep room exploration at the fixed standing eye. Preserve heading when returning from an approached object; preserve roll/stock/format, brightness and table viewing state through camera inspection.
- Use `src/data/physicalScale.ts` for physical dimensions. Fit the viewing camera to objects; do not change object size to fit screens. Film-shelf geometry in current source is authoritative where older prose differs.
- Runtime assets are served locally. Keep imports browser-local and existing PWA/archive behavior intact. No accounts, uploads, public exposure or deployment in this milestone.
- Follow applicable project instructions for local editing/Git and mapped remote runtime checks; follow [SHARED_ASSETS.md](SHARED_ASSETS.md) for binary assets. Do not commit generated binaries or approve visual baselines automatically.

## M20 design

### Placement and appearance

Place the camera cabinet on the **right wall where the development chemicals were**. Move the complete developing station to the rear wall beside the door. Start the viewer at the room's horizontal center, facing the film cabinet.

Use a warm wood cabinet with a dark backing and restrained neutral display lighting. The cabinet is **900 mm wide × 240 mm deep × 558 mm high**, mounted flush to the right wall, with its top and bottom aligned to the film cabinet. Two tiers each provide approximately **249 mm clear height** after board thickness. Six 300 mm layout positions allow three cameras per tier, subject to each future model's actual dimensions. Give the Mamiya an almost frontal presentation in the first upper position and a grounded contact shadow. Show its readable inspection nameplate only in the approached shelf view; omit the floating collection label in the room. Add three assorted film cartons and two 35 mm cartridges as inert display props, reusing the film shelf’s textures and physical dimensions. Leave generous open space. Shift the cabinet approximately 167 mm toward the light table along the wall. Responsive labels must remain clear of controls and the camera silhouette.

In `DarkroomRoom.tsx`, relocate the equipment shelf, timer, chemical jugs and drying wire/clips to the rear wall beside the door. Remove the box-storage unit and redundant wet-wall drying rail in `RoomZones.tsx`; move the sink, faucet, bench and all three trays beneath the relocated equipment. Keep the doorway clear, avoid wall penetration and overlapping furniture/hit targets, and preserve the film cabinet and its links. A visible “Cameras” navigation control provides equivalent access when the cabinet is outside the initial field of view.

### Current model and 21 cm scale

Read [CURRENT.json](blender/mamiya_universal/CURRENT.json) again at implementation time. As of this plan it selects **Hybrid v2 — black body**, and [models.json](standalone/model-viewer/models.json) agrees:

- Model ID: `mamiya-universal`.
- Browser asset, relative to shared `ignored_generated/`: `blender/mamiya_universal/hybrid/v2/browser_preview/runs/20260912T073337Z-1d792c08/mamiya-black-body.glb`.
- SHA-256: `6d426487c0a5c5fc59ad969158bee3d2612ce67a6bf6934f82cc78c1bbd96b73`.
- Verified delivery: 18,606,972 bytes and 670,713 triangles. Asset preparation and geometry/browser checks verify the current file, checksum and real rendered model; device performance still requires physical-device acceptance.

Resolve media through `shared-assets.json`, not the worktree or file modification dates. Preserve the source `.blend` and use the existing browser derivative. No remodeling is required.

Orient the camera upright/front-facing first, measure its full visible left-to-right bounds including the modeled grip, then apply **one uniform scale** so that width is `mm(210) = 0.756` world units. Measure before the shelf's decorative yaw; the rotated footprint may be wider. Preserve height/depth proportions, center laterally, and ground the bottom on the shelf. This defines the user's 21 cm requirement as the complete displayed assembly. Do not infer scale from the longest axis or stretch axes independently. The same transform must survive viewport and scene changes; inspection magnification comes from view framing. The existing standalone viewer's longest-axis normalization is unsuitable for shelf sizing.

### Navigation contract

`Room → Camera shelf → Camera display → Camera shelf → Room`

- In room view, click/tap the physical camera shelf or its “Cameras” control to approach a centered shelf view. The camera object itself also approaches the shelf on this first click; it does not skip the shelf view.
- Match film-shelf flight timing (currently 0.42 seconds), easing, reduced-motion behavior, responsive framing and reversal from the currently rendered pose. Preserve the saved room heading.
- In shelf view, click/tap the camera or focus its nameplate and press Enter to open the display. Hover/focus may reveal the name and introduction year; touch never depends on hover. Empty shelf space is inert on tap.
- Match film-shelf drag behavior: dragging the shelf/camera beyond the threshold returns toward the room and continues look-around; suppress the trailing click. Pinch, multiple contacts and cancellations must not accidentally open the model. Toolbar controls own their input.
- In camera display, dragging rotates the model and never triggers shelf/room movement. Pinch/wheel zoom, two-finger/right-button drag pan, and keyboard/preset controls belong exclusively to the model viewer.
- Back to shelf restores the shelf approach and keyboard focus to the camera. Back to room restores the room pose. Escape closes an open information panel first, then leaves display for shelf, then shelf for room. Browser Back follows entered views without trapping the user; browser Forward restores valid views. Handle rapid navigation and resize during transitions.
- Preserve active roll, saved table framing, film-shelf page, room/table lighting and local data. No storage migration is needed for camera collection metadata in this increment.

### Camera display page

Use a full-screen inspection space within the existing app, with a neutral charcoal background and soft studio lighting that reveals the black leatherette, metal edges and lens coating independently of room brightness. Default to a still three-quarter view. Keep auto-rotation off unless explicitly enabled; reduced motion disables it. Avoid a solid pedestal/floor that hides the underside.

- **Desktop / wide iPad:** Large model stage with a compact right-hand information panel; persistent Back to shelf at the upper left and a quiet control bar below the stage.
- **Phone / narrow iPad:** Model stage takes the main viewport. A compact name/year strip opens a scrollable information sheet; it must not obscure essential navigation or consume model gestures outside the sheet. Respect safe areas and 44 px touch targets.
- **Inspection controls:** Free 360° horizontal rotation and full vertical access including the underside; zoom and pan with safe near-plane limits; Reset view; Front, Rear, Left, Right, Top and Bottom presets. Reset restores orientation, pan and a viewport-fitted whole-camera framing. Provide labeled zoom/rotation controls and keyboard operation as alternatives to gestures. No automatic reset during ordinary resize/rotation; preserve the inspected angle and keep recovery controls visible.
- **Information:** “Mamiya Universal”, manufacturer Mamiya, model introduction year **1969**, medium-format press/rangefinder description, **width 21 cm**, and the modeled **Mamiya-Sekor 100 mm f/2.8** configuration from the current catalog. Explain interchangeable lenses/backs briefly; distinguish system capabilities from the modeled configuration. Add only verified specifications.
- **Year accuracy:** Show “Introduced 1969” separately from “Manufactured: unknown” for this particular camera. A model introduction date does not date the user's individual body or black finish. The [camera history reference](https://mamiya.awane-photo.com/camera/press/universa/index.htm) supports the 1969 introduction and describes interchangeable backs; retain source links alongside metadata. No invented serial-number history or exact production range.
- Show a brief “Drag to rotate · Pinch or scroll to zoom” hint that recedes after use, a loading indicator, readable failure message with Retry, and an always-available exit. Optional concise “About this camera” copy belongs in the information panel; model revision names are not the historical camera name.

### Reuse and implementation boundaries

Read [standalone/model-viewer/README.md](standalone/model-viewer/README.md). This request authorizes integration into the Web App; reuse the existing viewer instead of creating another independent viewer page.

- Extract reusable loading, material-profile, studio-lighting and view-control logic from `standalone/model-viewer/viewer.js` into shared modules, with adapters for its existing page and the app's proposed `CameraDisplayView.tsx`. Preserve `/?model=mamiya-universal`, other catalog entries and standalone operation. Use the same model catalog/profile and avoid a hardcoded link to the current private viewer server.
- Extend catalog metadata with physical width and sourced camera facts. Keep asset identity/path tied to CURRENT.json; check agreement in validation. Do not change CURRENT.json merely for a UI integration. If a new derived model is necessary, follow its delivery/update rules and retain source provenance.
- Add proposed `CameraShelf.tsx`; integrate with `ViewingTableScene.tsx`, `DarkroomRoom.tsx`, `RoomZones.tsx`, `App.tsx` and `index.css`. Generalize `viewerState.ts`'s film-only `shelfFocused` handling into explicit shelf identity and selected-camera display state; adapt `CameraRig.tsx`, `ShelfNavigation.tsx` and `roomHitTarget.ts`. Preserve old film-shelf actions and persisted view compatibility. Resolve hits against the nearest visible physical object.
- Connect asset preparation to `scripts/prepare-assets.js` and the production asset inventory. Serve content-addressed GLB URLs from the app's origin, including embedded textures. Start loading alongside photographs, reuse the decoded asset in shelf/display, and include its first rendered frames in normal initial-room readiness. Retain the loading screen's safety timeout and release on model error so photographs remain reachable. Coalesce orbit-control invalidations into one animation chain, settle to idle, and dispose owned GPU resources safely. Preserve model detail unless device measurements justify a separate derivative.
- Extend `scripts/build-offline.mjs` / `src/offline/worker.js` as needed: prepare the camera asset separately from essential film caches, cache after a successful full download, and reopen it offline when prepared. A never-downloaded model gets “Camera model isn't available offline” with retry when online; film readiness and saved photographs remain usable. Interrupted downloads, quota errors and app updates must not corrupt either cache or IndexedDB. Offer camera download/readiness in the existing offline/storage UI.
- On WebGL/context/load failure, preserve metadata, return controls and film state; allow a clean retry. New camera additions should require catalog/layout data, not copied pages. Model upload/management UI remains deferred.

## M20 validation and review

**`npm run validate:m20`** in `package.json` is the gate for the production build, the complete existing Vitest integration suite, the complete configured Playwright E2E suite including M20, and the standalone viewer's `npm test`, `npm run test:reuse`, and `npm run test:browser` in its directory. M20 is included in the mobile-project patterns. Required tests must have zero failures/skips/flaky retry-only passes; retain earlier regressions and approved baselines.

- **Integration:** Actual GLB bounds/orientation and uniform 210 mm scale; finite fit and clearance; manifest/catalog agreement; navigation and restoration across both shelves; overlapping physical hits; metadata validation; model-cache completion/failure and safe updates. Use existing Vitest/fake-indexeddb boundaries where relevant.
- **E2E:** Use normal visible controls and real local GLB/WebGL. Exercise room → shelf → display → shelf → room, both shelf entry controls, all presets, arbitrary drag rotation, zoom/pan/reset, keyboard/Escape/browser history, rapid reversal, drag suppression, mixed input, resize and reduced motion. Verify visibly different rendered sides and inspect top/underside; a ready label alone is insufficient.
- **Responsive / regression:** Desktop Chrome, phone portrait/landscape, iPad-sized touch and mobile WebKit. Check controls never cover critical model detail by default, model fits, and zoom exposes lens/rear markings. Cover film-shelf page/cards/edit/trash/restore, table Focus/Overview, loupe, imports and offline/update regressions. Test repeated shelf/display entry for duplicated handlers, downloads and resource growth.
- **Failure / offline:** First visit without model cache, failed download and Retry, interrupted cache preparation, graphics loss/recovery, prepared reload with no network and separately a stopped server. The rest of the app remains navigable throughout.
- **Visual / device evidence:** Inspect actual shelf placement, scale relative to film objects, grounding, occlusion, material readability and all six sides. Capture desktop/phone/iPad review candidates and record loading/interaction observations with device details. Physical iPhone/iPad Safari and Home Screen checks are distinct from browser emulation; report missing device evidence explicitly. Do not claim motion review from an uninspected video.

Record results, commit IDs, source/checksum verification, screenshots and limitations in proposed `docs/CAMERA_SHELF_REVIEW.md`. After the complete gate passes, set M20 to **Awaiting human review**, leave its top-level checkbox open, provide review steps, and stop for acceptance.

## Progress protocol

Work only on the first unaccepted milestone, M20, once implementation is requested. Any sensible subset may be completed in a run; update checkboxes, partial progress, blockers, validation and commit evidence before stopping. Preserve completed history and explicitly explain scope revisions. Coherent commits are allowed; include the corresponding TODO update with each completed increment or immediately afterward. Stop at the human-review gate unless the user explicitly authorizes continuation.

## Handoff checklist

- Read this plan, applicable project instructions, CURRENT.json, the standalone viewer README and SHARED_ASSETS.md first. Resume at M20.4 and the review's unresolved validation list; M20.1–M20.3 are implemented.
- Reverify active checkout, sync endpoint, current asset/checksum, catalog agreement and real model bounds. Planning checkout: Orca `infra`, `/Users/zhangzimou/orca/workspaces/film_photo/infra`; canonical remote counterpart: `/workspace/worktrees/orca/film_photo/infra`. Do not validate a different checkout or assume this checkout is the deployed service.
- Run runtime/build/tests remotely after verifying and flushing the matching connected, conflict-free session. Follow the user's current environment instructions if they differ from older repository setup prose.
- Blocking design questions: none; placement, scale convention and responsive page direction are specified under the user's delegated design authority. Actual-device access and any inherited test failures must be recorded if they block validation.
- Deliver M20 only, its complete gate and review evidence. No deployment or changes to an existing running standalone viewer service are authorized by this plan.
