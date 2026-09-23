# Canon Demi EE17 — scoped Tripo corrections

Read [CURRENT.json](CURRENT.json) for the current editable master, full GLB,
browser derivative, checksums and reviewed renders. Paths resolve against the
main checkout's shared `ignored_assets/` or `ignored_generated/` directory.

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

To reproduce this continuation, run `prepare_top2.py` remotely, then execute
`correct_top2.py` through Blender MCP on the preceding packed master, using a
new output directory. Run `export_compact.py`, reopen the corrected master and
run `verify_top2.py` through MCP. Run `verify_viewer.mjs` and `package_top2.py`
through `remote_exec run`; update CURRENT and the catalog together, then
`package_top2.py --verify`.
The viewer supplies the Draco decoder from its existing Three.js dependency.

## Reproduction

Keep scripts in the active local worktree. Run image preparation and checks with
`remote_exec run`; launch Blender scripts through Blender MCP in a background
child process so scene resets do not stop the interactive MCP server.

1. Run `inspect_source.py` in a new shared output run. It imports the original
   and saves `source.blend` with its inspection report.
2. Set `FILM_PHOTO_OUTPUT_DIR` to that run and execute `prepare_textures.py`
   remotely (NumPy, Pillow, OpenCV).
3. Open `source.blend` in the MCP-launched child and run `refine_camera.py`.
4. Run `render_views.py` on the saved master with `PREFIX='final_'`. Inspect
   front, back, top, bottom and both oblique views against the supplied photos.
5. Run `verify_master.py` and `export_delivery.py` on the saved master. The
   exporter works on copies, reimports the actual compact GLB and renders it.
6. Run `package_delivery.py` remotely, update CURRENT and the viewer catalog
   together, then rerun it without `FILM_PHOTO_OUTPUT_DIR` to verify agreement.
7. Fetch the generated files with checksums into the main checkout. Commit the
   scripts and records only; never commit the generated binaries.

The standalone viewer route is `/?model=canon-demi-ee17`. The same compact asset
is mounted in the main Web App cabinet at the owner's specified **116 mm width**
(0.4176 world units). Uniform scaling preserves its height/depth proportions;
the accepted master and GLB are unchanged. The cabinet and inspection views
use a bundled Draco decoder, also included in the offline shell.
