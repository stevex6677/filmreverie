# Shared source assets and generated media

Durable ignored media belongs in the **main checkout**, shared by every worktree:

| Purpose | Main-checkout directory |
| --- | --- |
| Original inputs, read only | `ignored_assets/` |
| Models, exports, renders, derivatives | `ignored_generated/` |

`shared-assets.json` defines the Mac and Linux main checkouts. Override with
`FILM_PHOTO_SHARED_ROOT` on another machine. Never infer the shared root from
the current working directory. Python scripts use `scripts/shared_assets.py`;
Node scripts use `scripts/shared-assets.js`.

Existing media retains its former repository-relative path below its shared
root. Thus the Tripo input is
`ignored_assets/blender/mamiya_universal/tripo/mamiya_universal_8k.glb` and the
accepted v2 model is
`ignored_generated/blender/mamiya_universal/hybrid/v2/mamiya_universal_hybrid_v2.blend`.
The five renders, GLB and Blender backups are beside that model.
Duplicate inputs were consolidated only after verifying identical bytes.
Differing copies get separate destinations. The task's lens study and refined
donor differed from the main checkout; both versions were preserved, and the
hybrid builder points to the task's original donor copies under `preserved_variants/`.
Historical validation JSON paths describe the original runs. The completed
migration's file inventory and verification script remain available in Git
history at commit `55366c3`.

## Generating and using media

- Read original assets without overwriting them. Write edits and conversions
  under `ignored_generated/`.
- Blender builders allocate `runs/<UTC timestamp>-<unique ID>/` under the relevant
  model/version directory. Render and export scripts use the opened shared
  `.blend` file's directory. To continue a specific run, explicitly set
  `FILM_PHOTO_OUTPUT_DIR` to that directory. Outputs outside the shared generated
  root are rejected. Use separate run folders for simultaneous worktrees.
- The hybrid scripts read the preserved donor models from their migrated paths.
  v2 reads the accepted v1 model as its badge/text donor. To adopt a new donor,
  update its explicit path in the script and record that change with its checksum.
- Execute Blender scripts through Blender MCP and supply the actual source
  `__file__` when using `exec`. Code stays in the active synchronized worktree;
  media paths resolve to the main checkout on that same host.
- `npm run prepare:assets` generates content-addressed photo derivatives directly
  under shared `ignored_generated/photo-derivatives/`. It copies them into the
  active worktree's `public/` as a disposable serving cache. Concurrent generation
  uses unique temporary files and atomic replacement. `npm run build` performs
  this preparation automatically; `npm run dev` also prepares its serving cache through
  the `predev` hook. Tracked PNG masters remain in Git at their existing paths.
- Keep dependency directories, caches, build output and temporary test output
  in their normal worktree locations. This policy concerns durable ignored media,
  not every ignored file. Existing tracked images/media were not untracked.

## Synchronization and backups

Use the existing **film-photo** Mutagen session:

- Mac: `/Users/zhangzimou/Projects/film_photo`
- Linux: `/root/projects/film_photo`

Both shared directories are included by its current ignore rules. Do not add
overlapping sync sessions or worktree symlinks to these roots. Flush `film-photo`
for shared data and the active worktree's session for source code before remote
execution; flush `film-photo` after generation to retrieve outputs. Run commands
from the active mapped remote worktree even when reading/writing shared media.

Back up both shared directories separately: Git and Mutagen are not a versioned
backup. Removing a temporary worktree must not remove either shared directory.
Commit scripts and manifests normally; never force-add their binary outputs.

## Model version manifests

New generated versions should have a manifest recording
their source checksums, source-code revision, settings and output paths/checksums.

## Validation of this setup

On 2026-09-11, the active remote worktree verified all 95 shared destinations
against the 96 original-file records. Both output-isolation tests passed, the
viewer production build succeeded, and all 143 integration tests passed. Blender
MCP opened the relocated v2 master without missing external textures and rendered
a 400-pixel smoke image directly into a separate shared verification run. The
accepted model, GLB and five final renders were not regenerated or overwritten.

The camera-specific `blender/mamiya_universal/hybrid/v2/asset-manifest.json` links
the accepted v2 inputs, original build-code commit, settings and seven deliverables
with their checksums.
