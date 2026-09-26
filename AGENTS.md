# Project Rules: film_photo (Everything Local)

These instructions apply to the repository root and all descendants. File editing,
Git, dependency installation, npm/Node, Python, browser tests and Blender work all
run locally. No remote setup, source synchronization, SSH tunnel or remote service
is required. Do not use a remote execution wrapper or alter remote services.

## Existing reusable tools: check before implementing

- For model continuation or the latest editable master, GLB and renders, first
  read the model's `blender/<model>/CURRENT.json`. It is the authoritative
  current-delivery record; older revision READMEs and file modification times do
  not select the current version. Preserve paths, checksums and source/export
  relationships, and update the record and viewer catalog together on delivery.
  Link new model records from the repository README.
- Keep [blender/MODEL_HISTORY.md](blender/MODEL_HISTORY.md) in sync with model
  deliveries. Archive the previous full CURRENT record under the model's
  `history/before-<new-run>.json`, and the new record as `history/<new-run>.json`.
  Never overwrite a differing historical snapshot. Run
  `python3 blender/update_model_history.py` after updating CURRENT and the catalog;
  `--check` verifies the index and retained model checksums. History JSON is
  metadata only; keep authoring binaries in shared durable storage.
- For 3D model previews, drag-to-rotate pages or iPad model viewing, first read
  [standalone/model-viewer/README.md](standalone/model-viewer/README.md). Reuse
  that viewer instead of creating a one-off page. Keep it independent of the Web
  App except for the existing shared model integration or explicitly requested work.
- Add models to [standalone/model-viewer/models.json](standalone/model-viewer/models.json).
  Preserve stable `/?model=<id>` links and existing entries. Configure labels,
  orientation and initial views there; use opt-in `profiles/` for material changes.
- Runtime model assets are tracked under `public/assets/cameras/`, alongside the
  other required runtime images. See [SHARED_ASSETS.md](SHARED_ASSETS.md) for the
  distinction between published runtime assets and retained authoring files.
- Before changing a running preview, inspect its actual local working directory
  and port. A new agent worktree is not automatically the running checkout.

## 1. Work in the active local checkout

- Resolve the active repository root with `git rev-parse --show-toplevel`; do not
  assume the task uses the main checkout.
- Run commands in that checkout. Shared authoring helpers discover the local Git
  main checkout rather than using a platform-hardcoded path. Use
  `FILM_PHOTO_SHARED_ROOT` only to explicitly override the authoring storage root.
- Preserve unrelated user changes, source media, accepted models and historical
  runs. Do not discard or overwrite them, or delete unrelated services or files.
- Keep all Git operations local. Do not commit unless requested.

## 2. Install, run and verify locally

Use a supported Node release; Node 24 LTS is recommended for the current Vite and
Vitest versions. See the [README](README.md) for engine requirements.

```sh
npm ci
npm run dev
# Build and test locally as needed:
npm run build
npm run test:integration
PLAYWRIGHT_WORKERS=1 npm run test:e2e
```

A fresh clone includes the required sample photos, packaging images, and detail
and cabinet GLBs for all five cameras. Development and build do not need private
authoring storage, Blender,
`sips` or `ffmpeg`. `prepare:assets` validates runtime assets and prepares the
bundled decoder; it does not regenerate authoring media. Install local browser
binaries before browser tests; see [PLAYWRIGHT.md](PLAYWRIGHT.md).

Python tools, package-manager commands and Blender authoring also run locally.
Install their authoring-only dependencies when needed; they are not app-startup
prerequisites. `npm run prepare:photos` explicitly regenerates published photo
derivatives from local sources/cache. `npm run fetch:packaging` is optional source
acquisition, not a startup step.

### Local preview and phone/iPad access

- Start the application process locally in the active checkout. Check working
  directory and port ownership; preserve existing services. If a port is occupied,
  use another available port and report the actual URL.
- After every application startup, provide clickable localhost and private
  Tailscale URLs, and state that the app process runs locally. Use the actual
  hostname and Serve mapping reported by Tailscale; do not guess a URL. Opening
  or requesting the Tailscale URL is not required. If its response or device
  access was not checked, label the link unverified. If Tailscale is unavailable,
  say so explicitly rather than inventing a link.
- Inspect `tailscale status --json` and `tailscale serve status` before changing
  mappings. Use the current hostname/IP; do not assume the example `macbook`
  hostname exists. If the app port has no mapping, use
  `tailscale serve --bg --http=<port> http://127.0.0.1:<port>` to proxy directly
  to the local app; no SSH tunnel is needed.
- Preserve unrelated Serve mappings. Devices must use the same tailnet. Include
  the current hostname in Vite's allowlist through `FILM_PHOTO_ALLOWED_HOSTS`
  when necessary. Never use Funnel or expose the app publicly.
- Offline installation and new photo import on non-loopback devices require
  HTTPS. Follow [docs/OFFLINE.md](docs/OFFLINE.md); preserve existing browser
  libraries and export backups before changing origins.

## 3. Track runtime assets; retain authoring work

- Commit-required runtime files belong in Git, including packaging images,
  sample photos and all content-addressed camera detail and cabinet GLBs in `public/assets/`.
  Do not exclude them merely because they are binary or generated.
- Original private inputs remain read-only in main-checkout `ignored_assets/`.
  Retained Blender masters, intermediate authoring work, exports and previews
  remain in `ignored_generated/blender/`. Back these up separately from Git.
- New model-authoring pipelines use
  `ignored_generated/blender/<model>/runs/<run>/{scene.blend,intermediates/,exports/,previews/}`.
  Existing builders retain their documented internal filenames and layouts.
  Keep unique run names; do not mass-rename old runs or overwrite another
  worktree's output.
- Keep `ignored_generated/` Blender-only. Put reproducible caches in the active
  checkout's ignored `.cache/` and non-Blender review output in `artifacts/`.
  Neither location may hold the only copy of a source or accepted delivery.
  Deleting a temporary worktree must not remove shared durable authoring storage.
- Keep dependencies, build output, test captures, videos and browser reports
  untracked. Publishing runtime binaries does not authorize tracking private
  originals, `.blend` files or review artifacts.

## 4. Blender tasks

- Use the local Blender CLI for Blender-related work. Keep scripts in the active
  worktree and run `blender --background /absolute/path/to/input.blend
  --python-exit-code 1 --python /absolute/path/to/script.py` from that checkout.
  For a new scene, use `--factory-startup` instead of an input `.blend`. Set
  `FILM_PHOTO_OUTPUT_DIR` to a unique durable run when supported by the builder.
  When using `exec` inside a script, supply the executed script's actual local
  `__file__`. See [SHARED_ASSETS.md](SHARED_ASSETS.md) for CLI examples.
- Read [SHARED_ASSETS.md](SHARED_ASSETS.md) before generating media. Keep original
  inputs read-only and save durable work in unique main-checkout model runs.
- Preserve accepted editable masters. Export browser derivatives non-destructively
  and publish the reviewed GLB to `public/assets/cameras/<id>-<sha256>.glb`.
- In `CURRENT.json`, `browser_glb.path` retains authoring provenance relative to
  `ignored_generated`; `browser_glb.published_path` identifies the repository-relative
  runtime copy. Catalog `asset` paths are relative to `public/`. Verify checksums
  and source relationships when updating these records.

## 5. Verification

- Run relevant builds, tests and runtime checks locally; verify the active
  checkout and actual preview rather than relying on another worktree's output.
- Playwright video recording is off by default. Prefer assertions and screenshots;
  set `PLAYWRIGHT_VIDEO=on` only for selected interaction reviews or diagnostics.
- If video is enabled for a motion review, inspect it and report observations.
  Saving a video is not evidence of review. Disclose tooling limitations, and do
  not claim physical iPhone/iPad acceptance from browser emulation.
- Before reporting completion, summarize files changed, checks actually run and
  unresolved failures. Do not imply that historical validation proves new work.
