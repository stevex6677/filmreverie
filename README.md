# Film Reverie

An immersive 3D darkroom and illuminated light table experience for inspecting 35mm and 120 medium-format film in the browser.

Built with **React 18**, **Three.js**, and **React Three Fiber**.

The vertical three-dot menu offers **Layout → Auto / Desktop** in owner and guest
darkrooms. Auto adapts to screen width and touch input; Desktop overrides that
choice. The preference is remembered in this browser.
Desktop and mobile share a film-strip header with **Room**, **Film Shelf**,
**Light Table** and **Cameras** navigation. **Settings** opens room lighting
controls in the room and viewing controls at the table.
Desktop views omit the bottom interaction hints.
Guest visits open in the darkroom, with the last active roll still loaded on the
table. Opening a roll from the shelf enters the light table.

---

## Features

### 1. 3D Darkroom & Illuminated Light Table
- **Interactive 3D Space:** Explore the virtual darkroom with intuitive look-around and approach navigation.
- **Physical Light Table:** Continuous dimmer controls, diffuse backlight transmission, and dynamic room lighting.
- **Whole-Strip Inversion:** Toggle between negative and positive modes across the entire physical strip, including borders, sprockets, and manufacturer markings.

### 2. Authentic Film Stocks & Rebate Markings
Twelve film stocks with distinct adjustable color/grain effects and procedural edge markings:
- **Kodak Portra 160, 400, and 800:** Fine grain, true orange mask normalization, and dual-track edge cadence.
- **Kodak Ektar 100:** Ultra-vivid color negative emulsion with high-contrast edge branding.
- **Fujifilm 200 and Kodak Pro Image 100:** 35mm only; vivid greens and balanced portrait color respectively.
- **Kodak Ultramax 400:** 35mm only; vivid color, visible grain and KODAK GC 400 edge lettering.
- **Kodak Gold 200:** 35mm and 120, with warm color and classic grain.
- **Fujifilm Provia 100F and Velvia 50/100:** Color reversal stocks in 35mm and 120.
- **Kodak Ektachrome E100:** Reversal slide film with neutral clear base and positive-only viewing.

For complete physical standards (KS-1870 / ISO 1007), coordinate spaces, modification instructions, and how to add new stocks, see [docs/FILM_SPECS.md](docs/FILM_SPECS.md). Factory number spacing and the evidence limits for 120 film are documented in [film edge printing](docs/FILM_EDGE_PRINTING.md).
Edge lettering follows physical film length continuously across strip cuts,
including when the roll's frames-per-strip setting changes.

### 3. Physical Loupe & Optical Magnification
- **Tactile Inspection Loupe:** Drag to inspect fine film grain and edge markings across frames.
- **Magnification Modes:** Discrete presets (2×, 4×, 8×) and keyboard adjustment up to 10×.
- **Loupe Styles & Sizes:** Choose the classic optical barrel or a clear glass hemisphere, each in Small, Medium or Large. Open Loupe settings to expand a single dock containing style, size, magnification and optical effects. Drag the loupe or explore its lens while settings stay open; Done or Escape collapses the dock. The glass hemisphere preserves transmitted colors without simulated reflections or a cloudy tint. Size changes the viewing area independently of magnification. Style and size are remembered across rolls and visits.

### 4. Flexible Roll Sizing & Multi-Format Support
- **Film Formats:** Support for **35mm** (36 × 24 mm full frame or 18 × 24 mm half frame, with 72 nominal half-frame exposures) and **120 medium format** (6×4.5, 6×6, 6×7, 6×9).
- **Free-Sizing Mode:** Retains each image's native aspect ratio along a shared film height (24 mm for 35mm, 56 mm for 120).
- **Film Advance & Capacity:** Dynamic film span metering at a fixed physical scale. Fixed formats use their default frame counts per strip; free-sized rolls pack into 230 mm strips. **Frames per strip** in the roll editor accepts a positive whole number for that roll's light-table layout; **Use default** restores automatic layout without changing photo crops or film capacity.
- **Multi-Device Navigation:** Responsive controls designed for mouse/keyboard on desktop and fluid touch gestures (pinch-to-zoom, pan, swipe) on iPad and mobile.

### 5. Standalone 3D Model Viewer
An isolated, reusable 3D model viewer module located in [`standalone/model-viewer/`](standalone/model-viewer/) for inspecting hardware models (such as the Mamiya Universal Press camera) with 360° rotation, preset views, and studio lighting.

For current and historical file locations, see the [model version index](blender/MODEL_HISTORY.md), including the editable master to open for future changes.

The catalog uses separate inspection and cabinet GLBs for all five cameras.
Inspection models are each below 5 MB; accepted editable masters and earlier
exports remain in shared authoring storage. Start model changes from the
`editable_blend` in the corresponding `CURRENT.json`, which also records export
provenance, checksums, renders and published runtime paths.

| Camera / current record | Inspection GLB (MB) | Cabinet width | Standalone viewer query |
| --- | ---: | ---: | --- |
| [Mamiya Universal](blender/mamiya_universal/CURRENT.json) | 3.15 | 21 cm | `/?model=mamiya-universal` |
| [Minolta Autocord](blender/autocord/CURRENT.json) | 3.44 | 8.4 cm | `/?model=minolta-autocord` |
| [Canon Demi EE17](blender/canon_demi_ee17/CURRENT.json) | 4.03 | 11.6 cm | `/?model=canon-demi-ee17` |
| [Canon 7s](blender/canon7s/CURRENT.json) | 3.58 | 13.8 cm | `/?model=canon-7s` |
| [Olympus OM-1](blender/olympus_om1/CURRENT.json) | 3.24 | 13.6 cm | `/?model=olympus-om1` |

Sizes use decimal MB. See [mobile model delivery](blender/MOBILE_MODELS.md) for
budgets and reproduction, and the [viewer guide](standalone/model-viewer/README.md)
for startup and catalog configuration.

### 6. Camera Collection
The room starts from its center. Its 90 cm, two-tier camera cabinet matches the film cabinet's height and replaces the right-wall chemistry shelf. The complete developing bench, chemicals and drying equipment sit beside the door, where the box shelf was removed. The camera cabinet sits closer to the light table and displays the current Mamiya Universal, Minolta Autocord, Canon Demi EE17, Canon 7s and Olympus OM-1 on its upper tier at their respective 21 cm, 8.4 cm, 11.6 cm, 13.8 cm and 13.6 cm physical widths. Five upper positions provide clearance for the cameras without changing their scale. Three film boxes and two cartridges occupy the lower tier. The cabinet uses separate lightweight models, with preserved lettering and materials on Mamiya; after the room is ready, detailed models below 5 MB preload sequentially in the background for inspection. Startup waits for every cabinet model to load successfully, with retry for failed models. Select **Cameras** for a tightly framed cabinet-only view, then any camera to inspect every side with rotation, zoom, pan and directional presets. Detailed camera models load when inspected; lightweight cabinet models and the compressed-model decoder are included in the required offline shell. See [mobile model delivery](blender/MOBILE_MODELS.md) and [camera shelf review](docs/CAMERA_SHELF_REVIEW.md) for validation and remaining acceptance work; asset preparation verifies each camera's `CURRENT.json` against the shared viewer catalog.

### 7. Public Gallery and Guest Darkroom
The home page (`/`) displays only owner-published cloud rolls on the physical
darkroom shelf. Browsing needs no account; visitors cannot add, edit or delete
rolls there. Its room header shares the guest darkroom's controls; **Create Your Own**
appears in the film-strip header alongside **Settings** and a vertical three-dot menu.
The menu shows **Admin Login** until authenticated, then **Logged in**. Admins use
the same shelf and roll editor as guests: **New roll**, edit, delete, Trash and
Undo. Images process in a worker while roll details remain editable. Admin derivatives
upload privately in the background. **Save** publishes the reviewed roll and closes
the editor; **Save and open** also opens it on the light table. Live progress reports
processing, upload and save stages. Each ordinary save, edit, trash or restore uses
a single roll mutation request after any new image uploads. Unchanged images are
reused when saving edits. Deletion withdraws the roll from
the gallery and retains it in cloud Trash; restoration republishes it. Cloudflare
Access JWT verification, short-lived key-scoped direct R2 uploads of browser-re-encoded
JPEG derivatives (never originals), versioned R2 catalog publication and withdrawal
live in `cloudflare/`. Admin performs metadata removal locally before uploading;
the Worker does not decode image content. Local mock measurements and outstanding
hosted acceptance checks are recorded in
[the cloud gallery guide](docs/CLOUD_GALLERY.md).

**Create Your Own** opens `/guest?welcome=1` in a new tab and shows the guest
introduction on every click; direct `/guest` visits show it only until dismissed.
The guest darkroom starts with one removable example roll. Add, edit and delete
rolls in film shelf mode. Guest rolls stay in the browser's `darkroom-guest-rolls`
database at best effort, without accounts, uploads or synchronization. Guest
backup, migration and offline/storage controls are not offered. Earlier
`darkroom-rolls` libraries remain untouched.

See [deployment/privacy/recovery instructions](docs/CLOUD_GALLERY.md) and
[the historical M21 review](docs/M21_REVIEW.md). For the local push/deploy workflow,
follow [Deployment](#deployment) below. The optional
[GitHub Actions workflow](docs/AUTO_DEPLOY.md#github-actions) also supports `master`
pushes after its Cloudflare token and private configuration secrets are set.
Deployment status is recorded separately from this feature documentation.
Production settings live in ignored `cloudflare/deployment.local.json`; the
committed configuration is generic. Normal local builds do not need a Cloudflare account.
Local development can use real Cloudflare login, return to the same dev URL,
and edit the published gallery through the automatically configured
[development admin bridge](docs/CLOUD_GALLERY.md). Its session stays on the local
server; the guest darkroom remains browser-local. With private deployment settings,
normal development and Vite preview serve published rolls anonymously at
`http://macbook:<port>`; Admin Login enables adding and deleting cloud rolls.
The Worker must allow that private callback host/port as documented above.
`npm run validate:m21` includes the app/Worker builds, cumulative integration/E2E
suites and all three standalone viewer gates; hosted checks remain separate.

### 8. Screening: roll tours and video export
On the light table (Overview or Focus, loupe put away), **Screen roll** plays an
automatic tour of the whole roll in the actual table scene: **Tracking Shot** (a
low camera tracks along each strip and moves in on details), **Develop** (a band
of light turns each negative positive, or brings up the backlight behind reversal
film) or **Projector** (the room goes dark, a countdown is projected in the lamp-lit
gate, and frames slide in from the right on a regular beat), **Darkroom** (from the
room to the light table and back), **Orbit** (slow arcs around each photograph),
**Darkroom Prints** (every photograph enlarged onto paper and hung up to dry) or
**Documentary** (each photograph fills the screen, drifting and dissolving).
The picker groups **Reel**, **Pace** and **Music**, with a frame count and duration
estimate. Reels include opening and closing shots and use Relaxed, Normal or Brisk
pace; reduced motion uses slow cuts instead of fast moves, blur and flicker. Each reel also has two
settings of its own, folded under **Adjust** in the picker (for example Distance and Depth of field for Tracking Shot,
Gate weave and Lamp flicker for Projector, Drift and Dissolve for Documentary).
Tracking Shot, Darkroom, Orbit and Darkroom Prints render with depth of field,
focused on the camera's subject. Preview supports
play/pause, previous/next frame, tap to pause and exit; exiting restores the table
exactly, and screening never writes rolls or saved views.

**Film Journey**, the default and first reel in the picker, combines documentary framing, oblique tracking, alternating
left/right arcs and negative-only Develop passages in one continuous camera path. It has
no dissolves, cuts, blackouts, projector effects or print-wall visits. **Movement**
(Minimal → Expressive, default 65%) controls drift and angles; **Variety** (Subtle →
Varied, default 50%) changes the grouping and frequency of treatments. Pace
primarily adjusts viewing time: Normal spends 2.2–2.7 seconds on each positive
photograph, with shorter introductions and transitions. Reveals progress forward, with occasional
featured negatives and ordinary frames developing ahead of the camera; reversal
stocks stay positive throughout. Strip changes follow a shallow diagonal return.
Reduced motion keeps the continuous path with flat views, minimal drift and
slower travel. The same path drives preview, seeking and all three export formats.

The settings include the same five CC0 music tracks as `/showreel`, with tap-to-preview selection,
volume and No music controls. Music plays with the preview and is included in
exports, looping for long rolls and fading at the start and end. The five tracks
are included in the app cache. **Families**, the first track, is selected by default
at 80% volume; choose **No music** for a silent screening. If the browser
cannot encode audio, export reports that the resulting video is silent.

**Export video** first asks for the video format, then renders the same timeline
frame by frame into a 30 fps H.264 MP4 at 1280 × 720, 720 × 1280 or
720 × 720, entirely in the browser with
WebCodecs and an in-repo MP4 writer; nothing is uploaded. It works for published,
guest and offline rolls, and saves through the share sheet (iPad: Save Video) or a
download. The export code loads on demand and is part of offline preparation.
iPad Safari is the acceptance target; exports have been reported working on an iPad and
an iPhone, with detailed device measurements still to be recorded. See
[Screening review](docs/SCREENING_REVIEW.md). `npm run validate:m22` runs the
production build, cumulative integration/E2E suites and standalone viewer gates.

### 9. Showreel (`/showreel`)
An unlinked page plays a 101-second, 16:9 promotional film of the app, rendered
live from code: the light table switching on as a band of light develops the
negatives, the title over the room, the darkroom's wet side, the New roll editor
taking in a roll of photographs (noting that they stay on the device), the
published film shelf, then every roll laid out on one light table at true size,
from half frame, 35mm and panoramic to 6×6, 6×7 and 6×9, each format named in
turn. Each later shot features a different roll: the camera descends from the
whole table into a Tracking Shot excerpt along 35mm that carries on, without a
cut, to two Portra frames (one vertical, seen upright), a glide along the
half-frame roll that holds on one photograph, the loupe on the panoramic roll's
edge printing, the whole 6×6 roll before a calm push in on one photograph, two
6×9 frames held whole from overhead before the camera arcs up and over, without
a cut, into the Develop reel's moves over a slide, then the Darkroom Prints reel
along three prints and the Projector screening three frames of the 6×6 roll, and
the camera cabinet, ending on a card with filmreverie.app and the GitHub link.
Titles, captions, light leaks, grain and camera labels are drawn over the scene.
Corner slates name each featured photograph and its camera when supplied, alongside
the film stock and format; a missing photograph title falls back to the roll name.
The page is public to anyone with the URL, is marked `noindex`, and is not part
of the offline download.

It opens on its **settings**: music (five tracks that preview when selected, or
none) and volume, film grain, vignette, light leaks, and titles and captions.
Changes show on the frame behind the sheet and are remembered in the browser.
**Preview** plays the film with its music; the soundtrack's clock drives the
picture so the two stay together. A track's musical cue aligns with the first
cut when possible; tracks with earlier cues play from the beginning immediately. **Export video** renders the film frame by frame to a 30 fps H.264
MP4 at **720p or 1080p**, with the soundtrack as AAC (Opus where AAC encoding
is unavailable; silent if neither is). Nothing is uploaded. On the 2-core
development Mac a 720p export takes about 6 minutes and 1080p about 18.

The music is by HoliznaCC0, dedicated to the public domain (CC0), so it can be
used anywhere without credit: *Families* (default), *Blue Skies*, *City In
The Rearview*, *Dream Pop* and *Autumn*, listed in [`src/data/showreelMusic.json`](src/data/showreelMusic.json).
`npm run fetch:showreel-music -- --publish` extracts the pinned originals into
shared `ignored_assets/music/showreel/` and publishes 130 second excerpts to
`public/assets/music/showreel/`.

The film shows eight rolls, one per subfolder of
[`public/assets/photos/showreel/`](public/assets/photos/showreel/), tracked in
Git and left out of the offline download. Each folder is named
`<order>_<format>_<stock>`, for example `4_66_gold200`, `3_35wide_e100` (a
free-sized panoramic 35mm roll) or `0_35_half_portra160` (half frame). After changing the photographs, run
`npm run showreel:manifest` to regenerate
[`src/data/showreelRolls.json`](src/data/showreelRolls.json); roll names there
may be edited and are kept, along with roll camera names and per-photograph titles.
The photographs each shot must show are listed in
`FEATURED` in [`src/showreel/timeline.ts`](src/showreel/timeline.ts). The film
shelf is the published gallery's (`/api/gallery`, through the development
gallery bridge when running locally); without it the shelf shows placeholder
cartons.

Before playback the page renders the whole film once behind its loading screen
(a pre-roll), so shaders compile and textures upload before the first shot.
Phone previews scale photograph textures to a shared memory budget and use smaller
film-edge textures to reduce memory pressure.
Query options: `t=12.5` starts at a moment, `paused=1` holds it (skipping the
settings), `clean=1` skips the settings and controls for screen recording, and
`size=1920x1080` fixes the stage size. Keyboard: Space plays or pauses, ←/→
seek (Shift for 5 s), H hides the controls and F toggles full screen. The code
is in [`src/showreel/`](src/showreel/).

---

## Getting Started

### Prerequisites
- **Node.js:** Node 24 LTS recommended. The locked Vite 8 version requires Node `^20.19.0 || >=22.12.0`; the Vitest 5 test suite requires `^22.12.0 || ^24.0.0 || >=26.0.0`. Node 18 is unsupported.
- **npm:** Use the npm supplied with the supported Node installation.

### Installation

```bash
git clone https://github.com/stevex6677/filmreverie.git
cd filmreverie
npm ci
```

Run all commands locally in this checkout. No remote execution setup, SSH tunnel,
private asset store or external image converter is needed to start or build the
app. Git includes required packaging images, sample photos and both GLB variants for all five cameras under `public/assets/`.

### Running Locally

From the active checkout (`git rev-parse --show-toplevel`), check the process
using port `11111` before starting or replacing a preview. User testing servers
use this port unless another is explicitly requested; preserve other services.

```bash
# Start the development server locally, accessible on the LAN and tailnet
npm run dev -- --host 0.0.0.0 --port 11111 --strictPort
```

Open [localhost:11111](http://localhost:11111). On this machine, devices on the
same tailnet with MagicDNS can use [macbook:11111](http://macbook:11111).
Vite's unoverridden default is `5178`; the commands here explicitly select the
project's testing port. Keep `macbook` and `macbook.tail2b1388.ts.net` in the
allowed hosts when overriding `FILM_PHOTO_ALLOWED_HOSTS`.

The home page `/` requires a gallery backend. With valid private
`cloudflare/deployment.local.json` settings, development and Vite preview
automatically bridge to the real published gallery. In a new worktree, locate
the main checkout with `git worktree list --porcelain`, validate its existing
settings with `readDeployment` from `scripts/cloudflare-config.ts`, and reuse
them in the active checkout's ignored configuration file with permissions `0600`.
Do not overwrite an existing configuration or print/commit its contents. Check
that `devLoginOrigins` covers the intended localhost and macbook ports.

Preserve explicit backend overrides: `CLOUDFLARE_DEPLOYMENT_CONFIG` takes
precedence over the file, `FILM_PHOTO_CLOUD_API` selects an API proxy, and
`FILM_PHOTO_DEV_ADMIN_BRIDGE=0` disables the automatic bridge. Without a configured
backend, use [the guest darkroom](http://localhost:11111/guest); a fresh clone can
run it without a Cloudflare account. See [gallery configuration](docs/CLOUD_GALLERY.md)
for details. Admin background uploads, saves, deletes and restores through the
bridge affect real cloud storage; guest rolls stay local.

Before declaring the gallery ready, check `/api/gallery` through the actual app
port for successful JSON containing a `rolls` array, and load a returned thumbnail
if nonempty. Check both localhost and a `Host: macbook:11111` request to the local
listener; this does not verify access from another device. A homepage HTTP 200
alone can be Vite's HTML fallback. Restart the verified preview process after
changing connection settings.

Direct HTTP access needs no Tailscale Serve proxy. Offline installation and new
photo imports from a non-loopback device require HTTPS; follow the
[offline HTTPS guidance](docs/OFFLINE.md#private-serving) while preserving existing
origins, browser libraries and Serve mappings.

### Production Build

```bash
# Build the optimized production bundle
npm run build

# Preview the production build locally
npm run preview -- --host 0.0.0.0 --port 11111 --strictPort
```

`prepare:assets`, run automatically by development and build, validates published
runtime assets and prepares the bundled Draco decoder from Three.js. It does not
regenerate photo/model source media or require Blender, `ffmpeg` or `sips`.

### Deployment

For this repository, a request to **push** includes a local Git push followed by
both Cloudflare production deployments, unless explicitly scoped otherwise.
Build and deploy the exact revision being pushed, preserving unrelated working
changes and using a clean checkout when needed. Private deployment settings and
local Wrangler authentication are required; see [deployment setup](docs/AUTO_DEPLOY.md).

```bash
npm run build
npm run test:integration
npm run check:cloud
npm run check:cloud:production

# After validation, push the intended branch/revision to GitHub.
# Only after that push succeeds:
npm run deploy:worker
# Only after the Worker succeeds:
npm run deploy:pages
npm run verify:cloud
```

Stop on validation or push failure. A Pages failure after a successful Worker
deployment is a partial deployment. The helpers use private settings to preserve
the existing Worker, Pages project, routes and buckets; `pagesBranch` selects the
Pages production branch independently of the Git branch. Do not deploy with the
generic checked-in Wrangler files. Verification reads the website and public
`/api/gallery` without creating or deleting rolls. GitHub Actions is optional for
this local workflow.

### Assets and authoring

Published `public/assets/photos/`, `public/assets/film-packaging/` and
`public/assets/cameras/<id>-<sha256>.glb` files are tracked runtime inputs, not
disposable serving caches. Commit changed runtime assets with their metadata.
`npm run prepare:photos` explicitly regenerates photo derivatives from local
sources/cache; `npm run fetch:packaging` optionally acquires originals, and
`npm run fetch:packaging -- --publish` updates pinned runtime packaging images.
These are authoring operations, not fresh-clone startup steps.

Private originals in `ignored_assets/` and retained Blender masters, intermediates,
exports and previews in `ignored_generated/blender/` are durable and need separate
backups. Keep `ignored_generated/` Blender-only; disposable caches belong in
`.cache/` and non-Blender review output in `artifacts/` in the active checkout.
Helpers discover the local Git main checkout across worktrees;
`FILM_PHOTO_SHARED_ROOT` overrides authoring storage, not runtime asset lookup.
See [SHARED_ASSETS.md](SHARED_ASSETS.md) for run layouts and publication rules.

For the separate viewer, follow its [local startup instructions](standalone/model-viewer/README.md#running-locally),
including `PREVIEW_HOST=127.0.0.1`. For private phone/iPad previews, follow
[AGENTS.md](AGENTS.md) and [offline HTTPS setup](docs/OFFLINE.md#private-serving).

---

## Testing

Install local browser dependencies before E2E tests. The configured projects
use Google Chrome and Playwright WebKit; see [PLAYWRIGHT.md](PLAYWRIGHT.md).
Build production output before running E2E tests directly.

```bash
# Run unit & integration test suites (Vitest)
npm run test:integration

# Build, then run end-to-end browser tests (Playwright)
npm run build
PLAYWRIGHT_WORKERS=1 npm run test:e2e

# Validate the API Worker using generic settings, without deploying
npm run check:cloud
```

Playwright starts its own production preview on `5178` by default; set
`PLAYWRIGHT_PORT` to a free port if needed. It disables the production admin bridge
with `FILM_PHOTO_DEV_ADMIN_BRIDGE=0` and uses isolated backend fixtures. Video is
off by default; enable `PLAYWRIGHT_VIDEO=on` only for selected reviews and inspect
the recording. Milestone commands that include the standalone viewer also require
`npm --prefix standalone/model-viewer ci` and its documented browser dependencies.

---

## Tech Stack

- **Framework:** React 18 & TypeScript
- **3D Graphics & Shaders:** Three.js, `@react-three/fiber`, `@react-three/drei`
- **Build Tool:** Vite
- **Testing:** Vitest & Playwright
- **Canvas / Image Processing:** `@napi-rs/canvas`, `pngjs`

### Light table camera angle

In Overview, choose **Adjust view**, then drag horizontally to yaw (±60°)
and vertically to tilt (0–50° from overhead). On desktop, **Shift-drag**
adjusts the angle without entering the mode. Scroll or pinch to zoom.
**Done** or **Escape** returns to normal panning; arrow keys adjust the angle
while the mode is active. **Top-down** resets only the angles, preserving
zoom and pan. Precision sliders are available under **Adjust**; double-click
either slider to reset that axis to 0°.

Frame focus and loupe inspection temporarily use an overhead view; returning
restores the browsing angle and framing. Camera roll remains locked.

Regression coverage: `npm run test:integration -- m18-table-angle` and
`npm run test:e2e -- m18-table-angle` (desktop, touch Chrome, and WebKit).

## App caching and updates

Production app caching and updates are described in [docs/OFFLINE.md](docs/OFFLINE.md).
Guest rolls use browser storage at best effort; there are no backup or storage
protection controls. `npm run validate:m18` runs the production build,
integration tests and cumulative browser regression suite.

## Saved-roll shelf

Click/tap the cabinet, or choose **Film Shelf**, to approach the 4×4 shelf. Each colored
block holds one saved roll: a 35mm cartridge with its single-roll box, or a 120 package, beside a wood-framed
cover photo. Covers follow the saved crop and rotation. Gray packages remain
inactive placeholders. Click/tap a saved block to zoom into its compartment and
open a paper-style roll record beneath it. Close the record or press Escape to
return to the full shelf. Choose **Edit roll** from the record to edit. The editor keeps roll details on
the left, frames at the upper right, and crop/rotation/cover/order controls below.
On phones these sections stack. The roll record offers **Open on light table**,
**Edit roll**, and **Delete roll**; keyboard users can open it with Enter or Arrow Down.
**New roll** opens the same editor with an empty frame workbench: drop or choose
JPEG/PNG scans there, then name the roll, crop and save on one screen. **+ Add
photographs** appends another batch. The editor remembers the last whole-roll film
effect strength as the starting strength for new rolls: guest darkrooms keep it in
this browser, and the owner darkroom stores it on the server. **Trash** shows
deleted rolls on the shelf with Restore; deletion also offers Undo. Additional
pages accommodate more than 16 saved rolls. **Back to room** restores the room view.
**Arrange** (or **Move** on a roll record) rearranges the shelf: tap a roll to lift
it, then tap an empty cubby to move it there or another roll to swap the two. Rolls
can also be dragged; holding one over a page arrow turns the page, and arranging
offers one spare empty page. Keyboard users press Enter to pick up and put down,
arrow keys to choose a cubby, Page Up/Down for pages and Escape to put the roll back
or finish. Each move saves at once and offers Undo. The owner's arrangement also
orders the public gallery shelf.
Dragging over the cabinet in room mode moves the view, just like dragging the room.
Dragging in shelf mode smoothly returns to the room; clicking a saved roll focuses its compartment and opens the details record.
Shelf entry and exit animate for about 0.42 seconds. Navigation stays available
during the flight: drag to return/look around or choose another destination immediately.

Film, cartridges, cartons and frames share a fixed millimeter scale. Packages
have identical dimensions in saved and gray blocks; compact compartments fit
the 143×115.3 mm picture frame, with a 2 mm wood edge and a narrow mat. Film no longer shrinks with roll
length. Carton dimensions are documented nominal envelopes; see the
[dimension audit](public/assets/film-packaging/README.md#physical-scale-and-dimension-audit-2026-09-16).
The photo opening is 105.3 mm tall, one-third taller than a nominal Kodak 120 carton;
wide covers fit within the opening while preserving their saved crop.
Compartments measure 310×135×85 mm. Film packages and cover frames all turn
10° in the same direction, with spacing based on their rotated footprints.
All 35mm cartons use a compact single-roll envelope; Portra 160/400 use authored
single-roll artwork adaptations.

In the guest darkroom, the five-photo example is saved once in slot 01.
Existing rolls shift one slot
when it is first added; their photographs and timestamps are preserved. Editing
or deleting the example persists across reloads. There is no separate archive
grid or built-in-example button. Guest records and photographs stay in this
browser; owner rolls use the cloud gallery.

Real packaging photographs cover Kodak Ektachrome E100, Ektar 100 and Portra
160/400/800, plus Fujifilm Provia 100F, Velvia 50 and Velvia 100, each in 35mm and
120. Fuji uses separate
single-roll and five-roll reference editions, photographed panel mapping, and
green unseen faces. Its 135 cassette labels use separate real photographs with
cylindrical projection correction. See the [packaging manifest and preparation instructions](public/assets/film-packaging/README.md)
and [shelf review record](docs/SHELF_REVIEW.md) for sources and validation.

Roll creation and deletion controls appear only while viewing the film shelf.
**Edit roll** is also available from the light table in Overview or Focus with the
loupe put away, for guest rolls and authenticated owner rolls. Anonymous gallery
visitors cannot edit. The shelf collection panel can be collapsed with **Hide**
and reopened with **Show panel**.
