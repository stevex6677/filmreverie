# Mamiya Universal camera model

Open `mamiya_universal.blend` and select the **Mamiya Universal | Studio** scene.
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
then `detail_geometry.py` and `detail_finish.py`. These scripts were authored locally and executed
through Blender MCP on the remote Blender instance. Run each geometry pass
once. Rendering is a separate step.

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
viewport uses Solid shading and rendering uses four CPU threads to fit the
remote server's memory. Switch to Material Preview to inspect the shaders
interactively when sufficient memory is available.
All files for this model are grouped under `blender/mamiya_universal/` and
tracked in Git, including the original photos, previews, and Blender backup.
