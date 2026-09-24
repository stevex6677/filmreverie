# Olympus OM-1 — reference detail refinement

Read [CURRENT.json](CURRENT.json) for the delivered editable master, compact GLB,
checksums and reviewed renders. Original inputs live in the main checkout under
`ignored_assets/blender/olympus_om1/`; they remain read-only. Durable masters,
exports, previews and archived scripts live under
`ignored_generated/blender/olympus_om1/runs/`.

The supplied Tripo body, leather, optical image, knurled grips and overall shape
are retained. Selected metal surfaces and inscription fields are smoothed;
separate editable text restores the OLYMPUS and OM-1 marks, Zuiko lens inscription,
lens scales, ASA values and underside engraving. The top receives corrected
rewind and meter controls plus the accessory-shoe contact. The underside receives
a battery cover with recessed coin slot, an open tripod socket with internal
thread geometry, four screws and the photographed serial 151067.

Lettering uses a close font substitute. Hidden mechanical depths are visual
estimates from the supplied photos, not measured engineering dimensions. The
compact GLB uses the full refined mesh, embedded JPEG textures and Draco
compression; the editable master remains separate and unchanged by export. The export
script enforces a strict decimal limit of **10,000,000 bytes**.

## Reproduce locally

Use the local Blender CLI from the active checkout. Choose a new durable run and
use the same `FILM_PHOTO_OUTPUT_DIR` throughout:

```sh
export FILM_PHOTO_OUTPUT_DIR="/workspace/film_photo/ignored_generated/blender/olympus_om1/runs/<new-run>"
blender --background --factory-startup --python-exit-code 1 --python blender/olympus_om1/inspect_source.py
blender --background "$FILM_PHOTO_OUTPUT_DIR/intermediates/source.blend" --python-exit-code 1 --python blender/olympus_om1/refine_camera.py
blender --background "$FILM_PHOTO_OUTPUT_DIR/scene.blend" --python-exit-code 1 --python blender/olympus_om1/verify_master.py
blender --background "$FILM_PHOTO_OUTPUT_DIR/scene.blend" --python-exit-code 1 --python blender/olympus_om1/render_views.py
blender --background "$FILM_PHOTO_OUTPUT_DIR/scene.blend" --python-exit-code 1 --python blender/olympus_om1/export_compact.py
```

Inspect the master and reimported compact renders against the supplied
references. `export_compact.py` works on copies and checks that the master hash
is unchanged. After review:

```sh
python3 blender/olympus_om1/package_delivery.py
python3 blender/olympus_om1/package_delivery.py --verify
npm --prefix standalone/model-viewer test
PREVIEW_URL=http://127.0.0.1:4180 node blender/olympus_om1/verify_viewer.mjs
```

Packaging publishes a byte-identical GLB to `public/assets/cameras/`, updates
CURRENT and the existing viewer catalog together, and retains an authoring
manifest and script snapshot beside the master. It does not commit or upload.
Browser verification covers desktop orbit, tablet-emulated touch/pinch, image
captures, loading errors and the downloaded byte limit; it does not establish
physical iPad acceptance.

The stable viewer route is `/?model=olympus-om1`. Run the existing
[standalone viewer](../../standalone/model-viewer/README.md) locally and proxy it
directly through private Tailscale Serve, preserving other mappings.

## Current local preview

- Local: <http://localhost:4180/?model=olympus-om1>
- Private Tailscale: <http://upcloud.tail2b1388.ts.net:4180/?model=olympus-om1>

The viewer runs in this active checkout as transient local systemd service
`film-photo-olympus-viewer-20260924`. Tailscale Serve proxies port 4180 directly
to loopback; devices must use the same tailnet. There is no SSH tunnel or public
Funnel. The transient service lasts until stopped or the host reboots.

To stop this preview specifically, use
`systemctl stop film-photo-olympus-viewer-20260924` and
`tailscale serve --http=4180 off`; preserve unrelated services and mappings.

## top3 dial and top-cover revision

The current continuation corrects the ASA dial using `references/top3.HEIC`:
radial numbers with consistent cap height and a shared outer radius, pale-yellow
full-stop values including 25, a centered release button, and individual ASA
letters on the inner arc. The complete top cover and prism use continuous satin
metal; the accessory shoe has metal rails and a separate smooth insulating insert.
The former rectangular meter-switch overlay is removed.

Reproduce this continuation from `continuation.parent_editable_blend` in CURRENT
using a new, nonexistent run directory:

```sh
FILM_PHOTO_OUTPUT_DIR=/absolute/main-checkout/ignored_generated/blender/olympus_om1/runs/<new-run> \
  blender --background /absolute/path/to/parent/scene.blend --python-exit-code 1 \
  --python blender/olympus_om1/refine_top3.py
```

Then run saved-master verification, standard views, `render_top_details.py`, and
compact export on the new `scene.blend`. Review the close-up dial, front/top and
rear/top views along with the decoded GLB before packaging. The earlier run and
its authored files remain available through the parent record.

## Camera cabinet

The shared catalog includes a 136 mm body width and Olympus history/specification
sources. The app mounts the current compact GLB at 0.4896 world units on the upper
right of the five-camera cabinet. Inspection and optional offline downloads use
the same content-addressed binary as the standalone viewer.

The production app runs locally from the active checkout through transient
`film-photo-cabinet-20260924` on port 4181:
[localhost](http://localhost:4181/?mode=room) and
[private Tailscale](http://upcloud.tail2b1388.ts.net:4181/?mode=room).
Select **Cameras**, then **Olympus OM-1**. The separate model viewer remains on
port 4180. Stop only this app preview with
`systemctl stop film-photo-cabinet-20260924` and `tailscale serve --http=4181 off`.
