# Hybrid v2 — smooth lens finish and revised glass

Final output is in the shared main checkout:

`ignored_generated/blender/mamiya_universal/hybrid/v2/lens_finish/runs/20260912T061213Z-cc646076/`

The input is the previously delivered lettering revision in
`hybrid/v2/refinement/runs/20260912T053159Z-dc8b8e89/`. The approved rear lettering
and memo frame are retained.

## Lens changes

- Rebuilt the front housing, conical inscription bezel, vented hood, barrel
  shoulders and circular retainers with smooth rotational geometry, small bevels
  and stable normals. New anodized-aluminum materials have no image, bump or
  normal-map input. The old scanned front shell is masked, not destroyed.
- Replaced irregular grip relief with controlled, shallow machined fluting.
  Separate mechanical levers and knobs remain. Front lettering is projected onto
  the rebuilt conical face; barrel scales are clean font objects.
- Replaced the large fan of iris blades with a recessed, nearly open pupil.
  Three closed meniscus groups retain full physical transmission, clear base
  color and thin-film coatings (135 / 230 / 330 nm). Glass is not emissive.
- Disabled the previous two rectangular optical lights. Feathered neutral
  diffuser cards produce a broad fill and one main glazing reflection; color
  comes from the glass coatings. This is an artistic studio setup, not a measured
  reconstruction of the original photographing room.
- Excluded the studio shadow floor from glossy and transmission rays to remove
  its sharp horizon inside the glass. It still receives shadows and remains
  visible to the camera.

The source photos `IMG_1978`, `IMG_1980`, `IMG_1982` and the assembled-camera
reference previews were inspected for smooth hood/ring construction. The optical
prescription and barrel markings are visual reconstructions, not measured CAD.

## Deliverables

- `mamiya_universal_hybrid_v2_lens_finish.blend`: editable master, packed textures.
- `lens_detail.png`: 1400 px, 96 samples.
- `lens_axial.png`: 1100 px, 96 samples; checks the straight-on reflection pattern.
- `front_overview.png`: 1400 px, 64 samples.
- `lens-finish-manifest.json`, `lens-finish-validation.json`: input, script and
  render hashes; closed positive glass volumes, transmission and image checks.

Use Cycles for the thin-film/refraction appearance. No replacement GLB is produced
by this revision. All model and render binaries stay in shared ignored storage.

## Reproduction

With the local Blender CLI, load the input `.blend` using `--background` and run
`rebuild_lens_finish.py` using `--python-exit-code 1 --python` from the active
checkout. It allocates a new unique output folder and preserves the
input checksum. Preserve historical runs when reproducing this revision.

Run the local Blender CLI with `--background`, the new master and
`--python-exit-code 1 --python render_lens_finish_delivery.py`, using the script
path in the active checkout. Wait for the sequential renders to finish. The script
writes `delivery-progress.json`, then validates the
saved geometry/materials and records render checksums. Outputs are already in
the local main checkout's shared generated storage; no transfer is required.
