# Camera models for inspection and cabinet display

Delivery: `20260924-mobile-a`; Mamiya cabinet revised in `20260925-cabinet-detail-d`. Each model's `CURRENT.json` and the shared
`standalone/model-viewer/models.json` select the current binaries. All sizes below
use decimal bytes, so the inspection limit is strictly 5,000,000 bytes.

| Camera | Inspection bytes | Cabinet bytes | Cabinet triangles |
| --- | ---: | ---: | ---: |
| Mamiya Universal | 3,149,292 | 1,393,344 | 171,136 |
| Minolta Autocord | 3,438,796 | 466,764 | 18,000 |
| Canon 7s | 3,582,572 | 439,120 | 17,997 |
| Canon Demi EE17 | 4,031,728 | 449,416 | 17,999 |
| Olympus OM-1 | 3,242,292 | 451,772 | 18,000 |

The cabinet downloads 3,200,416 bytes across five GLBs instead of the original
77,306,164 bytes of inspection models, a 95.9% reduction. Cabinet geometry totals
243,132 triangles. Four cameras keep one material/primitive and two embedded
1024 px baked textures. Mamiya instead preserves 19 material primitives, original
lettering geometry and four 1024 px textures: the previous whole-body voxel bake
lost badge text, lens detail and material boundaries. Its separate cabinet budget
is below 1.5 MB / 190,000 triangles; the other four remain below 1 MB / 25,000.
Inspection models retain approximately 396,000–600,000 triangles, use textures
up to 1536 px and Draco compression. Cabinet models are intended for shelf
distance; inspection and the standalone viewer always use the detail variant.

## Loading and offline behavior

The cabinet downloads/decodes at most two models concurrently and shares one
environment map. Once the room is ready and its loading overlay has faded,
inspection models preload sequentially in the background. They share the same
in-flight and decoded cache as inspection; opening another camera can bypass
the background queue. A failed preload does not block the room or later models,
and opening that camera retries its load. Camera positions, physical widths and cabinet controls are
unchanged. Nameplates remain hidden below 700 px width or at 500 px height and
below, as requested separately. Wider screens use one horizontal nameplate row;
if the measured label widths cannot fit, the entire row is hidden. Direct camera
selection remains available.

Loading completes only after all five cabinet models load and reach the render
loop. The loader shows the camera count; failed models keep the app unready and
offer **Retry cameras**, which retries only failures. The previous 12-second
fallback cannot release a slow or failed camera. Lightweight models and the
local Draco decoder are part of the required offline shell; detail downloads
remain optional.

## Authoring and provenance

See [MODEL_HISTORY.md](MODEL_HISTORY.md) for a per-camera comparison of current
masters, current detail/cabinet exports, previous large models and immutable
delivery snapshots. Start future edits from CURRENT's `editable_blend`, not
the compressed run's `scene.blend`.

Accepted editable masters and original inputs are unchanged. The former browser
delivery is retained in `browser_history` and durable authoring storage. New
work is in the main checkout's
`ignored_generated/blender/<folder>/runs/20260924-mobile-a/`, including
`scene.blend`, intermediate shelf scenes, exports, source records, exact script
snapshots and a delivery manifest. Runtime copies are content-addressed in
`public/assets/cameras/` and are required Git assets.

The detail pipeline preserves small components while simplifying dense scan
surfaces. The original cabinet pipeline remeshes a closed surface and bakes source color
and normals onto it. Mamiya and Autocord require welding and solidifying their
open scan sheets before remeshing; direct aggressive decimation produced missing
body surfaces and was rejected. Earlier candidates remain in the authoring run
for provenance and are not published. The revised Mamiya pipeline uses a larger
per-component geometry budget and keeps its lettering untouched; it does not voxel-remesh.

For the current Mamiya cabinet pipeline, use a unique run, visually review its
export in the cabinet, then publish:

```sh
blender --background --factory-startup --threads 2 --python-exit-code 1 \
  --python "$PWD/blender/mamiya_universal/build_cabinet.py" -- <new-run>
python3 blender/mamiya_universal/publish_cabinet.py <reviewed-run>
```

The publisher preserves the detail model and editable master, archives both CURRENT
snapshots, updates the catalog and history index, and retires only the old runtime
copy after verifying its retained authoring export. Previous cabinet exports are
listed in CURRENT's `shelf_history`.

For a new delivery, choose a unique run name and use the local Blender CLI:

```sh
blender --background --factory-startup --threads 2 --python-exit-code 1 \
  --python "$PWD/blender/build_mobile_derivatives.py" -- <model-folder> <new-run>
blender --background --factory-startup --threads 2 --python-exit-code 1 \
  --python "$PWD/blender/bake_shelf_voxel.py" -- <model-folder> <new-run>
# Review all five detail and cabinet exports before publishing the collection.
python3 blender/package_mobile_derivatives.py <new-run>
npm run build
npm run test:integration
```

The builder reads the selected browser delivery; for an additional simplification
pass, deliberately select a retained high-quality parent rather than repeatedly
compressing an already compressed derivative. Do not overwrite the accepted
masters or existing runs. The packaging script checks source/master hashes,
limits and previous retained copies before updating CURRENT, the catalog and
published assets together.

## Review

The 2026-09-24 delivery: all ten models were loaded and visually inspected in the reusable browser
viewer. The historical shelf reviews for Mamiya and Autocord are
`artifacts/mobile-model-review/mamiya-universal-shelf-corrected.png` and
`minolta-autocord-shelf-corrected.png`; the other three use `<id>-shelf-final.png`.
Inspection reviews use `<id>-detail-final.png`. Earlier Mamiya/Autocord files
named `shelf-final.png` show rejected candidates and are not this delivery.

The integration suite decodes the actual Draco geometry for all ten published
models, verifies finite positions and valid indices, checks hashes and budgets,
and checks physical scale and cabinet fit. Browser scenarios cover delayed fifth
model loading beyond 12 seconds, failed loading/retry, background detail preloading and cache reuse,
physical selection, mobile nameplate hiding and stopped-server offline reopening.
See [the camera review record](../docs/CAMERA_SHELF_REVIEW.md) for results and
limitations; browser emulation does not establish physical phone acceptance.

The 2026-09-25 Mamiya cabinet and aligned tablet row are reviewed in
`artifacts/mamiya-repair/`; see the latest camera review record for validation.
