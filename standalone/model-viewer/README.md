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
