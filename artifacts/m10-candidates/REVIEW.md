# M10 review candidates

M10 implements one shared light-table output for the panel, photographic transmission, rebate and nearby bounce lights. Film density is computed before illumination; the camera exposure remains fixed. Perforations are real cutouts revealing the dimmable diffuser. A small diffuser-edge scattering effect is bounded to 7 cm with a maximum 10% scattering weight, with no fullscreen bloom pass.

The loupe captures linear HDR scene light in a 768 × 768 half-float target. The panel shader applies film contact attenuation directly to its linear radiance; the edge shader composes scattered light with the dark chassis surface before display conversion. These opaque optical surfaces and the lens each apply ACES/sRGB conversion once, so shadows and holes agree inside and outside the loupe. Capture restores renderer state and visibility even on failure. The existing dimmer range, keyboard cycle, navigation and reset semantics remain unchanged. M9 is absent; no stock selector or stock dependency was added.

## Checkout and validation

- Base commit: `956092bc340f420866766c3e8effda91ca8557f3` (standalone M10 validation base).
- Local checkout: `/Users/zhangzimou/.codex/worktrees/57bd/film_photo`.
- Remote checkout: `/root/worktrees/codex/57bd/film_photo` on the user-approved existing project host.
- Mutagen: `codex-film-m10-57bd`, flushed before the gate.
- Gate: `PLAYWRIGHT_PORT=5181 npm run validate:m10` in the remote checkout.
- Result: **PASS**, exit 0 on 2026-09-09 UTC. Production build and TypeScript check passed; 100/100 integration tests in 11 files and 22/22 E2E tests passed, with zero failures, skips or retries. The cumulative browser run took 23.4 minutes and includes every M1–M8 regression. See `validation.log`. The existing Vite warning about a JavaScript chunk over 500 kB remains.
- Source identity: all 45 source/test/configuration hashes in `source-sha256.json` matched between local and remote checkouts.
- Review status: **Accepted for merge** by the user’s “commit, then merge to master” instruction. Candidate captures remain separate from historical baselines.

## Preview

From the local checkout, run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 5182`. Open [the inspection view](http://127.0.0.1:5182/?deterministic=true&mode=inspect) or [the room](http://127.0.0.1:5182/).

Compare `negative-30.png`, `negative-60.png`, `negative-100.png` and their positive counterparts. The `loupe-*` captures cover photos, rebate, holes and bare table in both modes at 30% and 100%, with 1.5×, 2.5×, 4×, 8× and 10× magnification. `dimmer-review.webm` is the 31-second local hardware-rendered slider, macro pan and room-return recording. `dimmer-interaction.webm` retains the canonical software-rendered dimmer recording. JSON files contain luminance, optical comparisons, browser identity and frame-time samples.

## Measured illumination

Representative canonical canvas regions, luminance on a 0–255 scale. Photo values sample the bicycle frame; full variance/clipping checks cover all five photos.

| Region | 30% | 60% | 100% |
|---|---:|---:|---:|
| Panel | 137.9 | 220.1 | 244.0 |
| Perforation | 131.8 | 217.0 | 243.0 |
| Negative photo | 59.2 | 139.6 | 201.8 |
| Positive photo | 11.7 | 26.5 | 51.6 |
| Negative rebate | 37.2 | 95.1 | 159.6 |
| Positive rebate | 7.2 | 12.0 | 22.3 |
| Local bench spill | 0.8 | 2.9 | 8.5 |

All 80 source/loupe comparisons passed. Maximum observed channel difference: **7.56/255**, against the predeclared limit of 16/255.

## Acceptance checks

- Panel and holes rise by at least 10 luminance levels between 30%, 60% and 100%; photos by 5, rebate by 2, and local bench spill by 1.
- The 100% panel exceeds 240/255 and the 30% panel stays below 175/255. Photo regions retain variance, fewer than 8% clipped pixels, and remain darker than the panel.
- Across 48,000 sampled photo pixels per brightness step, fewer than 0.1% may darken by more than two luminance levels.
- Loupe optical-center colors stay within 16/255 per channel of their source, excluding intentional rim vignette/reflection and allowing subpixel sampling differences.
- Macro zoom, pan and room return work at both dimmer extremes; the full earlier regression suite remains required.

Existing M1–M8 visual assertions are retained. Their new captures go in `regressions/`, leaving historical files untouched. No screenshot has been approved or promoted to a baseline. New checks replace no old assertions; the added loupe test compares nine-pixel center regions, M10 replaces the old pre-inversion exposure formula, fixed white hole patches and sRGB loupe capture.

## Limitations

The dimmer is an artistic control, not calibrated monitor luminance. Nearby illumination uses three finite-range point lights, not ray-traced area-light transport. The generic negative transfer is a density approximation; the original five PNG masters are unchanged. The fixed surface-reflection contribution prevents the dimmer from crushing the darkest positive regions. The half-float loupe capture uses approximately 4.5 MiB of color storage instead of 4 MiB. Its 768-pixel width exceeds the roughly 522 source texels under the lens at the lowest magnification. The main scene retains its existing antialiased renderer. Panel shading incorporates contact attenuation directly, with no extra fullscreen render target or post-processing pass; 80 white backing meshes and two separate shadow planes were removed. Final-build local measurements with the loupe over a photo (180 frame intervals per brightness extreme): median 16.7 ms, p95 16.8 ms at both 30% and 100%; screenshot readback 0.28–0.34 s. See `local-rendering-cost.json`. The canonical host uses real Chrome/WebGL through software SwiftShader; local review uses Chrome through ANGLE Metal on Intel Iris Plus 650. Canonical software-rendered frame times (median / p95, ms): negative 30% 466.6 / 600.0; negative 100% 316.7 / 400.0; positive 30% 299.9 / 366.6; positive 100% 300.0 / 383.3. These runs include video recording and shared-host CPU contention. They are unsuitable as a hardware interaction-speed benchmark; both raw software and hardware samples are retained. Browser frame times are observations, not hardware-independent performance guarantees.

The user authorized committing and merging M10 on 2026-09-08 (America/Los_Angeles).
