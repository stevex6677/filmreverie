# Hybrid v2 — rear lettering and coated optical refinement

The accepted v2 remains unchanged. The revised editable master and inspection
renders are in the shared main checkout:

`ignored_generated/blender/mamiya_universal/hybrid/v2/refinement/runs/20260912T053159Z-dc8b8e89/`

- `mamiya_universal_hybrid_v2_refined.blend`: packed textures, editable lettering,
  separate glass elements, iris, tube and smooth memo frame.
- `rear_detail.png`: 1600 px, 96 samples.
- `optical_detail.png`: 1600 px, 96 samples.
- `front_overview.png`: 1400 px, 64 samples.
- `refinement-manifest.json` and `refinement-validation.json`: source/script/output
  hashes, settings and geometry checks.

Rear maker, film-back markings and memo text use clean font outlines. Local
copies of the PBR atlas remove the old generated letters; the original relief is
flattened to surfaces fitted from the surrounding metal. The memo frame has
five-segment bevels and a separate paper insert. Small memo copy is a readable
reconstruction, not a transcription of the damaged original label.

The original opaque front disk is masked non-destructively. Three closed curved
glass elements have IORs of 1.52 / 1.62 / 1.52, full transmission, air gaps and
thin-film thicknesses of 390 / 270 / 470 nm. A ten-leaf open iris, retaining rings,
internal tube and recessed dark chamber provide visible depth. Two softboxes
linked to the optical collection provide distinct coating reflections without
changing the body lighting.

Use **Cycles / Rendered** mode for the intended refractive and thin-film result.
Solid or Material Preview modes do not reproduce this render. This is a visual
optical reconstruction, not the measured prescription of the actual lens. The
closed camera body remains behind the transparent optics. No revised GLB was
exported; the accepted v2 GLB still represents the earlier model.

## Reproduction

Use the local Blender CLI with `--background` and `--python-exit-code 1 --python`
from the active checkout. For scripts accepting globals, use the driver example
in [SHARED_ASSETS.md](../../../../SHARED_ASSETS.md).

1. Open the accepted shared `hybrid/v2/mamiya_universal_hybrid_v2.blend` and run
   `refine_optics_labels.py`. It allocates a new unique output run.
2. Open that run's master and run `render_refinement.py` with `VIEW` set to
   `rear_detail`, `optical_detail`, `optical_axial`, `front_overview` or
   `rear_overview`. `RESOLUTION` and `SAMPLES` are optional overrides.
3. In a fresh process run `validate_refinement.py`. It checks positive closed
   glass volumes, full transmission, readable text bounds, packed image resources
   and the accepted source checksum. It also records render checksums.
4. Inspect the resulting media in the local main checkout's shared output run.

For final renders, run `render_refinement_delivery.py` with the local Blender CLI,
loading the saved master and using the active checkout as `cwd`. It renders
sequentially, writes `delivery-progress.json`, and runs validation after all
images finish. Keep its log in the same output run and wait for process completion.

All binary outputs remain ignored. The original source import and accepted v2
master are preserved, as are unrelated hood, barrel and leatherette details.
