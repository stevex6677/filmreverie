# Canon Demi EE17 — scoped Tripo corrections

Read [CURRENT.json](CURRENT.json) for the current editable master, full GLB,
browser derivative, checksums and reviewed renders. Authoring paths resolve
against the local main checkout's `ignored_assets/` or `ignored_generated/`;
`browser_glb.published_path` identifies the tracked repository-relative GLB.

The original `tripo/ee17.glb` and the four supplied JPGs are read-only inputs.
Corrections cover the front inscriptions, top finish/controls/visible barrel
markings, underside controls and rear inscription strip. The original mesh
topology and UV0 remain intact; source vertex coordinates are exact outside the
recorded masks. The source texture bytes are retained for all other surfaces.
Separate geometry supplies the missing controls and enamel panels. Hidden
mechanism depths are visual estimates, not measured mechanical specifications.
The main inscriptions use rectified photographic pixels. Small barrel numerals
and the SEIKO signature use an approximate vector typeface conformed to the
barrel; the replacement surfaces are limited to the smooth inscription bands.
The current viewer export is `canon-demi-ee17-compact.glb`: **8,283,892 bytes**,
with all 2,068,411 master triangles retained. It uses embedded JPEG textures
and Draco mesh compression. The top band and straight two-line wordmark now
use `top2.HEIC`. The continuous black ribbon has rounded borders and photographic
fine grain, follows the shoulder, and exposes the silver release seat. Only
intersecting scan vertices directly under the replacement band were lowered;
other controls and surfaces are preserved.
Earlier exports remain historical deliveries; use CURRENT to select the model.

To reproduce this continuation, run `prepare_top2.py` locally, then execute
`correct_top2.py` through local Blender CLI on the preceding packed master,
using a new output directory. Run `export_compact.py`, reopen the corrected
master and run `verify_top2.py` through the local Blender CLI. Run `node verify_viewer.mjs` and
`python3 package_top2.py` locally; publish the browser GLB to tracked
`public/assets/cameras/<id>-<sha256>.glb`, update CURRENT and the catalog
together, then run `python3 package_top2.py --verify`.
The viewer supplies the Draco decoder from its existing Three.js dependency.

## Reproduction

Keep scripts in the active local worktree. Run image preparation and checks with
local Python/Node; launch Blender scripts directly with the local Blender CLI
using `--background` and `--python-exit-code 1 --python`. Preserve
historical run layouts. New runs follow the durable layout in [SHARED_ASSETS.md](../../SHARED_ASSETS.md).

1. Run `inspect_source.py` in a new shared output run. It imports the original
   and saves `source.blend` with its inspection report.
2. Set `FILM_PHOTO_OUTPUT_DIR` to that run and execute `prepare_textures.py`
   locally (NumPy, Pillow, OpenCV).
3. Open `source.blend` with the local Blender CLI and run `refine_camera.py`.
4. Run `render_views.py` on the saved master with `PREFIX='final_'`. Inspect
   front, back, top, bottom and both oblique views against the supplied photos.
5. Run `verify_master.py` and `export_delivery.py` on the saved master. The
   exporter works on copies, reimports the actual compact GLB and renders it.
6. Run `package_delivery.py` locally, publish the selected browser GLB under
   tracked `public/assets/cameras/`, and update CURRENT and the public-relative
   viewer catalog together. Rerun it without `FILM_PHOTO_OUTPUT_DIR` to verify agreement.
7. Verify retained authoring files and published GLB checksums. Commit scripts,
   records and the runtime GLB; keep originals, editable masters, intermediates
   and previews ignored and separately backed up. No asset transfer is required.

The standalone viewer route is `/?model=canon-demi-ee17`. The same compact asset
is mounted in the main Web App cabinet at the owner's specified **116 mm width**
(0.4176 world units). Uniform scaling preserves its height/depth proportions;
the accepted master and GLB are unchanged. The cabinet and inspection views
use a bundled Draco decoder, also included in the offline shell.
