# M19 — Film-stock looks and strength

Status: Implementation delivered; cumulative validation in progress. Human acceptance pending.

## Result

All five stock choices now grade the photograph, with a single Strength control: 0 bypasses the added treatment, 50 is the default authored rendition, and 100 emphasizes it. Tone/color and deterministic film-surface grain feed the existing positive/negative transmission pipeline once, including in the loupe. Borders, table lighting, source images, crop/rotation and library thumbnails retain their existing responsibilities.

Imported rolls store their own strength, including zero. Older records use 50. Switching stock retains the amount; library edits, reload and format changes preserve it. Source originals are not rewritten. Profile provenance and artistic limits are documented in `public/assets/film-stocks/README.md`; numerical profiles live in `src/data/filmLooks.ts`.

## Validation record

- Local source: Orca worktree `/Users/zhangzimou/orca/workspaces/film_photo/effect`.
- Execution: `/workspace/worktrees/orca/film_photo/effect`, after verifying and flushing `orca-worktrees` (connected, no conflicts).
- Dependencies installed remotely with `npm ci`. Production build and 197 Vitest integration tests passed.
- Focused desktop M19: 3/3 browser tests passed in 59.2 seconds. Covers all stock/view combinations at 0/50/100, zero restoration, border/table stability, responsive slider interaction, loupe response, actual-photo import, all five formats and persistence.
- Initial parallel browser attempt had a Chrome page crash before interaction. Subsequent runs use one worker. An SSH connection ended during a later focused regression run; its partial successes are not a complete gate result.
- First cumulative attempt: 15 passed, 9 failed, 1 interrupted, 95 did not run. It exposed pre-M17 hover-follow assumptions in M1/M10 and an unavailable Next button while the M17 loupe owns interaction in M11. The run was stopped to correct these contracts. The corrected helpers perform real pointer drags and sample the current projected lens center; visual tolerances are unchanged. M11 puts the loupe away to navigate, then reactivates it for inspection. M9's identical-positive-images assertion now runs at strength zero; M19 independently checks the intended stock differences at nonzero strength.
- Final cumulative gate: Pending. Run with `bash scripts/validate-m19-review.sh <unique-shared-output-directory>`; this invokes `npm run validate:m19` (build, all integration tests, all Playwright projects), routes artifacts to the supplied directory, and records `gate.log` and `exit-code`. Do not treat a partial log as success.

## Evidence locations

Shared generated root: `ignored_generated/film-looks/m19-effect-20260915/` under the main checkout (`/Users/zhangzimou/Projects/film_photo` locally; `/workspace/film_photo` remotely).

- `focused-2/`: passing focused desktop captures, including 390×844, 844×390 and 820×1180 strength controls; positive/negative stock views; loupe inspection; actual imported photographs in every format.
- `gate-1/`: incomplete first cumulative attempt and its failures.
- `gate-2/`: current cumulative attempt.
- Comparison sheets: Pending. Generate from completed desktop captures with `node scripts/m19-review-sheet.mjs <Playwright-output> <unique-shared-output>`.

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

Commit evidence: Pending.
