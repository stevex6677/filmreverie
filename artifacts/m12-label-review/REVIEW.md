# Edge-lettering sharpness correction

Status: validation passed; awaiting human review.

The old 6144×936 whole-strip texture spent most of its pixels on transparent photo openings. On 120 film, the 1.3mm lettering was only about 20 pixels high before minification/filtering and zoom. The texture also had very different horizontal and vertical sampling densities with no anisotropic filtering.

The new 8192×512 atlas contains only the two edge rails, rasterized directly from the original canvas drawing. Each rail gets 256 pixels vertically (about 133 pixels for 120's 1.3mm font). The shader maps the rails back to their physical positions and computes the regular photo openings directly. The calculated openings have a 0.05mm inset so the photo meshes overlap the rebate, preventing a subpixel light-table leak at the gate. Stock names, font size, numbering, polarity, base colors, and original photographs are preserved. Filtering uses up to 8× anisotropy, bounded by GPU capability; atlas width is also bounded by the GPU's maximum texture size. Total base texture pixels decrease from 5,750,784 to 4,194,304 per strip. Existing disposal still releases each replaced texture/material.

`scripts/review-m12-labels.mjs` records identical E100 scenes before and after. Compare `before/120-border-loupe.png` and `after/120-border-loupe.png`, or the whole-strip captures. The generic recorder filenames containing “negative” do not describe E100's mode: every E100 capture is positive. These use three bundled source photographs in an isolated browser, not the user's imported photographs. Both recordings reported zero page errors.

The production build and all 139 integration tests across 15 files passed. A new actual-canvas test verifies more than 4× the rasterized text-row detail, upper/lower ink, lower pixel allocation, and a 4096px GPU texture limit. Browser validation covers all four 120 formats, cropping and seams at every rotation, stock/view switching, macro lettering, the dimmer/loupe, and the previously fixed uniform panel. The full browser suite is not being repeated for this focused change.

The preceding uncommitted panel-background fix remains included. No commit or human acceptance is claimed here. [Preview](http://127.0.0.1:5193/?mode=inspect): reload to load the corrected lettering.

The first targeted browser run found the gate leak described above; the corrected crop regression passed afterward. That run also lost one video artifact because another Playwright run cleaned its shared output directory. The final combined run is sequential to avoid that artifact collision. The initial log is retained as `browser-validation-before-edge-correction.log`.

Final validation: production build and 139 integration tests passed after the aperture correction. All 11 targeted browser tests passed in the final combined run, including both stock tests and their video artifacts. Final E100 screenshots were regenerated after the correction, with zero page errors. See `build-integration-edge-check.log`, `browser-validation.log`, and `source-sha256.txt`.
