# Standalone 3D Model Viewer

Independent of the main Web App. Supports mouse and touch/iPad orbital rotation, two-finger pinch zoom and pan, view presets, auto-rotation, and multi-model switching. Adding a new model only requires updating configuration—no page copying required.

---

## Adding a New Model

1. Export a standard GLB with embedded textures into a durable local authoring run. Preserve the editable master and original inputs.
2. Publish a byte-identical runtime copy at `public/assets/cameras/<id>-<sha256>.glb` and track it in Git. Add an entry to `models.json` with `asset` relative to repository `public/`.
3. Update the model's `CURRENT.json` checksums and source relation: retain `browser_glb.path` relative to `ignored_generated`, and add `browser_glb.published_path` relative to the repository.
4. Restart the local preview server and navigate to `/?model=<your_model_id>`.

Example adding a new entry alongside the default Mamiya:

```json
{
  "id": "new-sculpture",
  "title": "New Sculpture",
  "subtitle": "Revision 1",
  "asset": "assets/cameras/new-sculpture-<sha256>.glb"
}
```

Replace `<sha256>` with the actual file digest. The default asset root is
repository `public/`, not shared authoring storage. `MODEL_CONFIG` selects a
custom catalog; `MODEL_ASSET_ROOT` explicitly overrides its asset root. Asset
paths remain relative to that root. Neither override is needed for the built-in
catalog; `FILM_PHOTO_SHARED_ROOT` affects authoring tools only.

`defaultModel` controls which model opens on the root page. When multiple models are configured, a dropdown menu automatically appears. Each model link can be bookmarked independently (`/?model=<id>`) and persists on page reload.

Required fields: `id`, `title`, `asset`.

Optional fields:

| Field | Purpose |
| --- | --- |
| `titleAccent`, `subtitle`, `eyebrow`, `edition`, `caption`, `captionDetail` | UI text labels |
| `rotation` | XYZ Euler rotation in radians; default `[0, 0, 0]` |
| `camera.home/front/rear/side` | Preset camera orientation vectors; model automatically centers |
| `camera.distance`, `camera.portraitDistance` | Landscape / portrait initial camera distance (range 1.15–9) |
| `exposure` | Scene exposure; default `1.15` |
| `profile` | Material adaptation profile; default is `default` (preserves original GLB materials, UVs, and normals) |

Custom material adjustments (e.g. Mamiya-specific optical glass coating) live in `profiles/mamiya.js` and are explicitly opted in. Standard models use `default` without custom shaders.

The standalone viewer also accepts embedded `KHR_draco_mesh_compression` GLBs.
Its decoder JavaScript and WASM are served from the installed Three.js package;
no external decoder CDN is required. Shared `loadModel` consumers opt in by
passing `{dracoDecoderPath}` as the third argument. Existing uncompressed model
consumers need no change.

---

## Directory Structure

- `models.json`: Model catalog, metadata, and default camera views.
- `catalog.mjs`: Configuration validation, asset path resolution, and sanitized public configuration.
- `index.html`, `style.css`: Minimalist UI, responsive tablet/mobile layout.
- `viewer.js`: Three.js scene, auto-centering, studio lighting, camera controls, mouse/touch handlers.
- `model-core.js`: Shared cached GLB loading, opt-in material preparation, uniform physical mounting, studio environment and orbit controls. Used by this viewer and the main app's camera collection. Scene clones share geometry; each renderer disposes only its own resources.
- `profiles/`: Optional per-model material overrides (default preserves native GLB materials).
- `server.mjs`: Lightweight HTTP server with Range requests, MIME types, and caching.
- `deploy/`: Systemd service template and deployment generator.
- `tests/`, `verify.mjs`: Automated integration, model reuse, and browser validation tests.

---

## Running Locally

Use the supported Node release from the repository README (Node 24 LTS
recommended). This module has its own dependency lockfile:

```sh
# From the repository root:
npm --prefix standalone/model-viewer ci
PREVIEW_HOST=127.0.0.1 npm --prefix standalone/model-viewer start
```

Open `http://localhost:4180` in your browser. `PREVIEW_HOST` is required:
the server accepts loopback `127.0.0.1` or the machine's Tailscale IPv4 address,
not an omitted host or `0.0.0.0`. Set `PREVIEW_PORT` to use another free port.
All four built-in GLBs are tracked, so no private asset store or authoring tool
is needed. The server supplies Draco decoders from its installed Three.js package.

For private phone/iPad viewing, inspect existing Tailscale mappings and proxy
directly to this local loopback server with
`tailscale serve --bg --http=4180 http://127.0.0.1:4180`. Verify the actual private
hostname and both URLs; preserve unrelated services and never enable Funnel.
See root [AGENTS.md](../../AGENTS.md) for preview safety.

---

## Testing

Run these commands in `standalone/model-viewer/` after installing its dependencies.
The reuse check uses Playwright Chromium; the real-model check uses installed
Google Chrome on every platform. Install missing browsers locally with
`PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium chrome`.

```sh
npm test
npm run test:reuse
npm run test:browser
npm run inspect -- mamiya-universal
```

- Configuration tests verify multi-model parsing, duplicate IDs, missing assets, and path safety.
- Reuse tests generate a dynamic test mesh and verify model switching and direct URL routing.
- Browser tests check mouse orbit, tablet touch gestures, pinch zoom, and layout responsiveness.

The browser gate starts an isolated server on an ephemeral loopback port in the
current checkout. It does not test or restart a deployed service. On Linux, the
real-model browser check uses installed Chrome with Vulkan, matching the app's
GPU test configuration. Install this module's dependencies locally. When adding
Playwright browser versions used by multiple worktrees, use `PLAYWRIGHT_SKIP_BROWSER_GC=1`.
Review screenshots and generated reuse fixtures are written under the active
repository's ignored `artifacts/model-viewer/`, never `ignored_generated/`.

## Main app camera collection

The main app integrates the same catalog assets/profiles through `model-core.js`.
Camera catalog entries add `widthMm`, `sha256`, `manufacturer`, `introduced`,
nullable `manufactured`, `category`, `description` and sourced `sources` links.
`scripts/prepare-camera.js` validates the tracked GLB and its checksum against
`CURRENT.json`; it does not require the private authoring copy. The existing
standalone model URLs remain unchanged. Physical mounting uses the upright model's X width;
standalone study framing retains its original normalization.

Large editable camera masters should follow the Mamiya and Autocord pattern:
export a non-destructive browser derivative with a bounded mesh and texture
budget, record both versions in the model's `CURRENT.json`, and point the catalog
at the derivative. Do not decimate or overwrite the accepted editable master.

The app caches the camera separately from essential offline film resources.
Opening it downloads it on demand; Backups & offline → Offline & storage also
offers explicit preparation. An uncached or failed camera download does not
block saved-roll viewing. Published camera GLBs belong in Git; private authoring
models and review captures remain ignored and are managed separately.
