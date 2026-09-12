# iPad review fixes — 2026-09-12

The user reported that Lights/Viewing tools dimmed and froze the scene, settings appeared only after closing the panel, and the touch loupe stayed the same size while the film zoomed. The user also requested removal of Zoom +/-.

- Lights/Viewing tools now has a transparent backdrop and keeps scene rendering active. Scene gestures remain blocked while the modal owns input. Library/frame-chooser dialogs and hidden pages still pause rendering.
- Lighting, stock/mode and loupe settings update while tools remain open. Roll/Strip/Frame buttons now keep the panel open so the resulting framing can be reviewed immediately. Zoom +/- was removed; Fit and touch gestures remain.
- Touch loupe size is calibrated once when activated, then stays fixed in world units so the barrel and optical image scale with the film. The sample stays pinned during two-finger transformations. Placement can move above/below/beside the finger, and reduces an oversized lens only when necessary to keep the lens and sample usable. Desktop loupe behavior is retained.
- WebKit's native select appearance made the film-stock label white on white; explicit select styling restores contrast and a visible arrow.

Validation: production build and all 172 integration tests passed; all seven Chrome/WebKit mobile E2E tests passed in 2.1 minutes. Following the final CSS-only select adjustment, the production build and both live-tools E2E tests passed again (47.6 seconds). No failures, skips or retries. Exact commands are in `validation-command.txt`; source hashes were verified remotely in `source-verification.txt`. This is focused follow-up verification, not a fresh run of the historical 67-browser cumulative gate.

The live-tools test compares actual visible page pixels before/after opening tools (unchanged brightness), then changes room/table light and positive/negative mode without closing tools. It also verifies live level changes and removal of Zoom buttons. Native Chrome two-contact input verifies increased rendered barrel diameter after pinch, with pinned sampling retained. Linux WebKit provides touch-tap/render coverage; physical Safari pinch confirmation remains with the user.

Final WebKit tools and native pinch screenshots were visually inspected. Thirty-five screenshots/recordings are archived with SHA-256 values at shared `ignored_generated/m15-mobile/runs/2026-09-12T07-02-44.070Z-131544/`. `test-results/` contains the seven-test run; `ipad-final/` contains the final select-style checks. Historical candidate images were not modified or promoted.

Preview: refresh http://remote.tail2b1388.ts.net:5196/ on the iPad while connected to Tailscale (fallback http://100.127.56.123:5196/). The updated production build is served on the same origin. The preview returned HTTP 200 from the Mac after the rebuild. Overall M15/device/performance acceptance is still pending; the existing HTTPS prerequisite for import is unchanged.
