# M11 review

Status: **Accepted**. The user accepted the delivered implementation on September 10, 2026 by requesting “commit, then merge to master”. The final production gate passed on September 10, 2026 UTC. M9 was explicitly accepted by the user on September 9, 2026 (America/Los_Angeles).

The 36-slot development fixture repeats the five original photographs. It demonstrates navigation capacity, not 36 unique photographs or their memory cost. The original five-photo viewer remains the default and retains its regression suites.

## Preview

Canonical checkout: `/root/worktrees/codex/41ad/film_photo`, synchronized from `/Users/zhangzimou/.codex/worktrees/41ad/film_photo` by `codex-worktrees-41ad`.

Run the production preview on the remote host on port 5193 after building, and forward that port locally:

```sh
ssh -L 5193:127.0.0.1:5193 root@209.151.144.140 'cd /root/worktrees/codex/41ad/film_photo && npm run preview -- --host 127.0.0.1 --port 5193'
```

Open `http://127.0.0.1:5193/?fixture=36&mode=room` for normal animation. Add `&deterministic=true` for fixed camera captures. The original example is `http://127.0.0.1:5193/?deterministic=true`.

Approach Table enters Whole roll. Click a photograph or a numbered map cell to open it. Strip controls fit one row. Frame Previous/Next crosses strip boundaries; strip Previous/Next changes rows. Whole roll restores the preceding overview pose and selected frame. Escape steps frame → strip → roll → room. Return to Room exits directly. Arrow keys select within the overview grid; Enter opens the selection. Grid edges retain the selected column. The roll map is one Tab stop, and arrow navigation carries map focus to the selected frame. Inputs and buttons keep their native keyboard behavior. Space-drag, right-drag, middle-drag, or primary drag with the loupe resting pans; wheel zoom remains anchored under the pointer. Mode, stock, brightness and loupe magnification are roll-wide.

## Supplying actual photographs

Edit `src/data/localRoll.json` locally and select `?roll=local`. Its `frames` array accepts ordered records with stable unique `id`, one-based `order`, local runtime `src`, `alt`, `title`, and `aspectRatio: 1.5`. Optional `source` names a repository-local source image for asset preparation; optional `thumbnailSrc` names its lightweight derivative. Use sources outside the preserved `photos/roll-01` masters and runtime paths under `/assets/photos/`. Example record:

```json
{"id":"local-frame-01","order":1,"source":"photos/local-roll/01.png","src":"/assets/photos/local-01.jpg","thumbnailSrc":"/assets/photos/local-01.thumb.jpg","alt":"Description of photograph","title":"Photograph title","aspectRatio":1.5}
```

Provide all intended frames; navigation groups them in rows of six and never pads a real roll with repeated images. Asset preparation creates JPEG/384-pixel overview derivatives with no labels or numbering. Runtime missing detail images retain their numbered slot and report a retry control. The application has no upload, library or storage workflow; those remain M12.

## Rendering and resources

Six strips share the existing table, film shaders, stock catalog, and linear illumination. Strip transforms are uniformly scaled to fit the table depth. Physical rebate numbers continue from 1 through 36. Photo areas contain no text or selection masks. The navigator holds selection borders and captions outside its images.

Texture requests use three workers, load lightweight overviews first, and prioritize detail by proximity to the latest selected frame. Repeated URLs share a texture; navigation does not request resident images again. Explicit Retry restarts the roll's texture requests, disposing the prior owned cache. Geometry, rebate textures, photo materials and loupe targets are disposed when replaced/unmounted. The bounded roll keeps loaded viewing derivatives resident; measurements using five sources do not establish performance for 36 unique originals.

## Candidate evidence

- `whole-roll-positive.png` and `animated-overview.png`: all six strips, all 36 slots, no overlays.
- `frame-29-no-overlays.png`: fitted photograph with border and neighboring context; separate thumbnail captions.
- `frame-29-loupe.png`, `frame-30-loupe.png`, `frame-31-loupe.png`: cross-strip detail sampling.
- `strip-6.png`, `overview-restored.png`, and `room.png`: framing levels and room return.
- `m11-interaction.mp4` / `.webm`: 47.16-second real-browser interaction recording, normal animation.
- `m11-keyboard.webm`: final keyboard journey, including grid boundaries and focused map/button navigation.
- `animated-checks.json`: native pointer zoom/pan and restoration assertions, no browser errors; pointer anchor error 0.000189 world units.
- `measurements.json`: all five stocks in allowed modes, photo/rail/perforation and loupe luminance at 30%, 60%, and 100%; five distinct detail URLs and five overview URLs. DOM thumbnail requests may appear repeatedly from the browser cache.
- `grid-boundary-browser.json`: real keyboard checks keep frame 3 selected on Up, frame 33 on Down, and frame 36 on Right.
- `source-hashes.json`: 60 locally computed SHA-256 fingerprints verified in the mapped remote checkout.

The canonical browser is Chrome 152.0.7977.82 with real WebGL through ANGLE/Vulkan SwiftShader at 1280 × 800 (`grid-boundary-browser.json` records the reported renderer). The animated recording ran alongside the cumulative browser tests; its loupe-active frame-time sample was around 100 ms on this shared headless server. This is a measured limitation, not a desktop GPU or 36-unique-photo performance claim.

## Validation

The final cumulative `npm run validate:m11` exited 0: production build, **124 integration tests across 13 files and 33 browser tests**, zero failures, skips or retries. Browser runtime: 15.7 minutes, two workers. All M1–M10 regression suites, M9/M10 combinations, and new M11 cases ran. The exact candidate-output variables and command are in `validation-command.txt`; full output is in `../m11-validation.log`.

The initial cumulative run passed before the grid-boundary correction. A later run was explicitly stopped when the focus correction superseded it; both logs remain identified separately. The final log above covers both keyboard corrections. Existing visual assertions were preserved; the M9/M10 combined suite gained only an optional output-directory override. `historical-capture-restoration.json` records 97 historical files restored exactly after preserving their new outputs under `legacy-output/`. Final captures are isolated under this M11 directory.

The final headless overview frame-time sample was median 166.6 ms / p95 183.3 ms. These software-rendered server measurements and the five-source fixture do not establish hardware-GPU performance or memory use for 36 unique photographs.

Starting Git revision: `f043120`. Implementation and acceptance are committed together on `codex/m11-full-roll-navigation`. This directory is the accepted M11 review reference set; historical screenshot baseline files remain unchanged.
