# V2.3 black body finish

Matches the camera shell, film-back housings, nameplate and memo frame to the
accepted V2.2 lens black. Leatherette uses a separate nonmetallic black material
with its original texture normal and mapped roughness. Shell normals are reduced
to avoid amplifying baked surface noise. The color atlas is desaturated and
remapped into a narrow black reflectance range, removing the brown/gray cast.
Leather luminance is scaled proportionally to retain fine atlas contrast, with a
vertex attribute feathering the transition to the metal shader.

The front finder windows, winding knobs, accessory shoe tops, lens assembly,
inscriptions and memo paper are preserved. The base mesh is copied and its
material assignment edited; source images and the original comparison scene are
not edited. Previous Blender files are retained.

Input shared path:
`blender/mamiya_universal/hybrid/v2/lens_finish/runs/20260912T061213Z-cc646076/mamiya_universal_hybrid_v2_lens_finish.blend`

Final shared output directory:
`blender/mamiya_universal/hybrid/v2/black_body/runs/20260912T065312Z-d80c8ba1/`

- `mamiya_universal_hybrid_v2_black_body.blend`: packed master, front camera selected.
- `front_overview.png`, `rear_overview.png`: 1400 px, Cycles, 96 samples.
- `black-body-manifest.json`: source hash, preserved lens parameters and labels.
- `black-body-validation.json`: saved master verification and rendered file hashes.

Run `match_black_body.py` with the local Blender CLI using `--background`, the
input master and `--python-exit-code 1 --python` with the script path in the active
checkout. It allocates a
unique shared output run. Run `render_black_body_delivery.py` on the resulting
master in a fresh local Blender CLI process using the same flags. Review the saved
renders directly; no synchronization or remote transfer is required.

Initial preview runs remain available but are superseded by the final run above.
Binary outputs are ignored and must not be added to Git.
