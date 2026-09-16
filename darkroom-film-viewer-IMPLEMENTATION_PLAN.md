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

- **M17 was the prior assignment**, authorized on 2026-09-14; implementation and its automated review package are delivered, awaiting human review.
- **M16 remains awaiting human review.** Its latest cumulative browser run has an unresolved intermittent loupe failure; earlier clean runs do not supersede that result.
- Keep milestone IDs and pending acceptance unchanged. This cleanup does not approve either milestone.
- **M19 is the current implementation assignment**, authorized after planning on 2026-09-15: stock-specific film looks with one strength slider. Implementation is delivered and cumulative validation is in progress. M18 is not recorded in this checkout; do not invent its scope or renumber milestones.

## Continuing constraints

- Stack: React, TypeScript, Vite, Three.js, React Three Fiber and Drei. Reuse the existing application.
- Preserve the five source photographs, accepted crop/edge rendering, and existing imported rolls. The 36-slot development fixture repeats five photographs; it is not evidence of performance with 36 unique sources.
- Negative/positive preview applies to the entire negative strip, including borders and markings. E100 is positive-only. Stock, viewing mode and table brightness apply across the roll; room lighting remains independent.
- Imports remain browser-local, with JPEG/PNG storage and preserved originals/crop metadata. Formats: 35mm and 120 in 6×4.5, 6×6, 6×7 and 6×9. Native image normalization may precede import; no general HEIC decoder or HEIC original archive.
- Room exploration uses a fixed standing position with look-around, not walking. Preserve heading when returning from table inspection.
- Runtime assets stay local. Backend/accounts, uploads, cross-device sync, RAW/TIFF decoding, calibrated stock emulation, deployment, comparison/ratings and backup export/import remain outside scope or deferred.
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

- [ ] **M19 — Film-stock looks with one strength slider**
  - **Status:** Implemented; cumulative validation in progress. **Evidence:** [M19 review record](artifacts/m19-candidates/REVIEW.md); production build, 197 integration tests and 3 focused desktop M19 browser tests passed. The first cumulative run exposed outdated pre-M17 test interactions; corrections are under cumulative validation. **Human approval:** Pending.
  - **Outcome / confirmed requirements:** Selecting a stock changes the photograph's appearance. Exactly one new effect slider controls the amount, starts in the middle, and removes all added stock treatment at zero. Existing table-light and loupe controls retain their separate purposes.
  - **Planned interaction:** Label the slider `Strength`, range 0–100, default 50. Zero bypasses added color, tone and grain; 50 is the intended balanced rendition; 100 is a stronger interpretation of that same stock. Keep the amount when switching stocks, apply it across the current roll, and save it with imported rolls. Place it below the stock selector with an accessible value and a short stock description. Support live pointer, keyboard and touch adjustments without blocking the image or triggering table gestures.
  - **Scope:** The existing Portra 160/400/800, Ektar 100 and Ektachrome E100 profiles; stock-specific tone curves, selective color response and subtle grain. These are film-inspired looks, not calibrated emulation. Scratches, dust, light leaks, heavy glow, extra effect controls, new stocks, destructive image processing and export are outside this increment. Exact profile coefficients and strength response curves are implementation/tuning work, not established film measurements.
  - **Current-state evidence / dependencies:** `src/data/filmStocks.ts` and `public/assets/film-stocks/*.json` describe identity, borders and masks, but contain no photo-grade profile. `src/shaders/filmShader.ts` samples the image and calls `filmTransmittance` in `src/shaders/tableIllumination.ts`. `src/components/Loupe.tsx` captures the scene, so the grade must be shared with ordinary viewing. Reuse `src/state/viewerState.ts`, `src/components/TableControls.tsx`, other mounted stock controls, `src/storage/rollRepository.ts`, `src/storage/rollRuntime.ts` and `src/App.tsx` for state, controls and persistence. Preserve M16/M17 behavior and their pending review records; reconcile any subsequently available M18 changes before implementation.
  - **Rendering contract:** Apply the stock treatment once to image content before the existing positive/negative transmission and table-light presentation. Do not grade the film border, markings, room or table. E100 remains positive-only. At strength zero, reproduce the existing untreated image pipeline for the same stock, viewing mode and lighting; this does not bypass the negative mask or make the displayed pixels identical to the uploaded file. Preserve source textures, originals, crop and rotation. Handle working/display color spaces explicitly and avoid duplicate tone mapping through the loupe.
  - **Grain and strength:** One amount coordinates tone, color and grain, with separate internal response curves permitted. Grain stays deterministic and anchored to the photograph/film surface, enlarges consistently under the loupe, and does not crawl during panning or jump when detail textures load. Account for 35mm versus 120 at comparable framing. Keep the Portra family related; do not manufacture dramatic hue casts to force every pair to look different.
  - **State / compatibility:** Add a bounded finite strength value to viewer state and persisted roll metadata. New rolls and older records without it use 50; preserve explicit zero on save/load. Invalid stored values fall back safely or clamp to the supported range. Switching frames, entering/exiting Focus or the loupe, changing viewing mode and adjusting lights retain strength. Ordinary view/framing resets retain it; the full viewer reset restores the default. Restore each imported roll's own value without leaking another roll's setting or losing it during library edits. Preserve stored source/viewing/thumbnail bytes; library/import thumbnails are source previews in this increment.
  - [x] **M19.1 — Establish reviewable stock profiles:** Extend the existing profile system with documented tone/color/grain settings and strength mapping. Use the reference directions below, distinguish manufacturer evidence from artistic choices, and record sources/emulsion editions and limitations. Tune 50 first on the same diverse photographs, then 0 and 100. Completion: all five profiles have a rationale and comparable candidate renders, with natural skin and usable highlight/shadow detail.
  - [x] **M19.2 — Deliver the live roll-wide treatment:** Wire profile selection and strength through state, photo materials, mounted responsive controls and imported-roll save/load. Avoid image re-decoding or shader recompilation on every slider event. Completion: normal viewing and loupe show the same treatment immediately; zero bypass, switching, reload, legacy records and unchanged originals satisfy the contracts above.
  - [ ] **M19.3 — Validate and prepare human review:** Add meaningful integration and rendered E2E coverage, run the cumulative gate below, and prepare a concise comparison/review record at proposed `artifacts/m19-candidates/REVIEW.md`. Keep generated media in unique shared ignored output folders per `SHARED_ASSETS.md`, linked from the review record. Record commands, revision/commits, browser/device details, results and limitations. Set **Awaiting human review** after the gate passes; keep M19 unchecked until explicit acceptance.
  - **Integration validation:** Vitest with the existing fake IndexedDB setup must exercise state → stock/material configuration and repository save → load restoration, including zero, default, invalid/out-of-range values, legacy records, rapid stock changes, cross-roll isolation and library edits. Check identity at zero, finite bounded transform results and deterministic grain. Update M9's explicit “without grading positive images” expectation to test the zero-strength compatibility path; retain its border/mask assertions and document the intentional nonzero behavior change.
  - **Rendered E2E validation:** Use actual local photographs and visible stock/slider controls in Playwright/WebGL. Verify image-region changes between suitable stocks at 50; 0/50/100 progression without requiring every pixel or stock pair to differ; returning to zero restores the untreated result within a documented rendering tolerance. Assert that borders/table remain unchanged by strength, treatment agrees inside/outside the loupe, and camera/crop/lighting remain stable. Cover all stock/view combinations, Overview/Focus/loupe, first/last frame, 35mm/all supported 120 formats, imported-roll reopen/reload and keyboard/touch slider use. Add M19 to the mobile project matchers in `playwright.config.ts`; its existing matchers only select M15–M17 and free-roll tests. Include desktop, phone portrait/landscape and iPad-sized review; distinguish emulation from physical iOS Safari evidence.
  - **Named gate (implemented):** `validate:m19` in `package.json` runs `npm run build && npm run test:integration && npm run test:e2e`. Run it in the verified, flushed mapped remote checkout. Include all existing suites, including accepted-milestone regressions and M16/M17; the current focused `validate:m17` is not a substitute. Required tests must have zero failures/skips/flaky outcomes; report console/page errors and failed asset requests. Do not hide retries, weaken assertions or promote visual baselines to obtain a pass.
  - **Visual acceptance:** Review a stock-by-strength comparison sheet using consistent scenes, crops, viewing mode and lighting, plus loupe details. Use varied skin tones, foliage, blue sky, saturated objects, bright highlights and dim interiors; supplement the existing five photos only with authorized local assets. The 50 setting should be convincing, 100 expressive but usable, and Portra differences may remain subtle. Confirm responsive dragging and stable grain visually; screenshot existence alone is not evidence. Record physical-device limitations and pending acceptance explicitly.

### M19 profile research starting points

The directions below are candidates to tune, not calibrated transforms or claims that uploaded images have neutral color. Manufacturer descriptions establish broad characteristics; consistent exposure/scanning comparisons, when available, should guide finer differences. Do not infer a universal warm/cool cast from unrelated online sample photographs.

| Stock | Reference foundation | Initial artistic direction at 50 |
| --- | --- | --- |
| Portra 160 | [Kodak E-4051](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/e4051_Portra_160.pdf): fine grain, smooth natural skin reproduction. | Restrained color, gentle tonal transitions, very subtle texture. |
| Portra 400 | [Kodak E-4050](https://www.kodakprofessional.com/sites/default/files/2025-07/e4050.pdf): natural skin, fine grain for its speed, strong color reproduction across lighting conditions. | Balanced color, slightly fuller than the proposed 160 look, soft highlights, delicate grain. |
| Portra 800 | [Kodak Photo Systems](https://kodak.photosys.com/products/portra-800-36exp-135-pro-pack-5-rolls): balanced saturation, natural skin and fine grain within its speed class. | More apparent texture and a little more color presence while retaining believable skin. |
| Ektar 100 | [Kodak](https://www.kodak.com/en/still-film/product/professional/ektar-100-film/): very fine grain, vivid color, enhanced saturation and sharpness. | Rich color, crisp tonal separation, minimal grain. |
| Ektachrome E100 | [Kodak E-4000](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/e4000_ektachrome_100.pdf): neutral balance, moderately enhanced saturation, extremely fine grain and a low-contrast tone scale. | Clean whites, neutral color, clear detail and controlled saturation. |

## Progress protocol

Work only on the first unaccepted milestone unless the user explicitly assigns another; the user has now assigned M19 implementation without accepting earlier milestones. Complete any coherent subset of the assigned milestone, updating its TODO before stopping with partial progress, blockers, validation and commit evidence. Preserve milestone IDs and completed history; record reasons for plan changes. Multiple coherent commits are allowed, with corresponding plan updates. Stop at **Awaiting human review** after the full gate passes unless autonomous continuation is explicitly authorized.

## Validation and handoff

1. Recheck the active checkout and current assignment; preserve accepted behavior and unrelated changes. Continue the explicitly assigned M19 work without implicitly approving M16/M17.
2. For implementation changes, run the named milestone validation command against a production build and include all existing regression integration/E2E suites. Record the exact suite scope, commands, revision, results and limitations; focused checks are not a cumulative pass.
3. Use Vitest and real-browser Playwright/WebGL with actual local assets and visible controls/pointer/keyboard/touch input. Check rendered results as well as state; report page/console errors and failed requests. Required tests must have zero failures/skips; retries must not conceal instability.
4. Preserve desktop Chrome regressions and mobile projects. Emulated WebKit/touch runs do not replace physical iOS Safari review. Verify frame/border visibility, gesture ownership, settings and loupe behavior visually.
5. Keep review evidence linked from the milestone record, with browser/device/viewport details, candidate captures and known limitations. Follow AGENTS.md's default of no Playwright video; if selected for motion review, inspect it and report what was observed.
6. Set status to **Awaiting human review** after validation. Keep pending checkboxes until explicit acceptance; do not start another milestone unless authorized. Human acceptance and permission to commit/promote binary baselines are separate.

### Handoff checklist

- Read this plan, `AGENTS.md` and, before handling review media, `SHARED_ASSETS.md`.
- Reverify the assigned milestone, current code, any missing M18 history, and prior unresolved regression results. For M19, begin with M19.1 when implementation is assigned; no additional design question blocks the recorded scope.
- This planning checkout is the Orca worktree `/Users/zhangzimou/orca/workspaces/film_photo/effect`, mapped to `/workspace/worktrees/orca/film_photo/effect`. Re-resolve the active root and verify the `orca-worktrees` endpoints/status/conflicts before remote execution; flush that exact session before checks depending on edits.
- Run the assigned milestone's full gate, attach review evidence, update status and stop for human review. Do not infer deployment authorization from a planning or implementation request.
