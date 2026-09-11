# Mamiya Universal — hybrid front revision

Media has moved to the main checkout: `ignored_generated/blender/mamiya_universal/hybrid/`. Source inputs live under `ignored_assets/`. See [the shared asset workflow](../../../SHARED_ASSETS.md) and the tracked migration manifest for exact paths. New builds allocate unique run folders; renders/exports follow the opened shared master.

This first hybrid combines the Tripo camera body and its textures with fitted,
editable details from the existing Blender models. The original GLB is never
written to. This is a front-detail revision, not a completed full-camera cleanup.

## Open and compare

- `mamiya_universal_hybrid.blend`: editable master, with packed source textures.
- `mamiya_universal_hybrid.glb`: separate camera-only export, with lettering
  converted to geometry. Retains high-resolution source mesh; not a lightweight
  web export. Glass appearance depends on the destination viewer.
- `hybrid_three_quarter.png` and `source_three_quarter.png`: matched studio views.
- `hybrid_detail.png` and `source_detail.png`: matched close-up views.
- `hybrid_side.png`: inspection of the lens/barrel join.

The master opens in **02 Hybrid | refined front**. Switch to
**01 Tripo original | comparison** to see the unmodified imported source in the
same studio. The GLB itself remains in `../tripo/mamiya_universal_8k.glb`.

## What changed

- Replaced the distorted front nameplate with a curved-clearance plate, fine
  physical ribs, and shallow editable UNIVERSAL / MAMIYA badges copied from
  `mamiya_universal_refined.blend` and fitted to Tripo.
- Fitted the vented hood and leading rim from `component_studies/lens_study.blend`,
  preserving its rounded slots and adding a transition to the retained barrel.
- Replaced the complete front inscription surface; reused the corrected editable
  MAMIYA-SEKOR / 1:2.8 f=100mm / No.126613 lettering on a smooth conical seat.
- Fitted the study's curved optical element, with a transmitting glass material,
  retaining grooves, dark internal tube and recessed iris.

The hybrid body shares the original imported mesh and UVs. Its **Mask** modifier
hides the replaced regions using the `Replaced front surfaces | reversible`
vertex group. Turn off that modifier and hide the precision collection to inspect
the original surfaces. Source textures were not repainted or resampled.
The donor construction is retained in a hidden collection; finished hood copies
contain the evaluated slot geometry. Labels remain editable text in the master.

## Remaining work

The barrel scales, finder glass, rear labels, cold shoe, and other source details
remain Tripo geometry/materials. Their existing artifacts are not fixed in this
revision. A later pass can replace them selectively after this hybrid direction
is reviewed. No decimation or wholesale retopology was performed.

Normalized source coordinates are retained in the master. Display scale and GLB
export use an approximate **0.24 meters per source unit**, not measured dimensions.

## Reproduction

Run through Blender MCP's background CLI tool in the synchronized task checkout:

1. Open a donor blend and execute `inspect_source.py` with its real `__file__`.
   This starts a fresh background scene and writes `tripo_source_review.blend`.
2. Open that review blend and execute `build_hybrid.py`. Rebuilding always starts
   from the review file, not the previous hybrid, so it does not stack edits.
3. Open the hybrid master and execute `render_hybrid.py` with globals `VARIANT`
   (`source` or `hybrid`) and `VIEW` (`three_quarter`, `detail`, `front`, or `side`).
4. Open the hybrid master in a fresh process and execute `export_hybrid.py`.
   This creates temporary export copies and does not save changes to the master.

Geometry/rendering used Blender 5.2.1 LTS, Cycles CPU with four threads and AgX.
Final matched views use 1400×1400 pixels, 16 samples and denoising. A 1600-pixel,
48-sample close-up exceeded the background tool's 120-second render limit, so
the final comparison uses identical lower-cost settings for both variants.

## Source integrity

Original GLB SHA-256:

`a6edda4742e79317a226ee5466251469987fa9c8efeacc4271c5dfec08f644d0`

Both the main-checkout original and task-checkout copy are checked against this
hash. `hybrid_validation.json` and `export_validation.json` record build/export
checks. The original source GLB and donor blend files are inputs only.
