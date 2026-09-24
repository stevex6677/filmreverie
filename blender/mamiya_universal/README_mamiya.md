# Mamiya Universal camera model

For the **latest delivered model**, read [CURRENT.json](CURRENT.json). It records
the editable `.blend`, scene, browser GLB, renders and instructions for continuing
work. Resolve asset paths using the repository's `shared-assets.json`.

## Historical procedural model — 2026-09-09

The following describes the earlier procedural version, not the current hybrid.
Open **`mamiya_universal_refined.blend`** for this historical model and select the
**Mamiya Universal | Studio** scene. `mamiya_universal.blend` is the preserved previous master.
The original startup scene is preserved separately.

The model was constructed through Blender MCP from fourteen local reference
photos, `mamiya_universal_photos/IMG_1964.HEIC` through `IMG_1977.HEIC`.
JPEG inspection copies are in `reference_previews/`; the original photos are unchanged.

The camera has separate collections for the body, rangefinder, 100 mm f/2.8 lens,
6×9 roll-film back, strap, and studio. Its geometry includes the front finder
windows, cold shoe, rear eyecup, lens rings and markings, vented hood, film
chambers, memo clip, latch, ASA dial, and strap. Leatherette and nylon use
procedural materials. Model dimensions use meters internally with millimeter
display units. Proportions are estimated from the photos, not measured CAD.
Internal camera mechanisms are simplified; this is a static visual model.

Five named cameras provide front/rear three-quarter, elevation, and detail views.
Hide collection `06 Studio` to work with just the camera model.
The master empty parents the model components for moving the entire camera.

Outputs:

- `mamiya_universal.blend` — editable model, materials, cameras, and lighting.
- `mamiya_universal_front.png` — front studio render.
- `mamiya_universal_rear.png` — rear studio render.
- `mamiya_universal_detail.png` — material and lens closeup.
- `comparison/before_front.png`, `comparison/before_rear.png` — previous renders.

Reproduction order: `build_mamiya.py`, `refine_mamiya.py`, `detail_materials.py`,
then `detail_geometry.py` and `detail_finish.py`. Run each geometry pass once
with the local Blender CLI using `--background`, the preceding master and
`--python-exit-code 1 --python` with the script path in the active checkout.
Rendering is a separate step.

The latest closeups establish the lens as **100 mm f/2.8**, correcting the first
pass's f/3.5 marking. Photo details include directional raised leather grain,
ribbed nameplate with metallic lettering, machined metal roughness, woven strap
UVs and edge stitching, scalloped locking ring, revised lens scales, rounded
hood slots, a layered optical stack, an asymmetric rubber eyecup, back-release
slider and limited edge wear. The memo label uses the paper region of IMG_1976;
its image is packed into the blend file and also uses a relative external path.
Collection `07 Photo details` contains the additions. Earlier replaced objects
are hidden, so the original construction remains available for editing.
The final finish pass reduces excessive enamel mottling and adds actual finder
cavities and physical nameplate ribs, based on inspection of the closeup render.
Final previews are 1200×1200 Cycles renders with denoising (32 samples for the
overall views and 16 for the closeup),
rendered one at a time in separate Blender MCP background processes. The saved
viewport uses Solid shading and rendering uses auto-detected CPU threads to utilize
available server cores. Switch to Material Preview to inspect the shaders
interactively when sufficient memory is available.
All files for this model are grouped under `blender/mamiya_universal/`.


## Closeup refinement — 2026-09-09

The latest pass uses 31 additional photographs, IMG_1978–2009 (IMG_2000 is
absent). Their JPEG files are in the main checkout under
`blender/mamiya_universal/mamiya_universal_photos_details/`.

`08 Closeup refinements` contains the new editable components:

- Continuous rounded roll-film shell and leatherette wrap, perimeter beads,
  stamped latch and folded bail, lower spool pins and adapter locking cams.
- Black ASA dial on the latch-side chamber, 120 / S indicator windows,
  repositioned rear badges, curved film-advance lever and frame counter.
- Hollow side accessory socket with central slotted bolt, locating pins and
  external threads; opposite accessory plate; upper and lower strap fittings.
- Non-destructive body light-path and 6×9 gate openings, film rails and dark-slide grip.
- Layered finder prism, lilac coincidence patch, circular rangefinder aperture,
  nested window rims, refined nameplate and cold-shoe springs / screws.
- Lens PC-sync terminal, bent cocking lever and knurled grip, subsidiary
  engravings, grouped focus grooves, and more restrained glass reflections.

Replaced geometry and the removable strap remain in the file, hidden. The five
new views omit the strap to match the new assembled-camera reference photos.
The original collections, five earlier cameras, and previous master remain
available. Dimensions are still photo estimates; internals are visual approximations.

Run the new pass once on the previous master (Blender 5.2.1 was used):

```sh
blender --background mamiya_universal.blend --python refine_photo_details.py
blender --background mamiya_universal_refined.blend --python render_refined.py
```

The scripts resolve outputs relative to their own directory. For an individual
render, append `-- INDEX RESOLUTION SAMPLES`, for example `-- 3 1600 64`.
Resolutions below 1600 go to `previews_refined/` for inspection.

Final outputs in `renders_refined/` are five 1600×1600 PNG images, rendered in
Cycles with 64 samples, denoising, and matching studio lighting:

1. `01_front_three_quarter.png` — front and accessory-socket side.
2. `02_opposite_front.png` — front and accessory-plate side.
3. `03_rear_three_quarter.png` — memo clip, latch, eyecup and rear branding.
4. `04_side_profile.png` — lens projection, side fittings and roll-back depth.
5. `05_elevated_rear.png` — cold shoe, ASA dial, film advance and back cover.

`renders_refined/contact_sheet.jpg` presents all five views together.
The memo image remains packed in the blend file, so no external texture is
required to open or render the model.
