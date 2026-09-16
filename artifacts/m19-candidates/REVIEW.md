# M19 — Film-stock looks and strength

Status: **Awaiting human review.** Implementation and cumulative validation complete; human acceptance pending.

## Result

All five stock choices now grade the photograph, with a single Strength control: 0 bypasses the added treatment, 50 is the default authored rendition, and 100 emphasizes it. Tone/color and deterministic film-surface grain feed the existing positive/negative transmission pipeline once, including in the loupe. Borders, table lighting, source images, crop/rotation and library thumbnails retain their existing responsibilities.

Imported rolls store their own strength, including zero. Older records use 50. Switching stock retains the amount; library edits, reload and format changes preserve it. Source originals are not rewritten. Profile provenance and artistic limits are documented in `public/assets/film-stocks/README.md`; numerical profiles live in `src/data/filmLooks.ts`.

## Validation record

- Local source: Orca worktree `/Users/zhangzimou/orca/workspaces/film_photo/effect`.
- Execution: `/workspace/worktrees/orca/film_photo/effect`, after verifying and flushing `orca-worktrees` (connected, no conflicts).
- Dependencies installed remotely with `npm ci`. Production build and 197 Vitest integration tests passed.
- Focused desktop M19: 3/3 browser tests passed in 59.2 seconds. Covers all stock/view combinations at 0/50/100, zero restoration, border/table stability, responsive slider interaction, loupe response, actual-photo import, all five formats and persistence.
- Initial parallel browser attempt had a Chrome page crash before interaction. An SSH connection ended during a later focused regression run; its partial successes are not a complete gate result.
- First cumulative attempt: 15 passed, 9 failed, 1 interrupted, 95 did not run. It exposed pre-M17 hover-follow assumptions in M1/M10 and an unavailable Next button while the M17 loupe owns interaction in M11. The run was stopped to correct these contracts. The corrected helpers perform real pointer drags and sample the current projected lens center; visual tolerances are unchanged. M11 puts the loupe away to navigate, then reactivates it for inspection. M9's identical-positive-images assertion now runs at strength zero; M19 independently checks the intended stock differences at nonzero strength.
- Second cumulative attempt (`gate-2`): build and 197 integration tests passed; 118/120 browser tests passed in 17.5 minutes, including all 9 M19 cases across desktop Chrome, mobile Chrome and mobile WebKit. The remaining M6 test assumed the pre-M17 2.5× default, and M15 assumed tap-to-pin rather than M17 drag/tap-to-inspect. M6 now explicitly selects 2.5× before its unchanged optical comparison; M15 tests native physical dragging while retaining zoom, barrel-size and context-recovery assertions.
- Both remaining corrected tests passed together (2/2). The next two-worker cumulative attempt (`gate-3`) was interrupted after 40 passed, 3 failed, 2 interrupted and 75 not run. Chrome reported `pthread_create: Resource temporarily unavailable` during the browser-restart test; another page crashed during import. The shared container limits processes/threads to 768. No assertions or visual thresholds were relaxed.
- Fourth cumulative attempt (`gate-4`): 118/120 passed in 17.4 minutes, including all nine M19 cases. The browser-restart launch failed with `EAGAIN` while another worktree ran browser tests. M14 activated the loupe before the saved roll finished reopening; the later roll load reset it. The test now waits for the saved roll ID before interaction and installs its decode-failure hook before reload. The recovery and image-detail assertions are unchanged. Both targeted cases passed together in 15.9 seconds after correction (`final-targeted-2.log`).
- Fifth attempt (`gate-5`): build and 197 integration tests passed, then the browser runner exited with a segmentation fault after four passing cases. This is an incomplete run, not a passing gate. Own preview processes were stopped to free thread capacity before the next run; unrelated services were preserved.
- Final cumulative gate (`gate-6`), revision `e725b94`: **PASS**, exit code **0**. Production build, **197/197 integration tests** and **120/120 browser tests** passed; browser duration 16.9 minutes, no retries or skips. Includes all nine M19 cases on desktop Chrome, mobile Chrome and mobile WebKit. Uses one worker, CPU affinity 0–7 and bounded native thread pools, after focused browser-restart/detail-recovery checks. The complete log and exit code supersede the earlier attempts above.

Reproduce from the mapped remote checkout after flushing `orca-worktrees`:

```bash
taskset -c 0-7 env PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_PORT=5205 \
  RAYON_NUM_THREADS=2 TOKIO_WORKER_THREADS=2 UV_THREADPOOL_SIZE=2 LP_NUM_THREADS=4 \
  bash scripts/validate-m19-review.sh <unique-shared-output-directory>
```

The script invokes `npm run validate:m19` (build, all integration tests, all Playwright projects), routes artifacts to the supplied directory, and records `gate.log` and `exit-code`.

## Evidence locations

Shared generated root: `ignored_generated/film-looks/m19-effect-20260915/` under the main checkout (`/Users/zhangzimou/Projects/film_photo` locally; `/workspace/film_photo` remotely).

- `focused-2/`: passing focused desktop captures, including 390×844, 844×390 and 820×1180 strength controls; positive/negative stock views; loupe inspection; actual imported photographs in every format.
- `gate-1/`: incomplete first cumulative attempt and its failures.
- `gate-2/`: complete 118/120 run; all nine M19 tests passed.
- `corrections.log`: both corrected legacy tests passed.
- `gate-3/`: interrupted two-worker run with browser resource failures.
- `gate-4/`: complete 118/120 run with one browser worker.
- `gate-5/`: incomplete run ending with a segmentation fault.
- `final-targeted.log`, `final-targeted-2.log` and `gate-6/`: targeted checks and final cumulative run.
- `comparison-1/photo-comparison.png` and `comparison-1/strip-comparison.png`: reviewed sheets with five stocks × three strengths, composed from actual `gate-2` desktop captures. JSON companions record inputs and checksums. Regenerate with `node scripts/m19-review-sheet.mjs <Playwright-output> <unique-shared-output>`.

Generated PNGs are review candidates, not approved regression baselines, and are not committed. No video was recorded.

## Private review preview

Application process: remote checkout `/workspace/worktrees/orca/film_photo/effect`, Vite preview on port 5201. Verified HTTP 200 through both [localhost](http://localhost:5201/?mode=inspect) and [MacBook Tailscale](http://macbook:5201/?mode=inspect); mobile devices must be on the same tailnet. Existing services and Serve routes are preserved. This is a review preview, not a public deployment. The server uses two CPU cores/native worker limits because the shared remote container limits total threads.

## Visual review

Reviewed actual desktop captures: Portra 160 at 100 visibly softens color/contrast; Ektar at 100 deepens contrast and enriches blue/yellow colors. Image detail remains visible in the wet pavement, bicycle and wooden wall. E100 at 50 retains clear detail and clean surrounding film. Phone Adjust keeps the photo visible above its scrolling panel; strength is keyboard/pointer accessible. The loupe inspection capture shows continuous image content inside its rim.

For human review:

1. Open Adjust, switch to Positive, compare the five stocks at strength 50 on the same frame.
2. Drag to 0 and 100. Confirm the preferred balance at 50, usable strong settings, and related but distinct Portra looks.
3. Inspect the photograph under the loupe, including a smooth sky and a detailed surface; check texture size and stability.
4. Import a roll, set strength to zero, reopen it, and verify zero persists. Try a stronger amount and a library edit.
5. Check the scrolling Adjust controls and gestures on physical iPhone/iPad Safari.

## Limits

These are artistic film-inspired profiles, not calibrated film/scanner emulation. Existing demonstration images already have strong color treatment and mostly depict dusk/night scenes; their review does not establish behavior across diverse skin tones or daylight foliage. Grain is a procedural approximation. Physical iPhone/iPad Safari review and human acceptance remain pending; browser emulation cannot establish device ergonomics. The production bundle retains Vite's existing large-chunk warning.

Implementation commit: `bf52bd9` (`Add M19 film-stock looks and roll strength control`). Remaining regression-test corrections: `0e35301` (`Align remaining loupe regression checks with M17 interactions`) and `e725b94` (`Wait for saved roll restoration in detail recovery regression`).
