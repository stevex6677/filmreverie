# Darkroom Film Viewer — Implementation Plan

## Goal

A desktop, iPhone and iPad web experience for exploring a 3D darkroom and inspecting 35mm/120 film on an illuminated table. Photographs and core interactions take priority over environmental detail.

## Completed summary

**M1–M15 are complete and accepted** (M1–M14 on 2026-09-11; M15 on 2026-09-13 UTC).

- **M1–M8:** Five-photo viewer, room/table journey, realistic film and loupe, zoom/pan and light-table dimming.
- **M9–M13:** Five film stocks, transmission lighting, 36-frame roll navigation, browser-local import/library with 120 formats, and fixed-position room look-around with independent lighting.
- **M14–M15:** Fluid navigation, library/crop review, incremental imports, sharper detail loading, and responsive iPhone/iPad touch controls.

Detailed implementation history and validation remain in Git and the existing `artifacts/` review records. Acceptance does not imply physical-device measurements were collected.

## Current state

- **M17**, authorized on 2026-09-14; implementation and its automated review package are delivered, awaiting human review.
- **M16 remains awaiting human review.** Its latest cumulative browser run has an unresolved intermittent loupe failure; earlier clean runs do not supersede that result.
- **M18 — Offline use and installable PWA** is the current assignment, authorized on 2026-09-15. Implementation and the complete automated gate are delivered; awaiting human/device review. Private HTTPS is configured and verified. M16/M17 remain pending independently.

## Continuing constraints

- Stack: React, TypeScript, Vite, Three.js, React Three Fiber and Drei. Reuse the existing application.
- Preserve the five source photographs, accepted crop/edge rendering, and existing imported rolls. The 36-slot development fixture repeats five photographs; it is not evidence of performance with 36 unique sources.
- Negative/positive preview applies to the entire negative strip, including borders and markings. E100 is positive-only. Stock, viewing mode and table brightness apply across the roll; room lighting remains independent.
- Imports remain browser-local, with JPEG/PNG storage and preserved originals/crop metadata. Formats: 35mm and 120 in 6×4.5, 6×6, 6×7 and 6×9. Native image normalization may precede import; no general HEIC decoder or HEIC original archive.
- Room exploration uses a fixed standing position with look-around, not walking. Preserve heading when returning from table inspection.
- Runtime assets stay local. Backend/accounts, uploads, cross-device sync, RAW/TIFF decoding, calibrated stock emulation, general deployment and comparison/ratings remain outside scope or deferred. M18 adds private HTTPS access and browser-local roll export/import specifically for offline use, origin migration and recovery.
- Follow [AGENTS.md](AGENTS.md) for local edits/Git, mapped remote validation and Mutagen verification/flush. Follow [SHARED_ASSETS.md](SHARED_ASSETS.md) for media; do not commit generated binaries or promote screenshot baselines without explicit authorization.

## Progress TODO

- [ ] **M16 — Overview and Focus table viewing**
  - **Status:** Implemented; awaiting human review. Authorized on 2026-09-13 UTC. Latest production build and 177 integration tests passed; 77/78 browser tests passed. The intermittent Ektar room-light loupe comparison passed twice in isolated rechecks without source changes, but its cause remains unresolved. This is not a clean cumulative pass.
  - **Review:** [M16 evidence and review instructions](artifacts/m16-candidates/REVIEW.md).
  - **Contract:** `Overview → open frame → Focus → Overview`. Focus zooms into the same table, retaining surrounding film and neighboring images. Default framing shows the selected photograph, physical film border and visible outer space; preserve aperture/crop positioning. Detail zoom may move the border offscreen; Reset framing restores it. The latest closer framing uses 1.16 times the vertical film envelope and 1.20 times image width.
  - **Navigation:** Save Overview pan/zoom once; frame navigation preserves it, and returning restores it with the last frame selected. Preserve stock, view, brightness and loaded imagery. Handle first/last bounds, resize, reduced motion and older saved views. Escape closes settings before leaving Focus, then returns from Overview to the room; M17 adds loupe exit precedence.
  - **Controls:** Keep Overview and Adjust reachable. Secondary controls may recede but return on pointer/touch input and stay visible while focused or adjusted. Adjust renders live without dimming the photograph. Desktop uses a side panel; iPad adapts to available width; phone uses a compact bottom sheet.
  - **Inputs:** Overview supports pan/zoom and opening frames. Focus offers previous/next and pointer-anchored detail zoom/pan. Fitted touch swipes navigate; magnified drags only pan, including at edges. Prevent drag-to-open accidents, support mixed iPad input and give each gesture one owner. M17's Inspection zoom lock supersedes ordinary zoom gestures while inspecting the loupe.
  - [x] **M16.1 — State and framing:** Overview/Focus transitions, saved-view restoration and table context implemented.
  - [x] **M16.2 — Controls:** Unified controls, live adjustments and responsive layouts implemented.
  - [x] **M16.3 — Navigation:** Desktop, iPad and phone input handling implemented.
  - [ ] **M16.4 — Complete validation and acceptance:** Review package delivered; remaining work:
    - Resolve the intermittent loupe failure and obtain a clean cumulative `npm run validate:m16` result without concealed retries or skipped tests.
    - Review image/border/outer-space framing for 35mm and every supported 120 format, first/last frames, desktop, phone portrait/landscape, iPad and narrow windows. Include detail zoom/reset, settings and orientation changes. Short landscape navigation can temporarily overlap the lower rebate; review this documented limitation.
    - Record physical iPhone/iPad Safari evidence for gestures, browser chrome and ergonomics. Browser emulation does not establish physical-device behavior.
    - Record explicit human acceptance. Keep this milestone unchecked until outstanding validation/review requirements are resolved.

- [ ] **M17 — Physical loupe: Inactivated, Activated, Inspection**
  - **Status:** Implemented; awaiting human review. Authorized on 2026-09-14. Production build, 184 integration tests and 24 M16/M17 browser tests passed with no failures/skips/retries. That focused browser result does not establish a full cumulative regression pass or resolve M16's recorded failure.
  - **Review:** [M17 evidence and review instructions](artifacts/m17-candidates/REVIEW.md). Run-specific commands, captures and limitations remain there.
  - **Contract:** Inactivated rests at the table edge; tap the object or Loupe control to activate. Physical size relative to film remains fixed through activation, parking, zoom and viewport changes. Activated drags without snapping the grab point and magnifies the entire scene beneath it, including borders, perforations and bare table.
  - **Inspection:** Tap the lens or Inspect for a continuous camera approach. The eyepiece fills most of the screen with a recognizable rim; portrait phones may crop the outer housing. Tap/click again, Pull back or Escape restores the previous table framing while retaining the inspected location. Put away returns Activated to Inactivated.
  - **Explicit zoom lock:** Wheel and pinch MUST NOT change camera zoom or optical power in Inspection. One-pointer drag and two-finger translation still move across the table. Optical magnification changes only through explicit controls/keyboard shortcuts.
  - **Inputs:** Suppress taps after drag or a second contact. Escape pulls back before putting away, before leaving Focus. Enter inspects an active loupe. Preserve visible accessible controls, safe areas, mixed input, cancellation, resize, reduced motion and approach reversal.
  - **Appearance:** Tapered matte housing, grip ribs, recessed glass, retaining bevels, translucent skirt and soft contact grounding. Optional peripheral optical effects preserve clear central detail and the housing when disabled. Remember effects and magnification preferences; prioritize source detail beneath the loupe.
  - [x] **M17.1 — State and camera:** Transitions, restoration, interruption, zoom locks and responsive approach implemented.
  - [x] **M17.2 — Interaction and controls:** Dragging, gesture ownership and accessible optical controls implemented.
  - [x] **M17.3 — Appearance and optics:** Physical model, full-scene capture and source-detail priority implemented.
  - [x] **M17.4 — Automated validation and review package:** Integration coverage and desktop/iPad/iPhone browser journeys delivered; physical-device review remains separate.
  - **Pending:** Physical iPhone/iPad review and explicit human acceptance. Preserve M16's separate pending gate.

- [ ] **M18 — Offline use and installable PWA**
  - **Status:** **Awaiting human review.** Implemented on `infra`, authorized on 2026-09-15. The complete gate on `70ef099` passed: production build, **202 integration tests and 138 browser tests**, including all 18 M18 scenarios; zero failures, skips or retries in that run. Earlier failures and diagnostic reruns remain recorded. Private HTTPS mapping, trusted certificate and app responses were verified on 2026-09-16 at `https://macbook.tail2b1388.ts.net`. Physical iPhone/iPad review and **human approval remain pending**. Preserve M16/M17's separate review gates.
  - **2026-09-16 UI revision:** Removed the persistent offline badge; moved recovery/storage details into Rolls and reserved a separate top row for “Update Available” / “Update now”. Foreground/reconnect/minute checks detect releases without navigation. Production build, 202 integration tests and all 21 offline/update plus 28 existing layout/loupe browser tests passed; overlap assertions and screenshots cover desktop, tablet, phone portrait/landscape and all viewing modes. This targeted follow-up is recorded separately from the earlier cumulative gate.
  - **Evidence:** [M18 review record](artifacts/m18-candidates/REVIEW.md); [offline/migration instructions](docs/OFFLINE.md). Commits: archive storage `e872bde`, PWA `7e2371b`, final behavior/tests `70ef099`. Linux WebKit runs the full journey with its test server stopped because its offline-emulation mode rejects cached worker fetches; this does not establish physical iOS airplane-mode behavior.
  - **Outcome:** After one successful online preparation, reopen the app and inspect saved rolls on desktop, iPhone and iPad with no network, a stopped app server, or an unavailable MacBook/SSH tunnel. Local photo imports and edits remain usable offline. First-ever offline visits and files available only on a server or in iCloud require a prior download.
  - **Existing foundation:** `src/storage/rollRepository.ts` stores roll metadata, originals, previews and thumbnails in IndexedDB; `src/storage/rollRuntime.ts` uses local blob URLs. `src/storage/importPhotos.ts` processes photos locally and requires secure-context crypto. M18 adds production registration in `src/main.tsx` and an inventoried worker after the Vite build, retaining the existing library and image pipeline.
  - **Scope:** Production-build offline caching, optional Home Screen installation, a stable private HTTPS origin, background offline preparation with on-demand details, safe app updates, storage persistence requests and portable roll export/import. No cloud backup, accounts, cross-device synchronization, public exposure or offline support for the separate model viewer.
  - [x] **M18.1 — Preserve rolls across address changes:** Add browser-local export/import through `src/components/RollLibrary.tsx` and the existing storage modules. Preserve original bytes, derivatives, crop/rotation, stock/format, sizing and saved views. Validate archives and handle duplicate IDs and failed imports without overwriting existing rolls. Make export available at the old HTTP origin before moving users to HTTPS; protocol, hostname and port each affect storage identity. Keep the old library intact and verify a round trip into a separate origin.
  - [x] **M18.2 — Stable private HTTPS access:** Use Tailscale Serve with the verified MacBook `*.ts.net` hostname and a stable HTTPS port, preserving existing mappings. Follow AGENTS.md for remote production preview, SSH forwarding and both local/device URL checks. Retain useful localhost access, but document that `http://macbook:<port>` cannot provide service-worker offline support. Document the migration sequence and optional iPhone/iPad Home Screen installation; do not use Funnel.
  - [x] **M18.3 — Reopen without the server:** Add a service worker and web app manifest (new), registered from `src/main.tsx` for production builds. Cache HTML, versioned JS/CSS, required scene/stock assets and default-roll imagery, including lazily loaded resources needed for full viewing. Serve cached navigation and assets without waiting for an unreachable server; read saved rolls from IndexedDB. Keep development/HMR uncached and prevent partially downloaded releases from replacing a working offline version.
  - [x] **M18.4 — Readiness, storage and updates:** Per the 2026-09-16 user revision, remove the persistent “Available offline” badge. Keep download details, incomplete-download explanations and retry in Rolls → Offline & storage. Distinguish offline readiness from server reachability, including a stopped server while the device is online. Request persistent storage where supported and handle denial/quota failures clearly; exports remain the backup. Offer “Update Available” in a dedicated row above the viewer, reserving space without overlapping existing controls, with explicit activation, preserving saved rolls and protecting unsaved work. Remove obsolete app caches only when safe; never clear the photo database during an app update.
  - [x] **M18.5 — Validate and prepare review:** `npm run validate:m18` is implemented in `package.json` and passed the production build, integration and complete configured E2E suites. The review record preserves commands, captures, earlier failures and the WebKit/device limitation. Use Vitest/fake-indexeddb for archive validation, round trips and failed-import preservation. Use real production service workers and browser storage in Playwright: prepare online, disable networking, reload and reopen a new page, navigate rolls, inspect source detail, import an on-device image and save/reopen it. Separately stop the preview server while the browser remains online. Cover interrupted preparation, incomplete caches, storage failure, app-version updates, unsaved-work protection and HTTP-to-HTTPS migration. No required skips or concealed retries; retain all earlier regression gates.
  - **Acceptance:** Cached default imagery and saved rolls render with working Overview/Focus/loupe, supported stock modes and brightness after offline reopening; new local imports persist; missing remote-only content is explained; updates and migration preserve photos and metadata. Verify actual iPhone/iPad Safari and Home Screen relaunch with networking disabled and the server unavailable, including rendered photos and gestures. Emulation alone cannot establish device behavior. Record results, revision, limitations and review steps in proposed `artifacts/m18-candidates/REVIEW.md`; then mark Awaiting human review and keep M18 unchecked until accepted.

## Progress protocol

Work within the currently authorized milestone; M18 is assigned; do not advance to another milestone. Complete sensible subsets in coherent commits, updating this TODO with partial progress, blockers, validation and commit evidence before stopping. Preserve completed history and explicitly record scope changes. Stop at Awaiting human review after the complete gate passes; do not advance to another milestone without authorization.

## Validation and handoff

1. Recheck the active checkout and current assignment; preserve accepted behavior and unrelated changes. Continue M17 review work as assigned without implicitly approving M16.
2. For implementation changes, run the named milestone validation command against a production build and include all existing regression integration/E2E suites. Record the exact suite scope, commands, revision, results and limitations; focused checks are not a cumulative pass.
3. Use Vitest and real-browser Playwright/WebGL with actual local assets and visible controls/pointer/keyboard/touch input. Check rendered results as well as state; report page/console errors and failed requests. Required tests must have zero failures/skips; retries must not conceal instability.
4. Preserve desktop Chrome regressions and mobile projects. Emulated WebKit/touch runs do not replace physical iOS Safari review. Verify frame/border visibility, gesture ownership, settings and loupe behavior visually.
5. Keep review evidence linked from the milestone record, with browser/device/viewport details, candidate captures and known limitations. Follow AGENTS.md's default of no Playwright video; if selected for motion review, inspect it and report what was observed.
6. Set status to **Awaiting human review** after validation. Keep pending checkboxes until explicit acceptance; do not start another milestone unless authorized. Human acceptance and permission to commit/promote binary baselines are separate.

**Handoff checklist:** Read AGENTS.md, this plan and the assigned milestone's linked evidence first. Re-verify checkout, synchronization, current scripts and review status. When M18 is assigned, start with library preservation and origin migration before changing access URLs; verify the current Tailscale hostname and mappings at implementation time. Run the full gate and attach review evidence before requesting acceptance.
