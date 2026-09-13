# M16 — Overview and Focus review

M1–M15 were explicitly accepted by the user on 2026-09-13 UTC. M16 implementation is delivered in the main checkout, based on `9adedfb`, and is Awaiting human review. The latest build and 177 integration tests passed; 77/78 browser tests passed, with one intermittent loupe failure that passed twice in isolated rechecks. M16 human acceptance and physical-device review remain pending.

## Latest adjustment — closer Focus, second refinement

The user requested another zoom increase. Focus now uses 1.16 times the vertical film envelope and 1.20 times the image width, giving roughly another 16–18% increase for 35mm depending on viewport aspect. Measuring the image width avoids reserving unnecessary strip-end space for middle photographs. The original table and neighboring frames remain rendered. The selected photograph and surrounding rebate stay visible with space around them. Redundant Focus title text is hidden, and desktop navigation moves toward the bottom edge. Enter Focus again or use Reset framing to apply the new default.

Desktop, iPad portrait, phone portrait and phone landscape captures were visually inspected under `ignored_generated/m16-table-view/runs/20260913-focus-v3/`. In short landscape windows the temporary navigation row overlaps part of the lower rebate until controls recede; the photograph remains unobstructed. Physical-device review remains pending.

The first full run passed build, all 177 integration tests and 76/78 browser tests. The two edge-alignment checks scanned a fixed horizontal crop that the closer photograph now exceeds. They now scan the full canvas and still require both photograph edges inside the scan and at most one pixel of edge variation. The final cumulative rerun passed the production build, all 177 integration tests and 77/78 browser tests, including every Focus and edge-alignment check. One Ektar room-light loupe comparison failed intermittently (mean difference 10.83 versus required <1); the same unchanged test passed twice in an isolated diagnostic run. Its intermittent cause remains unresolved; this is not a clean cumulative pass. Logs, source manifest and final desktop framing captures are in `ignored_generated/m16-table-view/runs/20260913-focus-v3-final/`. Both localhost and macbook preview URLs returned HTTP 200.

## Previous adjustment — closer Focus

The user requested more zoom. Default Focus is now approximately 18–22% larger on screen: the vertical framing allowance changes from 1.65 to 1.35 times the film envelope, and the horizontal allowance from 1.30 to 1.10. The selected image, film border and outer space remain visible; neighboring photographs remain in the same table scene. Enter Focus again or use Reset framing to apply the closer default to an already open view. The compact landscape navigation was moved below the film. Validation passed: production build, all 177 integration tests and all 78 browser tests, with zero failures/skips/retries; evidence directory: `ignored_generated/m16-table-view/runs/20260913-closer-focus/`.

Visually reviewed closer framing:

- [Desktop](../../ignored_generated/m16-table-view/runs/20260913-closer-focus/m16-table-view-M16-zooms-t-3f0e3-sible-and-restores-Overview-desktop/focus-1280x800.png)
- [Phone portrait](../../ignored_generated/m16-table-view/runs/20260913-closer-focus/m16-table-view-M16-zooms-t-3f0e3-sible-and-restores-Overview-desktop/focus-390x844.png)
- [Phone landscape](../../ignored_generated/m16-table-view/runs/20260913-closer-focus/m16-table-view-M16-zooms-t-3f0e3-sible-and-restores-Overview-desktop/focus-844x390.png)

The first cumulative run passed 77/78 browser tests; the remaining mobile layout assertion raced the asynchronous visualViewport resize event. Its test now waits for the actual canvas height before evaluating the new layout, without extending timeouts or changing application behavior. The fresh complete gate passed. `validation.log` and `source-manifest.json` in the closer-focus run directory record the result and source revision.

## Previous correction — retain the table scene

The user clarified that Focus is a zoomed-in view of the same table, not an isolated image. Focus now preserves the light table, all original strips and neighboring photographs. The camera framing and minimal controls remain. The earlier isolated-frame captures below are superseded. All 13 focused browser checks passed, including visible neighboring-image assertions in Chrome, touch Chromium and WebKit. The updated desktop and phone captures were visually reviewed: the selected frame is centered while adjacent images and rows remain on the table. The correction also passed `npm run validate:m16`: production build, 177 integration tests and 78 browser tests in 3.2 minutes, with zero failures/skips/retries. The log, source checksums and updated captures are under `ignored_generated/m16-table-view/runs/20260913-table-context/`.

Current correction captures:

- [Desktop: Focus within the table](../../ignored_generated/m16-table-view/runs/20260913-table-context/focused/m16-table-view-M16-zooms-t-3f0e3-sible-and-restores-Overview-desktop/focus-1280x800.png)
- [Phone: surrounding strips remain visible](../../ignored_generated/m16-table-view/runs/20260913-table-context/focused/m16-table-view-M16-zooms-t-3f0e3-sible-and-restores-Overview-desktop/focus-390x844.png)

## Delivered behavior

- Overview shows the current roll, supports pan/zoom and frame selection, and provides Rolls, Room, Frames, Adjust and Fit roll.
- Opening a frame enters Focus consistently for the five-photo example, the 36-slot fixture and imported rolls. It saves Overview once; navigating between frames preserves that saved view; Overview restores it and retains the last selected frame.
- Default Focus shows the selected photograph and its physical film border with surrounding table space and neighboring images. The source aperture, crop and film artwork are unchanged. Detail zoom can move the border offscreen; Reset framing restores the comfortable view.
- Overview and Adjust remain reachable. Secondary controls recede during inactivity, return on mouse movement or touch, and remain accessible by keyboard. Opening or closing settings does not resize the camera viewport.
- Desktop uses a side panel and pointer/keyboard navigation. iPad supports touch and keyboard/trackpad together. Phone places primary Focus controls at the bottom and uses a short, scrollable Adjust sheet so the photograph stays visible.
- Fitted touch swipes change frames; magnified dragging pans within the selected frame. The explicit loupe retains its placement and two-finger navigation behavior. Settings own their keyboard input; Escape closes settings before leaving Focus.
- Older saved strip views normalize to Overview at their saved position; saved frame views enter Focus with valid zoom/pan bounds. Roll data and source/crop metadata are preserved.

## Validation and evidence

Local source: `/Users/zhangzimou/Projects/film_photo`. Remote runtime: `/workspace/film_photo`. The `film-photo` Mutagen session was verified connected with no conflicts and flushed before validation. Git operations and source edits were local; builds and browser tests ran remotely.

The final command is `npm run validate:m16`, which runs the production build, complete Vitest suite and complete Playwright suite. It uses `PLAYWRIGHT_PORT=5197`, four workers, no test retries, and dedicated output paths under `ignored_generated/m16-table-view/runs/20260913-0455/`:

| Environment variable | Suffix below the run directory |
| --- | --- |
| `PLAYWRIGHT_OUTPUT_DIR` | `browser` |
| `REVIEW_ARTIFACTS_DIR` | `regressions` |
| `M9_CANDIDATE_DIR`, `M10_CANDIDATE_DIR` | `m9`, `m10` |
| `M9_M10_CANDIDATE_DIR` | `combined` |
| `M11_CANDIDATE_DIR`, `M12_CANDIDATE_DIR` | `m11`, `m12` |
| `M12_PANEL_CANDIDATE_DIR` | `panel` |
| `M13_CANDIDATE_DIR`, `M14_CANDIDATE_DIR` | `m13`, `m14` |

Both `GST_PLUGIN_SYSTEM_PATH_1_0` and `GST_PLUGIN_PATH_1_0` are empty for this run: the remote WebKit host otherwise aborts because GStreamer loads incompatible libsoup versions. This is a browser-host workaround, with no application-code substitution. The persistence test now inherits the project's graphics launch options instead of starting a separate software-rendering configuration.

Final result: production build passed; 177/177 integration tests passed across 21 files; 78/78 browser tests passed in 3.2 minutes, with zero failures, skips or retries. `git diff --check` passed. Full log: `ignored_generated/m16-table-view/runs/20260913-0455/validation.log`. The preceding complete run passed the build, 177 integration tests, and 77/78 browser tests; its remaining browser-restart asset-readiness failure prompted the graphics-configuration correction. The phone Adjust-height correction is included in the final run. Earlier diagnostic failures were resolved through changes and fresh runs; no failed tests were skipped or hidden by retry settings.

The run also contains `source-manifest.json` with the base revision and SHA-256 checksums of the implementation/test files. All final run media and measurements were retrieved to the matching local ignored directory.

The browser matrix includes desktop Chrome, touch Chromium, and Linux mobile WebKit. Chrome uses ANGLE/Vulkan on the remote NVIDIA RTX 3060. M16 framing captures cover 1280×800, 390×844, 375×667, 820×1180, 1180×820 and 844×390; M15 adds narrow-window and mobile import coverage. These are browser-emulated layouts, not physical iOS devices.

New checks cover saved panned/zoomed Overview restoration, full-film bounds and outer margins, orientation changes, visible live settings, idle-control reveal and keyboard ownership. Imported 120 regressions verify rendered margins for 6×4.5, 6×6, 6×7 and 6×9 while retaining crop, edge, loupe and persistence assertions. Native Chromium touch events cover swipe, anchored pinch, magnified pan, loupe and graphics recovery.

Optical tests read the actual canvas framebuffer; UI visibility checks also capture the whole page, so overlays cannot conceal a failed visibility assertion. Historical tests now open Adjust or the frame chooser through the public UI. Old strip-level navigation assertions were explicitly replaced with Overview/Focus; unrelated photographic and storage checks remain. Historical tracked review captures were preserved and restored after the initial diagnostic run. New binary evidence stays ignored and is not an approved screenshot baseline.

Historical captures of the superseded isolation implementation include:

- [Desktop Focus](../../ignored_generated/m16-table-view/runs/20260913-0455/browser/m16-table-view-M16-opens-a-e0630-view-after-frame-navigation-desktop/focus-1280x800.png)
- [Phone Focus with Adjust open](../../ignored_generated/m16-table-view/runs/20260913-0455/browser/m16-table-view-M16-Focus-k-85ce0-anging-photographic-framing-mobile-chrome/focus-adjust.png)
- [Native touch/loupe recording](../../ignored_generated/m16-table-view/runs/20260913-0455/browser/m15-touch-input-M15-native-e0132-loupe-and-recovers-graphics-mobile-chrome/video.webm)

The desktop capture retains the complete film with visible surround. The phone Adjust capture leaves the complete film visible above the sheet; its settings scroll independently of the photograph.

## Review in the app

Open [the running app](http://localhost:5178/?mode=inspect). The application runs on the remote server and is forwarded to localhost.

1. Pan and zoom Overview, open a frame, move to another frame, then return to Overview. Confirm the table position returns and the last viewed frame remains selected.
2. Judge the default Focus scale: the photograph and complete film border should have deliberate space outside them. Inspect detail, then reset framing.
3. Let secondary controls fade, reveal them, and open Adjust. Change rendering and brightness while watching the photograph. On a phone, scroll within the short settings sheet to reach all adjustments.
4. On physical iPhone/iPad Safari, verify swipe versus magnified pan, loupe placement, orientation, browser safe areas, larger text, and iPad touch/trackpad/keyboard switching. Record device and OS/browser versions with the result.

Physical-device ergonomics, Safari browser chrome and hardware performance are pending. No new deployment, visual-baseline approval or M16 acceptance is implied by this implementation.
