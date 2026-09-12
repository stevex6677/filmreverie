# Hybrid v2 — original Tripo lens and local cleanup

This document describes the **historical initial v2**. For the latest editable
master, black-body refinement, browser GLB and renders, read
[CURRENT.json](../../CURRENT.json) before continuing work.

Media has moved to the main checkout: `ignored_generated/blender/mamiya_universal/hybrid/v2/`. Source inputs live under `ignored_assets/`. See [the shared asset workflow](../../../../SHARED_ASSETS.md) and [this version's manifest](asset-manifest.json) for exact paths. New builds allocate unique run folders; renders/exports follow the opened shared master.

This revision follows the circled-artifact screenshot: it removes the two pale
scratch clusters below the nameplate, restores Tripo's lens and textured glass,
and makes the lens inscriptions clearer. The original GLB and hybrid v1 files
are preserved.

## Deliverables

- `mamiya_universal_hybrid_v2.blend` — editable master with packed textures.
- `mamiya_universal_hybrid_v2.glb` — separate camera-only export.
- Five final 1400 × 1400 Cycles images, 20 samples with denoising:
  1. `01_front_three_quarter.png`
  2. `02_opposite_front.png`
  3. `03_rear_three_quarter.png`
  4. `04_side_profile.png`
  5. `05_elevated_front.png`
- `qa_detail.png` — extra 1000-pixel inspection close-up.

The master opens in **02 Hybrid v2 | Tripo lens**. The separate scene
**01 Original Tripo | comparison** retains the unedited source import.

## Changes

The clean v1 nameplate and its shallow editable badges are retained. The v1
modeled hood, conical lens seat, glass, optical tube and iris are not used.
The full Tripo lens is restored, including its hood and original textured glass.

The two circled leatherette regions have local geometry flattened and their
texture samples replaced with clean grain from Tripo's film chamber. UV-space
repairs are feathered into the surrounding texture. Color and roughness are
copied at the existing grain scale; raised scratch normals are neutralized.
All three PBR images are independent copies, packed into the master.

Only the inscription band is refined on the lens: generated old markings are
removed from the atlas, depth noise is softened using a localized Y-only Smooth
modifier, and small clean glyphs are projected onto the original surface.
The roughness of that band is raised slightly to prevent specular noise from
overwhelming the letters. The lens glass and hood are outside these edits.
The glass remains the original Tripo textured surface; it is not replaced by
the v1 refractive optical assembly.

Editable font controls are in **03 Editable inscription controls | hidden**;
the visible fitted glyph meshes are in **02 Clean badges and lens text**.
Changing a control requires rebuilding/projecting its visible glyph mesh.

## Scope and reproduction

Existing source irregularities elsewhere on the barrel, finder, rear and hood
are retained. No wholesale remeshing, lens redesign or decimation is performed.
The working/export scale remains an approximate 0.24 meters per Tripo unit.

Through Blender MCP's background CLI tool:

1. Open the shared `ignored_generated/blender/mamiya_universal/hybrid/tripo_source_review.blend` and execute `build_v2.py`, setting its
   actual `__file__`. Always rebuild from that review file, not a previous v2.
2. Open the v2 master and execute `render_v2.py` once per `INDEX` from 1 to 5.
   Optional globals: `RESOLUTION`, `SAMPLES`; `INDEX=0` is the inspection detail.
3. Open the v2 master in a fresh process and execute `export_v2.py`.
   Export copies are temporary; the editable master is not overwritten.

Blender version: 5.2.1 LTS. CPU rendering uses four threads and AgX.
The `.npy` correspondence file is an intermediate UV-repair artifact, not a
runtime dependency; textures are packed into the delivered files.

Original GLB SHA-256:
`a6edda4742e79317a226ee5466251469987fa9c8efeacc4271c5dfec08f644d0`

Validation JSON files record source integrity, mesh/export checks and the five
render outputs. This folder contains no replacement of the original GLB.
