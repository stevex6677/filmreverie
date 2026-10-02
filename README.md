# Film Reverie

An immersive 3D darkroom and illuminated light table experience for inspecting 35mm and 120 medium-format film in the browser.

Built with **React 18**, **Three.js**, and **React Three Fiber**.

The vertical three-dot menu offers **Layout → Auto / Desktop** in owner and guest
darkrooms. Auto adapts to screen width and touch input; Desktop overrides that
choice. The preference is remembered in this browser.
Desktop and mobile room headers share the same styling. **Lights** opens room
lighting controls; desktop room navigation actions are also available there.
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
Eleven film stocks with distinct adjustable color/grain effects and procedural edge markings:
- **Kodak Portra 160, 400, and 800:** Fine grain, true orange mask normalization, and dual-track edge cadence.
- **Kodak Ektar 100:** Ultra-vivid color negative emulsion with high-contrast edge branding.
- **Fujifilm 200 and Kodak Pro Image 100:** 35mm only; vivid greens and balanced portrait color respectively.
- **Kodak Gold 200:** 35mm and 120, with warm color and classic grain.
- **Fujifilm Provia 100F and Velvia 50/100:** Color reversal stocks in 35mm and 120.
- **Kodak Ektachrome E100:** Reversal slide film with neutral clear base and positive-only viewing.

For complete physical standards (KS-1870 / ISO 1007), coordinate spaces, modification instructions, and how to add new stocks, see [docs/FILM_SPECS.md](docs/FILM_SPECS.md).

### 3. Physical Loupe & Optical Magnification
- **Tactile Inspection Loupe:** Drag to inspect fine film grain and edge markings across frames.
- **Magnification Modes:** Discrete presets (2×, 4×, 8×) and keyboard adjustment up to 10×.
- **Loupe Styles & Sizes:** Choose the classic optical barrel or a clear glass hemisphere, each in Small, Medium or Large. Open Loupe settings to expand a single dock containing style, size, magnification and optical effects. Drag the loupe or explore its lens while settings stay open; Done or Escape collapses the dock. The glass hemisphere preserves transmitted colors without simulated reflections or a cloudy tint. Size changes the viewing area independently of magnification. Style and size are remembered across rolls and visits.

### 4. Flexible Roll Sizing & Multi-Format Support
- **Film Formats:** Support for **35mm** (36 × 24 mm) and **120 medium format** (6×4.5, 6×6, 6×7, 6×9).
- **Free-Sizing Mode:** Retains each image's native aspect ratio along a shared film height (24 mm for 35mm, 56 mm for 120).
- **Film Advance & Capacity:** Dynamic film span metering with a 230 mm strip-wrapping layout that scales to fit the table.
- **Multi-Device Navigation:** Responsive controls designed for mouse/keyboard on desktop and fluid touch gestures (pinch-to-zoom, pan, swipe) on iPad and mobile.

### 5. Standalone 3D Model Viewer
An isolated, reusable 3D model viewer module located in [`standalone/model-viewer/`](standalone/model-viewer/) for inspecting hardware models (such as the Mamiya Universal Press camera) with 360° rotation, preset views, and studio lighting.

For current and historical file locations, see the [model version index](blender/MODEL_HISTORY.md), including the editable master to open for future changes.

Current model deliveries: [Mamiya Universal](blender/mamiya_universal/CURRENT.json) and [Minolta Autocord](blender/autocord/CURRENT.json). These records identify the editable masters, GLB exports, reference refinements, renders, checksums and stable viewer links. The Autocord retains the original Tripo body and optics, with localized strap removal, front/side/rear inscription repairs, continuous side-panel enamel, and a reference-reconstructed underside with a threaded tripod mount and rounded feet. Its latest front pass clarifies both lens inscriptions, the CITIZEN-MVL shutter/EV markings, and the metric/feet focusing scales; only shallow false shutter-letter relief is leveled. An earlier non-destructive browser derivative reduced its delivery from 105.7 MB and 1.78 million triangles to 20.0 MB and 396 thousand triangles while preserving the accepted master and full-detail GLB. Its reproducible Blender CLI pipeline is under [`blender/autocord/`](blender/autocord/).

[Olympus OM-1 current delivery](blender/olympus_om1/CURRENT.json) adds reference-corrected lettering, top controls and underside hardware, with smoother metal surfaces and a browser GLB below 10 MB. See its [reproduction guide](blender/olympus_om1/README.md) and open `/?model=olympus-om1` in the standalone viewer.

The [Canon Demi EE17 delivery](blender/canon_demi_ee17/CURRENT.json) applies localized corrections from the supplied front, top, bottom and back photographs, including the shoulder and `top2.HEIC` lettering/band corrections. Its retained 8.28 MB compact GLB preserves all master triangles. The standalone catalog at `/?model=canon-demi-ee17` now uses the smaller detail derivative listed in the version index. A separate lightweight derivative is mounted in the Web App cabinet at the owner's specified **11.6 cm width**, with uniform proportions and no change to the accepted master or GLB. See [its reproduction notes](blender/canon_demi_ee17/README.md).

The [Canon 7s delivery](blender/canon7s/CURRENT.json) preserves the supplied Tripo body and optics while restoring the Voigtländer lens inscription, rear manufacturer/serial engraving, and top logo, shutter dial, meter window and control markings. Its surface pass smooths the metal housing, bottom trim and lens bezel while retaining leather grain, lettering and knurled grips. The underside pass follows `bottom.HEIC`: a slotted cap, open 1/4-20 threaded tripod socket, recessed circular latch and two slotted screws. It leaves the parent vertex coordinates and retained-face UVs, colors and encoded normals unchanged; only local underside faces are removed for the recesses. The socket's hidden depth is an estimate, recorded separately from its nominal thread dimensions. Its packed Blender master, full-detail GLB, compact browser derivative and CUDA review renders live under shared `ignored_generated/blender/canon7s/`. Builders and verification are under `blender/canon7s/`; the standalone viewer uses `/?model=canon-7s`. A separate lightweight derivative is mounted in the Web App cabinet at the requested **13.8 cm width**, without rescaling the editable master.

### 6. Camera Collection
The room starts from its center. Its 90 cm, two-tier camera cabinet matches the film cabinet's height and replaces the right-wall chemistry shelf. The complete developing bench, chemicals and drying equipment sit beside the door, where the box shelf was removed. The camera cabinet sits closer to the light table and displays the current Mamiya Universal, Minolta Autocord, Canon Demi EE17, Canon 7s and Olympus OM-1 on its upper tier at their respective 21 cm, 8.4 cm, 11.6 cm, 13.8 cm and 13.6 cm physical widths. Five upper positions provide clearance for the cameras without changing their scale. Three film boxes and two cartridges occupy the lower tier. The cabinet uses separate lightweight models, with preserved lettering and materials on Mamiya; after the room is ready, detailed models below 5 MB preload sequentially in the background for inspection. Startup waits for every cabinet model to load successfully, with retry for failed models. Select **Camera Cabinet** for a tightly framed cabinet-only view, then any camera to inspect every side with rotation, zoom, pan and directional presets. Detailed camera models load when inspected; lightweight cabinet models and the compressed-model decoder are included in the required offline shell. See [mobile model delivery](blender/MOBILE_MODELS.md) and [camera shelf review](docs/CAMERA_SHELF_REVIEW.md) for validation and remaining acceptance work; asset preparation verifies each camera's `CURRENT.json` against the shared viewer catalog.

### 7. Public Gallery and Guest Darkroom
The home page (`/`) displays only owner-published cloud rolls on the physical
darkroom shelf. Browsing needs no account; visitors cannot add, edit or delete
rolls there. Its room header shares the guest darkroom's controls; **Create Your Own**
sits after **Lights**, followed by a vertical three-dot menu.
The menu shows **Admin Login** until authenticated, then **Logged in**. Admins use
the same shelf and roll editor as guests: **New roll**, edit, delete, Trash and
Undo. **Save and open** publishes the reviewed roll; deletion withdraws it from
the gallery and retains it in cloud Trash; restoration republishes it. Cloudflare
Access JWT verification, short-lived key-scoped direct R2 uploads of browser-re-encoded
JPEG derivatives (never originals), versioned R2 catalog publication and withdrawal
live in `cloudflare/`. Admin performs metadata removal locally before uploading;
the Worker does not decode image content. Hosted Cloudflare Free CPU/subrequest
measurements are pending account setup.

**Create Your Own** opens `/guest?welcome=1` in a new tab and shows the guest
introduction on every click; direct `/guest` visits show it only until dismissed.
The guest darkroom starts with one removable example roll. Add, edit and delete
rolls in film shelf mode. Guest rolls stay in the browser's `darkroom-guest-rolls`
database at best effort, without accounts, uploads or synchronization. Guest
backup, migration and offline/storage controls are not offered. Earlier
`darkroom-rolls` libraries remain untouched.

**The API Worker is deployed. Current menu and shared roll editor changes remain local; they have not been published to Pages.** See
[deployment/privacy/recovery instructions](docs/CLOUD_GALLERY.md) and
[M21 validation and blockers](docs/M21_REVIEW.md).
Pushes to GitHub `master` can deploy both the API Worker and website through
the [automatic deployment workflow](docs/AUTO_DEPLOY.md), after its dedicated
Cloudflare token and private deployment configuration secrets are configured.
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
**Drying Line** (each strip becomes a line of prints hung in the darkroom) or
**Documentary** (each photograph fills the screen, drifting and dissolving). Each reel has
an establishing shot, a frame-by-frame tour with overview breaks at strip
boundaries, and a closing shot, at Relaxed, Normal or Brisk pace; reduced motion
uses slow cuts instead of fast moves, blur and flicker. Each reel also has two
settings of its own (for example Distance and Depth of field for Tracking Shot,
Gate weave and Lamp flicker for Projector, Drift and Dissolve for Documentary).
Tracking Shot, Darkroom, Orbit and Drying Line render with depth of field,
focused on the camera's subject. Preview supports
play/pause, previous/next frame, tap to pause and exit; exiting restores the table
exactly, and screening never writes rolls or saved views.

The settings include the same five CC0 music tracks as `/showreel`, with tap-to-preview selection,
volume and No music controls. Music plays with the preview and is included in
exports, looping for long rolls and fading at the start and end. The five tracks
are included in offline preparation. No music remains the default. If the browser
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
An unlinked page plays a one-minute, 16:9 promotional film of the app, rendered
live from code: the light table switching on as a band of light develops the
negatives, the title over the room, the darkroom's wet side, the film shelf,
excerpts of the Tracking Shot and Orbit reels, the loupe on the edge printing,
the photographs through the Documentary, Drying Line and Projector reels, and
the camera cabinet, ending on a card with filmreverie.app
and the GitHub link. Titles, captions, light leaks, grain and camera labels are
drawn over the scene. The page is public to anyone with the URL, is marked
`noindex`, and is not part of the offline download.

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
shared `ignored_assets/music/showreel/` and publishes 70 second excerpts to
`public/assets/music/showreel/`.

The film shows two bundled sample rolls: **Golden Coast** (Kodak Portra 400,
35mm, 12 frames) and **High Country** (Kodak Ektar 100, 120 6×6, 6 frames).
Their CC0 photographs from Unsplash, via Wikimedia Commons, are listed with
credits in [`src/data/showreelRolls.json`](src/data/showreelRolls.json). To use
other photographs, edit that file and run `npm run fetch:showreel -- --publish`.
This stores pinned originals read-only in shared `ignored_assets/photos/showreel/`
and publishes 2048 px sRGB derivatives to `public/assets/photos/showreel/`.

Before playback the page renders the whole film once behind its loading screen
(a pre-roll), so shaders compile and textures upload before the first shot.
Query options: `t=12.5` starts at a moment, `paused=1` holds it (skipping the
settings), `clean=1` skips the settings and controls for screen recording, and
`size=1920x1080` fixes the stage size. Keyboard: Space plays or pauses, ←/→
seek (Shift for 5 s), H hides the controls and F toggles full screen. The code
is in [`src/showreel/`](src/showreel/).

---

## Getting Started

### Prerequisites
- **Node.js:** Node 24 LTS recommended. Installed Vite 8 requires Node `^20.19.0 || >=22.12.0`; the Vitest 5 test suite requires `^22.12.0 || ^24.0.0 || >=26.0.0`. Node 18 is unsupported.
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

```bash
# Start the development server
npm run dev

# Open the localhost URL printed by Vite (normally http://localhost:5173).
```

### Production Build

```bash
# Build the optimized production bundle
npm run build

# Preview the production build locally
npm run preview
```

`prepare:assets`, run automatically by development and build, validates published
runtime assets and prepares the bundled Draco decoder from Three.js. It does not
regenerate photo/model source media or require Blender, `ffmpeg` or `sips`.

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

# Run end-to-end browser tests (Playwright)
npm run test:e2e
```

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

The five-photo example is saved once in slot 01. Existing rolls shift one slot
when it is first added; their photographs and timestamps are preserved. Editing
or deleting the example persists across reloads. There is no separate archive
grid or built-in-example button. All records and photographs stay in this browser.

Real packaging photographs cover all five supported Kodak stocks plus Fujifilm
Provia 100F, Velvia 50 and Velvia 100, each in 35mm and 120. Fuji uses separate
single-roll and five-roll reference editions, photographed panel mapping, and
green unseen faces. Its 135 cassette labels use separate real photographs with
cylindrical projection correction. See the [packaging manifest and preparation instructions](public/assets/film-packaging/README.md)
and [shelf review record](docs/SHELF_REVIEW.md) for sources and validation.

Roll creation and deletion controls appear only while viewing the film shelf.
