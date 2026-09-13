# M15 iPhone and iPad touch experience

Latest acceptance (2026-09-13 UTC): the user explicitly requested that all milestones preceding M16 be marked done. M15, including this review revision, is completed and accepted. This supersedes historical pending approval below and does not claim additional physical-device testing.

Status: Awaiting human review. Implementation and the full automated gate passed. Physical iPhone/iPad Safari review, performance profiling and human acceptance remain pending. M1–M14 were explicitly accepted by the user on 2026-09-11.

2026-09-12 iPad follow-up: the user reported dimmed/frozen tools previews and fixed-size touch loupe behavior. These were revised, and Zoom +/- was removed from Viewing tools. The full gate below is historical evidence for `66cb870`; see `../m15-ipad-feedback/` for the follow-up revision and focused verification. Tools now render live without a dimming backdrop; import and frame-chooser dialogs still pause rendering.

Source: Codex worktree `5de95a8d-70dd-42f4-b72e-a8f17b2560d6`, base `e5850e0`. Local files are authoritative; builds and tests run in `/root/worktrees/codex/5de95a8d-70dd-42f4-b72e-a8f17b2560d6/film_photo` after flushing the connected, conflict-free `codex-worktrees-5de95a8d-70dd-42f4-b72e-a8f17b2560d6` Mutagen session.

## Changes

- One touch owner classifies taps, double taps, fitted-frame swipes, magnified-frame pans, and centroid-anchored pinch/pan. Multiple contacts cancel tap/swipe ownership; cancellation clears capture and delayed actions. Inspection can be interrupted from its rendered pose; room journeys retain their guards.
- Touch loupe sample and display positions are independent. The lens sits above/below the contact, stays within the canvas and leaves a sampling marker. Two-finger transformations retain the sampled world position; offscreen samples hide the lens until repositioned. Mouse input restores the desktop loupe behavior.
- Phone header and bottom navigation surround the actual measured canvas. Tools and frame chooser use native modal dialogs. Wide tablet sheets sit beside the scene; narrower windows use compact layouts. Safe areas, the visual viewport, orientation changes, 44px controls, Focus, and keyboard alternatives are included.
- Import/review uses full-screen phone pages and a scrollable contact strip, crop dragging/sliders, explicit reorder/rotation actions, and sticky save controls. JPEG/PNG bytes remain unchanged. Native-decodable HEIC can be converted locally to JPEG, capped at 4096px and 12 MP; unsupported HEIC gives Shortcuts conversion guidance and retains the draft. No third-party decoder, upload, or HEIC original archive is added.
- WebKit reproduced an IndexedDB Blob preparation failure that left saving unsettled. Image records now store binary bytes plus MIME in the same object store/key structure; the repository reads both old Blob records and new binary records, with no database upgrade or rewriting of existing records. Save preparation is serial and abortable, followed by one atomic transaction. Optional persistent-storage requests do not block opening a saved roll.
- Rendering pauses while hidden or a dialog owns input. Context loss exposes Restore view without dropping selection or persisted rolls. Existing bounds remain: DPR ≤1.5, 768px loupe render target, 192 MiB estimated photo texture residency, maximum 4096px detail. These are budgets, not measured total iOS memory. Save serialization can temporarily retain compressed binary data up to the draft's 300 MB source limit plus derivatives; physical-device profiling is still required.

## Automated evidence

Browsers: Chrome 152.0.7977.82 and Playwright WebKit 26.6 on Linux. These are automation browser versions, not physical Safari/OS versions. Chrome and WebKit both passed seven viewport layouts (375×667, 390×844, 667×375, 844×390, 820×1180, 1180×820, 540×820), visible film pixel checks, controls, modal keyboard ownership, and Focus/resize framing. Both browsers passed import → append → reorder → crop → save → reload → cancelled edit. Native Chrome multi-touch passed cross-strip navigation, pinch, magnified pan, offset loupe sampling, pinned sample, and graphics recovery.

Initial cumulative `npm run validate:m15`: build and 171 integration tests passed; 65/67 browser tests passed in 16.2 minutes. The two failures exposed a missing aspect-mismatch crop hint and an obsolete thumbnail assertion that measured the rotated image beyond its clipping viewport. The hint was restored. The test now checks loaded content, a nonzero visible crop, active clipping, and separation from its caption. A rendered screenshot confirms the layout; optical checks and screenshot baselines were preserved. Both affected tests then passed against a rebuilt application (2/2, 29.3 seconds). `validation-initial.log` retains the first run, while `validation.log` records the final run below.

Final cumulative gate: **PASS** — production build, **171 integration tests across 20 files**, and **67 browser tests in 16.1 minutes**; zero failures, skips or retries. `validation.log` is the completed final run. Source checksums were verified on the remote tested checkout (`source-verification.txt`), and no application/test source changed during the final gate. The production bundle retains a non-fatal Vite chunk-size warning (about 299 KB gzip); physical cold-load performance remains part of device review.

Final phone portrait/landscape, tablet, mobile crop review and touch loupe screenshots were visually inspected. Captures and recordings (368 files including historical-suite outputs) are preserved with SHA-256 values under shared `ignored_generated/m15-mobile/runs/2026-09-12T06-36-33.386Z-112006/`. On the Mac this is `/Users/zhangzimou/Projects/film_photo/ignored_generated/m15-mobile/runs/2026-09-12T06-36-33.386Z-112006/`; the remote equivalent is under `/root/projects/film_photo/`. The run's `manifest.json` maps all files and checksums. Historical tracked candidates were restored after archiving; no binary baselines were promoted.

Native multi-touch uses Chrome's `Input.dispatchTouchEvent` protocol with actual touch contacts. WebKit covers real WebGL, touch taps and UI flows; Playwright's WebKit project cannot supply this test's CDP multi-touch protocol, so the distinct Chrome-only multi-touch suite does not pretend to establish Safari pinch coverage. No synthetic scene state mutations are used for navigation; context loss is an explicit injected fault.

## Device review still required

- Record one actual iPhone and one actual iPad model, stable OS/Safari version, and available viewport sizes.
- Check room dragging, single/double taps, 6→7 swipes, pinch at off-center details, pan after pinch, finger release/cancellation, Fit, and loupe sampling at edges.
- Check Safari toolbar changes, portrait/landscape, narrow iPad windows, larger text/VoiceOver, keyboard-open forms and native list scrolling.
- Use Photos and Files pickers, including a system-converted JPEG and native HEIC when available; verify fallback, append, crop persistence, and cancelled edits.
- Profile warmed pan/pinch and repeated unique-photo navigation: target ≥30fps and no repeatable preloaded-navigation stalls above 250ms. Record cold decode separately, memory observations, and background/foreground behavior. Remote software rendering cannot establish these results.

Private preview requires Tailscale. The verified server is `remote.tail2b1388.ts.net` / `100.127.56.123`. HTTPS certificates are currently unavailable on the tailnet; the user has been asked to enable them. HTTP can review built-in photographs, but secure-context import cannot be accepted through HTTP. No public deployment or tunnel is used.

## Review route and results to record

1. Open `http://remote.tail2b1388.ts.net:5196/?fixture=36` while connected to Tailscale (IP fallback: `http://100.127.56.123:5196/?fixture=36`). Drag the room, approach the table, choose frame 6 and swipe to frame 7. Choose frame 36 and verify navigation stays at the end.
2. Pinch around an off-center detail, pan, double-tap and use Fit. Activate Loupe, move it to each edge, lift, then use two fingers. Confirm the sample remains pinned and the lens avoids the finger and controls. Check mouse/keyboard after touch on iPad.
3. Rotate at a magnified detail, expand/collapse Tools, use Focus and resize an iPad window. Exercise larger text/VoiceOver and background/foreground. Record any jump, overlap, stuck contact or blank frame.
4. After private HTTPS is available, import from Photos and Files. Append another batch, reorder, rotate, drag a crop, save, reload and cancel a later edit. Record what representation the picker supplies; native HEIC capability is pending until tested on device. Unsupported HEIC should leave the existing draft usable and explain the JPEG conversion fallback.
5. Use a roll of unique photographs for performance review. Record device/OS/Safari, frame count/source sizes, cold-decode duration, warmed pan/pinch frame times, navigation stalls, memory observations and a recording. Target ≥30 fps and no repeatable preloaded-navigation stalls above 250 ms. Record observed results rather than inferring from remote renderer timing.

| Required observation | iPhone | iPad |
| --- | --- | --- |
| Model, OS/Safari and viewport | Pending | Pending |
| Native gesture and loupe review | Pending | Pending |
| Toolbars, safe areas, keyboard, VoiceOver | Pending | Pending |
| Photos/Files and native conversion | Pending | Pending |
| Warmed frame times, stalls and memory | Pending | Pending |
| Human acceptance | Pending | Pending |
