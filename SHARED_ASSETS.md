# Runtime assets and retained authoring media

All workflows run locally. A fresh clone contains the runtime files needed by the
Web App and standalone viewer; private authoring storage is not required to run
`npm ci`, `npm run dev` or `npm run build`.

| Purpose | Location | Retention |
| --- | --- | --- |
| Published packaging images, sample photos and camera GLBs | Active checkout `public/assets/` | Tracked in Git |
| Original authoring inputs, read only | Main checkout `ignored_assets/` | Durable; back up separately |
| Blender masters, intermediates, exports and previews | Main checkout `ignored_generated/blender/` | Durable; back up separately |
| Reproducible conversion/download caches | Active checkout `.cache/` | Disposable |
| Non-Blender review captures and reports | Active checkout `artifacts/` | Ignored; retain selected evidence separately |

`shared-assets.json` defines shared directory names. Python
`scripts/shared_assets.py` and Node `scripts/shared-assets.js` discover the local
Git main checkout, including from linked worktrees; there are no platform-specific
main paths. `FILM_PHOTO_SHARED_ROOT` explicitly overrides the authoring storage
root. Do not infer that root from the current working directory. Runtime asset
resolution uses the active checkout's tracked `public/`, not the authoring root.

Existing media retains its former repository-relative path below its shared
root. Thus the Tripo input is
`ignored_assets/blender/mamiya_universal/tripo/mamiya_universal_8k.glb` and the
historical initial v2 model is
`ignored_generated/blender/mamiya_universal/hybrid/v2/mamiya_universal_hybrid_v2.blend`.
The five renders, GLB and Blender backups are beside that model.
Duplicate inputs were consolidated only after verifying identical bytes.
Differing copies get separate destinations. The task's lens study and refined
donor differed from the main checkout; both versions were preserved, and the
hybrid builder points to those copies under
`blender/mamiya_universal/preserved_variants/codex-3296/`.
Historical validation JSON paths describe the original runs. The completed
migration's file inventory and verification script remain available in Git
history at commit `55366c3`.

## Generating and using media

- Read original assets without overwriting them. Write durable edits and
  conversions under the shared generated root, never in the cache as their only copy.
- New model-authoring pipelines use
  `ignored_generated/blender/<model>/runs/<run>/{scene.blend,intermediates/,exports/,previews/}`.
  Give simultaneous worktrees unique run names. Existing builders retain their
  documented internal filenames and layouts; do not rename accepted deliveries.
  To continue a specific run, explicitly set `FILM_PHOTO_OUTPUT_DIR` within the
  shared generated root and follow that builder's output conventions.
- The hybrid scripts read preserved donor models from their recorded paths.
  v2 reads the accepted v1 model as its badge/text donor. To adopt a new donor,
  update its explicit script path and record that change with its checksum.
- Execute Blender scripts with the local Blender CLI using `--background` and
  `--python`, with `--python-exit-code 1` before the script so Python failures
  produce a failing exit status. Code stays in the active worktree; shared
  authoring paths resolve to the local main checkout. When using `exec` inside
  a script, supply the executed script's actual local `__file__`.
- `npm run prepare:assets` validates tracked runtime images and GLBs and prepares
  the bundled Draco decoder from the installed Three.js dependency. Both
  `npm run dev` and `npm run build` perform this preparation. Neither needs
  private assets, Blender, `ffmpeg` or `sips`.
- `npm run prepare:photos` is the explicit local authoring command for regenerating
  photo derivatives from retained sources. It uses the disposable cache under
  the active checkout's `.cache/photo-derivatives/` and publishes derivatives to tracked
  `public/assets/photos/`. Install local `ffmpeg` for thumbnails; full JPEG
  conversion uses macOS `sips` when available, otherwise `ffmpeg`. These are
  authoring-only dependencies, not app-startup requirements.
  Review regenerated images before committing them. Existing tracked PNG masters
  remain in Git at their existing paths.
- `npm run fetch:showreel` likewise acquires the `/showreel` sample photographs
  (pinned by SHA-1) into `ignored_assets/photos/showreel/`; add `-- --publish`
  to regenerate their tracked derivatives with macOS `sips`.
  `npm run fetch:showreel-music` does the same for the showreel's CC0 music
  (pinned archives by SHA-256); `-- --publish` writes the excerpts with `ffmpeg`.
- `npm run fetch:packaging` optionally acquires pinned originals without changing
  startup requirements. `npm run fetch:packaging -- --publish` deliberately
  publishes their runtime copies. See the
  [packaging instructions](public/assets/film-packaging/README.md).
- Keep `ignored_generated/` Blender-only. Non-Blender review commands write to
  `artifacts/` in the active checkout. Keep dependencies, build output and browser
  reports in their normal ignored worktree locations. Do not move accepted
  authoring runs into disposable cache or treat tracked `public/assets/` as a cache.

### Blender CLI examples

Run from the active checkout with the local `blender` executable on `PATH` (or
use its absolute path). Replace the example paths with the recorded input master,
a script in this checkout and a new durable run under the local main checkout:

```sh
export FILM_PHOTO_OUTPUT_DIR="/absolute/main-checkout/ignored_generated/blender/<model>/runs/<unique-run>"
blender --background "/absolute/path/to/input.blend" --python-exit-code 1 --python "/absolute/active-checkout/blender/<model>/script.py"
```

For scripts that create or import a new scene, replace the input `.blend` with
`--factory-startup`. Keep the same output directory across preparation, editing,
export and verification steps that belong to one run. Existing builders may
allocate their own unique run; follow their documented output conventions.

For older render scripts that accept Python globals, use a small local driver
script and pass that driver to `--python`:

```python
import runpy

runpy.run_path(
    "/absolute/active-checkout/blender/mamiya_universal/hybrid/v2/render_refinement.py",
    init_globals={"VIEW": "rear_detail", "RESOLUTION": 1600, "SAMPLES": 96},
    run_name="__main__",
)
```

`--python` and `runpy.run_path` set the executed script's `__file__` automatically.
For long renders, allow the local process to finish, retain its log in the output
run, check its exit status and inspect the saved images before reporting success.

## Reusable browser preview for 3D models

For GLB viewing, drag-to-rotate previews or private iPad access, reuse
[`standalone/model-viewer/`](standalone/model-viewer/README.md). Add each model to
[`models.json`](standalone/model-viewer/models.json); `asset` is public-relative,
for example `assets/cameras/<id>-<sha256>.glb`, and `/?model=<id>` is its stable
browser link. The standalone default asset root is the repository's `public/`;
`MODEL_ASSET_ROOT` remains an explicit override for a custom catalog.

Retain authored GLBs and textures in their durable model run. Publish the selected
browser derivative, byte-identically, in `public/assets/cameras/` and track it
with the catalog and manifest. Both GLB variants of all five current cameras are runtime assets;
they must be available from Git without private storage. Do not copy them into
the standalone module itself. Preserve its independence except for the existing
Web App integration or explicitly requested changes.

## Backups and worktree lifetime

Back up `ignored_assets/` and durable `ignored_generated/` authoring runs
separately. Git does not back up ignored originals, `.blend` files, intermediates,
exports or previews. Preserve differing variants and verify checksums before
consolidating byte-identical copies. Include external textures and companion files.

Removing a temporary worktree must not remove shared durable directories.
The active checkout's `.cache/` can be recreated and excluded from durable
backups. Historical non-Blender generated folders were removed recoverably
to macOS Trash; cleanup inventories are under `artifacts/generated-cleanup/`.
Required Mamiya donor files were moved under `blender/mamiya_universal/preserved_variants/`
and their builder references updated. Do not delete unknown Blender runs on the
assumption that they are cache. Published runtime assets, manifests and scripts
belong in Git; private media, authoring binaries and review captures remain ignored.
No asset upload/download service or synchronization health check is needed for
local work.

## Model version manifests

See [the model version/location index](blender/MODEL_HISTORY.md) for current
editable masters, both runtime variants, retained large GLBs and historical
masters. Each model's `history/` contains immutable JSON delivery snapshots.
Before replacing CURRENT, archive it as `history/before-<new-run>.json`; after
publication, archive the new record as `history/<new-run>.json`. The mobile
packager does this automatically. Run `python3 blender/update_model_history.py`
to refresh the index or add `--check` to verify it without writing. These checks
require retained authoring storage and are not app-startup prerequisites.

The tracked [Mamiya CURRENT.json](blender/mamiya_universal/CURRENT.json) is the
entry point for the latest editable master, browser GLB, renders and continuation
state. Resolve authoring paths against the shared generated root, not a worktree.
`browser_glb.path` preserves that provenance; `browser_glb.published_path` is the
repository-relative runtime path under `public/assets/cameras/`. Each model should
maintain an equivalent record. Update it on delivery, verify checksums and the
GLB's source master, and keep the public-relative viewer catalog in agreement.
Preserve previous run manifests as history; do not select the current delivery
by file modification time. Commit the records and published runtime GLB, not
private inputs or editable Blender masters.

New generated versions should have a manifest recording
their source checksums, source-code revision, settings and output paths/checksums.

## Local-first migration verification

- Published four byte-identical camera GLBs (70,593,360 bytes total) and 15
  packaging raster images as tracked runtime assets.
- The initial migration relocated and hash-verified 35 cache files. The subsequent
  Blender-only cleanup moved those caches and the old migration inventory into
  the recovery folder in macOS Trash. Photo caches now regenerate under `.cache/`.
  Original inputs and retained model runs were preserved.
- A checkout exported only from the Git index installed dependencies and built
  locally with a deliberately unavailable authoring root. It required neither
  ignored directory; corrupted models and missing packaging were rejected.
- Local verification passed: 241 integration tests, three standalone catalog
  tests, two shared-output isolation tests, the four-camera shelf/inspection
  browser scenario, and standalone desktop/tablet-emulation interaction checks.
  Camera and packaging screenshots were visually inspected.
- Autocord, Canon 7s and Demi saved-delivery integrity checks passed locally.
  This migration did not regenerate models or rerun Blender rendering; tablet
  emulation is not a physical-iPad acceptance claim.

## Historical validation of the earlier storage migration

On 2026-09-11, the active remote worktree verified all 95 shared destinations
against the 96 original-file records. Both output-isolation tests passed, the
viewer production build succeeded, and all 143 integration tests passed. Blender
MCP opened the relocated v2 master without missing external textures and rendered
a 400-pixel smoke image directly into a separate shared verification run. The
accepted model, GLB and five final renders were not regenerated or overwritten.

The camera-specific `blender/mamiya_universal/hybrid/v2/asset-manifest.json` links
the accepted v2 inputs, original build-code commit, settings and seven deliverables
with their checksums.
