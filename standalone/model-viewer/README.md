# Standalone 3D Model Viewer

Independent of the main Web App. Supports mouse and touch/iPad orbital rotation, two-finger pinch zoom and pan, view presets, auto-rotation, and multi-model switching. Adding a new model only requires updating configuration—no page copying required.

---

## Adding a New Model

1. Prepare a standard GLB file (with embedded textures) and place it under a dedicated directory in `ignored_generated/`.
2. Add an entry to the `models` array in `models.json`, setting `asset` relative to the asset root.
3. Sync code and assets, restart the preview server, and navigate to `/?model=<your_model_id>`.

Example adding a new entry alongside the default Mamiya:

```json
{
  "id": "new-sculpture",
  "title": "New Sculpture",
  "subtitle": "Revision 1",
  "asset": "blender/new-sculpture/runs/your-run/model.glb"
}
```

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

```sh
cd standalone/model-viewer
npm install
npm start
```

Open `http://localhost:4180` in your browser.

---

## Testing

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
GPU test configuration. Install this module's dependencies remotely; when adding
Playwright browser versions on a shared host use `PLAYWRIGHT_SKIP_BROWSER_GC=1`.

## Main app camera collection

The main app integrates the same Mamiya asset/profile through `model-core.js`.
Camera catalog entries add `widthMm`, `sha256`, `manufacturer`, `introduced`,
nullable `manufactured`, `category`, `description` and sourced `sources` links.
`scripts/prepare-camera.js` verifies the current GLB against `CURRENT.json` and
prepares an ignored content-addressed serving copy. The existing standalone
model URLs remain unchanged. Physical mounting uses the upright model's X width;
standalone study framing retains its original normalization.

The app caches the camera separately from essential offline film resources.
Opening it downloads it on demand; Backups & offline → Offline & storage also
offers explicit preparation. An uncached or failed camera download does not
block saved-roll viewing. Camera binaries and review captures stay out of Git.
