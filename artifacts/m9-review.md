# M9 — five film stocks (review candidate)

M9 adds whole-strip stock selection. Portra 400 starts in negative view. Ektar 100 and Portra 160/400/800 offer negative and positive preview; the border stays orange in either view. Ektachrome E100 is positive-only, including the M shortcut. Stock changes retain the selected frame, loupe position/magnification, camera pose, pan, zoom and dimmer setting.

The same five positive photo masters remain in use, without stock-specific photographic grading. The existing scene-capture loupe samples the selected strip directly. The stock selector supports native keyboard operation, and global shortcuts ignore a focused selector.

## Validation

Full production gate: **passed**, exit code 0 — `PLAYWRIGHT_PORT=5189 npm run validate:m9 -- -- --workers=1`. All **99 integration tests across 11 files** and **13 Chrome E2E tests** passed (18.9m for E2E), with zero failures, zero skips and no Playwright retries. [Full output](m9-validation.log). Status: **Awaiting human review**. Base checkout: `956092b`, isolated local worktree `58a8/film_photo`. Remote mapping: `codex-film-photo-58a8`, `/root/worktrees/codex/58a8/film_photo` on the user-approved host. The test server uses a dedicated loopback port to avoid the existing preview on 5178.

Earlier cumulative attempts are retained in [development log 1](m9-validation-attempt-1.log) and [development log 2](m9-validation-attempt-2.log). The new macro test was corrected to wait for real photo rendering before input and for each zoom update, include the stock number in the lens comparison, and measure the whole photo interior on room return. No existing E2E assertions were weakened. A [third run](m9-validation-attempt-3.log) hit the unchanged M2 180-second timeout under shared-server load and was interrupted; the final cumulative gate uses one browser worker with identical assertions and timeouts. The corrected macro journey also passed independently in the mapped remote Chrome environment before the final gate.

Browser: Google Chrome 152.0.7977.82, real WebGL, headless desktop 1280 × 800, no E2E rendering mocks or retries.

[Watch the 45-second interaction recording](m9-candidates/m9-short-review.mp4) ([WebM](m9-candidates/m9-short-review.webm)). Recorded at normal speed in local Google Chrome 152.0.7977.83, 1280 × 800, with zero console/page errors. It demonstrates all five stocks, negative-stock previews, E100's M shortcut restriction, stock lettering through the loupe and room return.

Source fingerprint (SHA-256 over sorted source/test/profile/config hashes), verified identical locally and remotely: `4c95930a047c3544b8ae305d992478b5c91507da0ac82dccaf366cf30622c4ba`.

## Stock comparison candidates

Open the reference link and compare its developed-film lettering, rails and border with the macro capture. All captures are candidates; none have been promoted to regression baselines.

| Stock | Full strip | Positive preview | Macro edge | Loupe | Reference |
| --- | --- | --- | --- | --- | --- |
| Ektachrome E100 | [Positive](m9-candidates/ektachrome-e100-positive.png) | Positive-only | [Edge](m9-candidates/ektachrome-e100-macro-edge.png) | [Loupe](m9-candidates/ektachrome-e100-macro-loupe.png) | [Clément Blin](https://www.clementblin.net/blog-de-photographie-nature-conseil-et-technique/2021/6/21/dvelopper-des-diapositives-en-e6-soi-meme-) |
| Ektar 100 | [Negative](m9-candidates/ektar-100-negative.png) | [Preview](m9-candidates/ektar-100-positive-preview.png) | [Edge](m9-candidates/ektar-100-macro-edge.png) | [Loupe](m9-candidates/ektar-100-macro-loupe.png) | [Hubert Sieminski](https://commons.wikimedia.org/wiki/File:Color_print_film_strip_01_-_negative.jpg) |
| Portra 160 | [Negative](m9-candidates/portra-160-negative.png) | [Preview](m9-candidates/portra-160-positive-preview.png) | [Edge](m9-candidates/portra-160-macro-edge.png) | [Loupe](m9-candidates/portra-160-macro-loupe.png) | [Eric-René Penoy](https://www.ericrenepenoy.com/best-wedding-16mm-videographer-thailand) |
| Portra 400 | [Negative](m9-candidates/portra-400-negative.png) | [Preview](m9-candidates/portra-400-positive-preview.png) | [Edge](m9-candidates/portra-400-macro-edge.png) | [Loupe](m9-candidates/portra-400-macro-loupe.png) | [Take It Easy Lab](https://takeiteasylab.com/collections/colour-film-developing) |
| Portra 800 | [Negative](m9-candidates/portra-800-negative.png) | [Preview](m9-candidates/portra-800-positive-preview.png) | [Edge](m9-candidates/portra-800-macro-edge.png) | [Loupe](m9-candidates/portra-800-macro-loupe.png) | [Analog.Cafe](https://www.analog.cafe/r/all-the-iso-800-colour-films-compared-b5eu) |

The overview/preview comparisons use 100% table brightness. Macro/loupe comparisons use 31%, approximately 290% table zoom and 2× loupe magnification. The rapid-switch check uses 4× magnification.

## Local preview

From this worktree, run:

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 5198
```

Open [the inspection view](http://127.0.0.1:5198/?deterministic=true&mode=inspect) or [the room](http://127.0.0.1:5198/). The test gate can be rerun with `PLAYWRIGHT_PORT=5189 npm run validate:m9 -- -- --workers=1` in the mapped remote checkout after `mutagen sync flush codex-film-photo-58a8` on the local machine. A sibling M10 suite, if later added, is automatically included because the gate runs all integration and E2E files.

For review, select each stock, toggle both views of the negatives, then select E100 and press M. Zoom with the wheel, drag to pan, activate the loupe, and inspect the edge lettering. Switch stocks with the loupe active, then return to the room and approach again.

## Reference and scope limitations

The local [reference notes](../public/assets/film-stocks/README.md) and five profile JSON files identify the editions, reference URLs and approximations. All runtime artwork is original local canvas artwork; source reference photographs are linked only, never bundled.

Exact optical edge-code bits and batch IDs could not be verified. The four negative stocks therefore omit those code tracks instead of retaining fabricated decorative barcodes. E100's selected reference has no discernible code track. Font, registration and physical base colors are approximations; this is not an exact manufacturer facsimile. Frame numbers are normalized to this viewer's five frames.

M10's light-transmission/dimmer changes are outside this assignment. M7/M8's historical acceptance wording is preserved without asserting new approval.

The M5 integration assertion for a bronze border in positive preview was intentionally replaced with the M9 requirement: negative-stock borders stay orange and reversal borders are dark. Other pre-existing integration/E2E assertions remain intact. Historical screenshot files are preserved byte-for-byte; new regression captures are separate candidates.

Human approval: **pending**.
