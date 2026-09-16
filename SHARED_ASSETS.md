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
historical initial v2 model is
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

## Reusable browser preview for 3D models

For GLB viewing, drag-to-rotate previews or remote iPad access, reuse
[`standalone/model-viewer/`](standalone/model-viewer/README.md). Read its README
before creating a new preview page. Add each new model to
[`models.json`](standalone/model-viewer/models.json); the `asset` path is relative
to the shared generated root described above, and `/?model=<id>` is its stable
browser link. Keep the module independent of the existing Web App unless the
user asks for integration. The module README covers deployment and checks.

Keep exported GLB files and their textures in unique shared generated run
folders. Only preview code and model configuration belong in Git. Do not copy
model binaries into the module directory to make a new model discoverable.

## Synchronization and backups

Shared media is transferred on demand using the general local `remote-setup`
tool, described in [remote-setup README](/Users/zhangzimou/Projects/tools/remote_setup/README.md). All source-code
Mutagen sessions exclude both shared directories.

- Mac shared root: `/Users/zhangzimou/Projects/film_photo`
- Linux shared root: `/workspace/film_photo`

From any worktree, upload a required file with:

```bash
/Users/zhangzimou/Projects/tools/remote_setup/remote-setup asset ensure ignored_assets/<path>
```

The same command accepts `ignored_generated/<path>` for an existing model or
export needed remotely. It skips identical files, verifies SHA-256 after transfer,
and refuses to overwrite differing content. Include external textures and other
required companion files explicitly. There are no overlapping asset sessions or
worktree copies/symlinks. The old `film-photo` session is migrated to code-only
coverage; flushing a source session no longer transfers media.

Retrieve durable remote outputs before releasing the instance:

```bash
/Users/zhangzimou/Projects/tools/remote_setup/remote-setup asset fetch ignored_generated/<unique-run>/<file>
```

Fetch only writes under the local main checkout's `ignored_generated/`. Preserve
source originals as read-only. Run application commands from the active mapped
remote worktree and flush that worktree's source session before execution.

Back up both shared directories separately: Git and Mutagen are not a versioned
backup. Removing a temporary worktree must not remove either shared directory.
Commit scripts and manifests normally; never force-add their binary outputs.

## Model version manifests

The tracked [Mamiya CURRENT.json](blender/mamiya_universal/CURRENT.json) is the
entry point for the latest editable master, browser GLB, renders and continuation
state. Resolve its asset paths against the shared generated root, not a worktree.
Each model should maintain an equivalent current record. Update it on delivery,
verify file checksums and the GLB's source master, and keep the viewer catalog in
agreement. Preserve previous run manifests as history; do not select the current
delivery by file modification time. Commit the records, not the binary assets.

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
