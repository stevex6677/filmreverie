# Film Reverie

An immersive 3D darkroom and illuminated light table experience for inspecting 35mm and 120 medium-format film in the browser.

Built with **React 18**, **Three.js**, and **React Three Fiber**.

---

## Features

### 1. 3D Darkroom & Illuminated Light Table
- **Interactive 3D Space:** Explore the virtual darkroom with intuitive look-around and approach navigation.
- **Physical Light Table:** Continuous dimmer controls, diffuse backlight transmission, and dynamic room lighting.
- **Whole-Strip Inversion:** Toggle between negative and positive modes across the entire physical strip, including borders, sprockets, and manufacturer markings.

### 2. Authentic Film Stocks & Rebate Markings
Faithfully modeled film characteristics, color gamuts, and edgeprints for five classic emulsions:
- **Kodak Portra 160, 400, and 800:** Fine grain, true orange mask normalization, and dual-track edge cadence.
- **Kodak Ektar 100:** Ultra-vivid color negative emulsion with high-contrast edge branding.
- **Kodak Ektachrome E100:** Reversal slide film with neutral clear base and positive-only viewing.

For complete physical standards (KS-1870 / ISO 1007), coordinate spaces, modification instructions, and how to add new stocks, see [docs/FILM_SPECS.md](docs/FILM_SPECS.md).

### 3. Physical Loupe & Optical Magnification
- **Tactile Inspection Loupe:** Drag to inspect fine film grain and edge markings across frames.
- **Magnification Modes:** Discrete presets (2.5x, 4x, 8x) and continuous optical macro zoom up to 1000%.
- **Fixed-Size Optical Barrel:** Authentic glass shading, feathered reflections, and distortion.

### 4. Flexible Roll Sizing & Multi-Format Support
- **Film Formats:** Support for **35mm** (36 × 24 mm) and **120 medium format** (6×4.5, 6×6, 6×7, 6×9).
- **Free-Sizing Mode:** Retains each image's native aspect ratio along a shared film height (24 mm for 35mm, 56 mm for 120).
- **Film Advance & Capacity:** Dynamic film span metering with a 230 mm strip-wrapping layout that scales to fit the table.
- **Multi-Device Navigation:** Responsive controls designed for mouse/keyboard on desktop and fluid touch gestures (pinch-to-zoom, pan, swipe) on iPad and mobile.

### 5. Standalone 3D Model Viewer
An isolated, reusable 3D model viewer module located in [`standalone/model-viewer/`](standalone/model-viewer/) for inspecting hardware models (such as the Mamiya Universal Press camera) with 360° rotation, preset views, and studio lighting.

Current model deliveries: [Mamiya Universal](blender/mamiya_universal/CURRENT.json) and [Minolta Autocord](blender/autocord/CURRENT.json). These records identify the editable masters, GLB exports, reference refinements, renders, checksums and stable viewer links. The Autocord retains the original Tripo body and optics, with localized strap removal, front/side/rear inscription repairs, continuous side-panel enamel, and a reference-reconstructed underside with a threaded tripod mount and rounded feet. Its latest front pass clarifies both lens inscriptions, the CITIZEN-MVL shutter/EV markings, and the metric/feet focusing scales; only shallow false shutter-letter relief is leveled. A non-destructive browser derivative reduces its delivery from 105.7 MB and 1.78 million triangles to 20.0 MB and 396 thousand triangles while preserving the accepted master and full-detail GLB. Its reproducible Blender MCP pipeline is under [`blender/autocord/`](blender/autocord/).

The [Canon 7s delivery](blender/canon7s/CURRENT.json) preserves the supplied Tripo body and optics while restoring the Voigtländer lens inscription, rear manufacturer/serial engraving, and top logo, shutter dial, meter window and control markings. Its surface pass smooths the metal housing, bottom trim and lens bezel while retaining leather grain, lettering and knurled grips. The underside pass follows `bottom.HEIC`: a slotted cap, open 1/4-20 threaded tripod socket, recessed circular latch and two slotted screws. It leaves the parent vertex coordinates and retained-face UVs, colors and encoded normals unchanged; only local underside faces are removed for the recesses. The socket's hidden depth is an estimate, recorded separately from its nominal thread dimensions. Its packed Blender master, full-detail GLB, compact browser derivative and CUDA review renders live under shared `ignored_generated/blender/canon7s/`. Builders and verification are under `blender/canon7s/`; the standalone viewer uses `/?model=canon-7s`. The same compact asset is mounted in the Web App cabinet at the requested **13.8 cm width**, without rescaling the editable master.

### 6. Camera Collection
The room starts from its center. Its 90 cm, two-tier camera cabinet matches the film cabinet's height and replaces the right-wall chemistry shelf. The complete developing bench, chemicals and drying equipment sit beside the door, where the box shelf was removed. The camera cabinet sits closer to the light table and displays the current Mamiya Universal, Minolta Autocord and Canon 7s on its upper tier at their respective 21 cm, 8.4 cm and 13.8 cm physical widths. New cameras are added through the shared model catalog and automatically receive the next eye-level cabinet position. Three film boxes and two cartridges occupy the lower tier, leaving the upper camera slots clear. Shelf rendering batches static meshes and uses economical lens reflections; inspection retains detailed optical materials. Select **Cameras** for a tightly framed cabinet-only view, then any camera to inspect every side with rotation, zoom, pan and directional presets. Camera downloads are optional in **Backups & offline**. See [camera shelf review](docs/CAMERA_SHELF_REVIEW.md) for validation and remaining acceptance work; asset preparation verifies each camera's `CURRENT.json` against the shared viewer catalog.

---

## Getting Started

### Prerequisites
- **Node.js:** v18 or newer
- **npm:** v9 or newer

### Installation

```bash
git clone https://github.com/stevex6677/filmreverie.git
cd filmreverie
npm install
```

### Running Locally

```bash
# Start the development server
npm run dev

# Open http://localhost:5173 in your browser
```

### Production Build

```bash
# Build the optimized production bundle
npm run build

# Preview the production build locally
npm run preview
```

---

## Testing

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

## Offline app and roll backups (M18)

Production offline preparation, safe updates, and portable browser-local roll backups
are described in [docs/OFFLINE.md](docs/OFFLINE.md). Export from the exact old
address before importing at a new HTTPS origin. `npm run validate:m18` runs the
production build, integration tests, and cumulative browser regression suite.
Physical iPhone/iPad Safari and Home Screen review remains a separate acceptance gate.

## Saved-roll shelf

Click/tap the cabinet, or choose **Rolls**, to approach the 4×4 shelf. Each colored
block holds one saved roll: a 35mm cartridge with its single-roll box, or a 120 package, beside a wood-framed
cover photo. Covers follow the saved crop and rotation. Gray packages remain
inactive placeholders. Click/tap a saved block to edit its roll. The editor keeps roll details on
the left, frames at the upper right, and crop/rotation/cover/order controls below.
On phones these sections stack. Hover (or focus and press Arrow Down) for a
preview card with **Open on light table**, **Edit roll**, and **Delete roll**. **New roll** opens the photograph importer. **Trash** shows
deleted rolls on the shelf with Restore; deletion also offers Undo. Additional
pages accommodate more than 16 saved rolls. Back to room/Escape restores the room view.
Dragging over the cabinet in room mode moves the view, just like dragging the room.
Dragging in shelf mode smoothly returns to the room; clicking a saved roll still opens its editor.
Shelf entry and exit animate for about 0.42 seconds. Navigation stays available
during the flight: drag to return/look around or choose another destination immediately.

Film, cartridges, cartons and frames share a fixed millimeter scale. Packages
have identical dimensions in saved and gray blocks; compact compartments fit
the 143×115.3 mm picture frame, with a 2 mm wood edge and a narrow mat. Film no longer shrinks with roll
length. Carton dimensions are documented nominal envelopes; see the
[dimension audit](public/assets/film-packaging/README.md#physical-scale-and-dimension-audit-2026-09-16).
The photo opening is 105.3 mm tall, one-third taller than a 120 carton;
wide covers fit within the opening while preserving their saved crop.
Compartments measure 310×135×85 mm. Film packages and cover frames all turn
10° in the same direction, with spacing based on their rotated footprints.
All 35mm cartons use a compact single-roll envelope; Portra 160/400 use authored
single-roll artwork adaptations.

The five-photo example is saved once in slot 01. Existing rolls shift one slot
when it is first added; their photographs and timestamps are preserved. Editing
or deleting the example persists across reloads. There is no separate archive
grid or built-in-example button. All records and photographs stay in this browser.

Real packaging photographs cover all five supported Kodak stocks in 35mm and
120. See the [packaging manifest and preparation instructions](public/assets/film-packaging/README.md)
and [shelf review record](docs/SHELF_REVIEW.md) for sources and validation.

Use **Backups & offline** on the shelf for all-roll or selected-roll export,
backup import, offline preparation and storage protection.
