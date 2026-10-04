# Film & Rebate Specifications Reference Guide

This document describes how film dimensions, sprocket perforations, borders, and rebate markings are specified, modeled, and rendered in **Film Reverie**, how to update existing specifications, and how to add support for new film stocks.

---

## 1. How Film and Borders Are Built

### 1.1 Physical Standards: KS-1870 & ISO 1007

The renderer uses nominal 35mm still-film dimensions and KS-1870 perforation geometry. Factory marking pitches are independent of exposure gates; see [the edge-print sources and calibration limits](FILM_EDGE_PRINTING.md). Typography, cut margins and camera advance gaps remain simulation choices:

| Dimension | Physical Size (mm) | Model Unit (`0.55 / 36`) | World Meters (`mm * 0.0036`) | Source / Standard |
| :--- | :--- | :--- | :--- | :--- |
| **Film Total Width** | $35.000\,\text{mm}$ | $0.534722$ | $0.126000\,\text{m}$ | ISO 1007 |
| **Frame Exposure Width** | $36.000\,\text{mm}$ | $0.550000$ | $0.129600\,\text{m}$ | ISO 1007 (3:2 format) |
| **Frame Exposure Height** | $24.000\,\text{mm}$ | $0.366667$ | $0.086400\,\text{m}$ | ISO 1007 (3:2 format) |
| **Top & Bottom Margins** | $5.500\,\text{mm}$ | $0.084028$ | $0.019800\,\text{m}$ | $\frac{35 - 24}{2} = 5.5\,\text{mm}$ |
| **Inter-Frame Gap** | $3.000\,\text{mm}$ | $0.045833$ | $0.010800\,\text{m}$ | Imported-roll simulation gap; a nominal 38 mm full-frame advance leaves a 2 mm gap |
| **Perforations Per 38 mm Factory Cell** | $8\text{ holes / edge}$ | $8$ | $8$ | KS-1870 ($4.75\,\text{mm}$ pitch) |
| **Sprocket Hole Width** (longitudinal) | $1.981\,\text{mm}$ ($0.0780\,\text{in}$) | $0.030265$ | $0.007132\,\text{m}$ | KS-1870 |
| **Sprocket Hole Height** (transverse) | $2.794\,\text{mm}$ ($0.1100\,\text{in}$) | $0.042686$ | $0.010058\,\text{m}$ | KS-1870 (vertical rectangle) |
| **Sprocket Corner Radius** | $0.508\,\text{mm}$ ($0.020\,\text{in}$) | $0.007761$ | $0.001829\,\text{m}$ | KS-1870 |
| **Outer Perforation Margin** | $2.019\,\text{mm}$ | $0.030846$ | $0.007268\,\text{m}$ | Film edge to outer hole edge |
| **Hole Center Offset** | $\pm 14.0845\,\text{mm}$ | $\pm 0.215180$ | $\pm 0.050704\,\text{m}$ | From film strip centerline |
| **Inner Perforation Margin** | $0.687\,\text{mm}$ | $0.010496$ | $0.002473\,\text{m}$ | Inner hole edge to frame edge |

### 1.2 Coordinate Spaces & Scale Architecture

There are three coordinated spaces used in the engine:

1. **Design / Layout Space (`FilmStripLayout` in [`src/utils/loupeMapping.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/utils/loupeMapping.ts)):**
   - Normalized around nominal frame width $0.55$.
   - Scale conversion unit: `FILM_MODEL_UNIT = 0.55 / 36 = 0.0152777...`
2. **Rebate Texture Design Space ([`src/utils/filmRebateCanvas.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/utils/filmRebateCanvas.ts)):**
   - Canvas raster design space: `3072 x 468` (or `6144 x 936` at 2x).
   - $468\,\text{px}$ corresponds to the full $35.0\,\text{mm}$ film width ($13.37\,\text{px/mm}$).
   - Outer rail margin: $y \in [0, 27]\,\text{px}$ (top text at $y = 13\,\text{px}$).
   - Top sprocket perforations: $y \in [27, 64.4]\,\text{px}$.
   - Inner margin dashes: $y \in [64.4, 73.6]\,\text{px}$.
   - Photo aperture gate: $y \in [73.6, 394.4]\,\text{px}$ (cleared with `clearRect` to show photograph underneath).
   - Bottom inner dashes: $y \in [394.4, 403.6]\,\text{px}$.
   - Bottom sprocket perforations: $y \in [403.6, 441]\,\text{px}$.
   - Bottom outer margin (frame numbers & DX barcodes): $y \in [441, 468]\,\text{px}$.
3. **Physical 3D World Space ([`src/data/physicalScale.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/data/physicalScale.ts)):**
   - `WORLD_UNITS_PER_MM = 0.0036` (1 mm = 0.0036 world meters).
   - `FILM_RENDER_SCALE = WORLD_UNITS_PER_MM / FILM_MODEL_UNIT = 0.235636...`
   - Strips on the light table are rendered inside a `<group scale={strip.scale}>` where `strip.scale = BASELINE_ROLL.scale = FILM_RENDER_SCALE`.
   - In 3D space, $35\,\text{mm}$ film is $35 \times 0.0036 = 0.126\,\text{m}$ tall.

### 1.3 Perforated Mesh Geometry

In [`src/components/FilmStrip.tsx`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/components/FilmStrip.tsx):
- `THREE.Shape` defines the outer boundary with lab guillotine sheared ends.
- `getPerforationPositions` places holes every 4.75 mm along cumulative film length, including cut margins, independently of image widths or strip grouping.
- `shape.holes` punches each sprocket perforation using `createRoundedRectPath(p.x, p.y, SPROCKET_WIDTH, SPROCKET_HEIGHT, SPROCKET_CORNER_RADIUS)`.
- The geometry is bent along its transverse axis using `curveFilmSubstrate` to simulate natural film curl (`FILM_CURL_HEIGHT = 0.0018`).
- The light table shines directly through the cutouts, exposing genuine light transmission.

### 1.4 Rebate Artwork & DX Edge Code Barcodes

In [`src/utils/filmRebateCanvas.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/utils/filmRebateCanvas.ts):
Factory cells are placed by `filmEdgeRepeats`; `{frameNum}` is a factory index, never the photo array index. Integer / `A` positions repeat at 38 / 19 mm across strip cuts.

- **Color Negatives (`type: "negative"`)**:
  - **Upper Outer Rail**: Stock legends use fixed physical repeats, independently of photo gates. Numbering stays on the lower rail to avoid collisions with the separate legend rhythm.
  - **Inner Margins**: Latent registration dashes centered between every pair of sprocket holes.
  - **Lower Outer Rail**:
    - Hole 0: Full-frame number (`{frameNum}`).
    - Holes 1–3: DX Barcode Block 1 containing manufacturer and stock identification bits (`STOCK_DX_BITS`).
    - Hole 4: Half-frame number with solid advance arrow (`► {frameNum}A`).
    - Holes 5–7: DX Barcode Block 2 containing 7-bit binary frame identification and parity check (`getFrameDXBits(frameNum)`).
    - Barcode structure: continuous bottom baseline rail, 3-finger start sync mark, half/full-height data clock bars, and 3-finger stop sync mark.
- **Reversal Slide Film (`type: "reversal"`, e.g. Ektachrome E100)**:
  - Clean cream lettering (`#d7ccb0`) on dark transparent substrate (`rgba(24, 22, 27, 0.99)`).
  - No optical barcode tracks, matching authentic processed E-6 slides.
- **120 Medium Format (`perforated === false`)**:
  - Handled by [`src/utils/film120Rebate.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/utils/film120Rebate.ts). Continuous unperforated 61mm substrate. Kodak uses nominal 45.5 / 60.667 mm dual number tracks; Fujichrome uses an approximately 43 mm single upper track. These profiles apply to all 645, 66, 67, 69 and free-size gates, with the evidence limits recorded in [FILM_EDGE_PRINTING.md](FILM_EDGE_PRINTING.md).

---

## 2. How to Update Specifications

If reference research indicates an update is needed, follow these steps:

### 2.1 Updating Dimensions or Perforation Geometry

1. **Nominal Layout Constants (`src/utils/loupeMapping.ts`)**:
   ```ts
   export const DEFAULT_LAYOUT: FilmStripLayout = {
     frameCount: 5,
     frameWidth: 0.55,
     frameHeight: 0.366667, // 24mm * (0.55 / 36)
     gap: 0.04,
     marginX: 0.08,
     marginY: 0.084028,     // 5.5mm * (0.55 / 36)
   };

   export const SPROCKET_WIDTH = 0.030265;         // 1.981mm * (0.55 / 36)
   export const SPROCKET_HEIGHT = 0.042686;        // 2.794mm * (0.55 / 36)
   export const SPROCKET_CORNER_RADIUS = 0.007761; // 0.508mm * (0.55 / 36)
   ```
2. **Perforation Center Placement (`src/utils/loupeMapping.ts` -> `getPerforationPositions`)**:
   ```ts
   const unit = 0.55 / 36;
   // Sits 3.4155mm from the outer edge (2.019mm outer margin + 2.794/2 mm half hole height)
   const topY = height / 2 - 3.4155 * unit;
   const bottomY = -height / 2 + 3.4155 * unit;
   ```
3. **Format Declarations (`src/data/filmFormats.ts`)**:
   Update `FILM_FORMATS['135']` (e.g. `width: 36, height: 24, filmWidth: 35`).

### 2.2 Updating Edge Markings or Barcodes

In [`src/utils/filmRebateCanvas.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/utils/filmRebateCanvas.ts):
* **Barcode bits**: Update `STOCK_DX_BITS` dictionary:
  ```ts
  const STOCK_DX_BITS: Record<string, readonly number[]> = {
    "portra-400": [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1],
    "ektar-100":  [1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1],
    // ...
  };
  ```
* **Barcode appearance**: Modify `drawDXBarcodeBlock()` (line height, sync patterns, bar width).
* **Physical pitch / manufacturer track**: Update `src/data/filmEdgePrinting.ts` and the reference record in `FILM_EDGE_PRINTING.md`; preserve `filmLengthOffset` continuity.
* **Text baseline / positions**: Modify `paintRebate()` or `draw120Rebate()` without coupling positions to image boundaries.

### 2.3 Updating Associated Tests

When updating dimensions:
1. Update unit assertions in [`tests/integration/m3-film-realism.test.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/tests/integration/m3-film-realism.test.ts).
2. Update sampling coordinates in [`tests/e2e/m3-film-realism.spec.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/tests/e2e/m3-film-realism.spec.ts) (e.g. sprocket hole sample at $y = 324$ vs unperforated substrate at $y = 324$).
3. In macro zoom tests ([`tests/e2e/m9-film-stocks.spec.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/tests/e2e/m9-film-stocks.spec.ts)), always use physical world units:
   ```ts
   const stripHeight = 35 * 0.0036; // 0.126m in 3D world coordinates
   ```

---

## 3. How to Support a New Film Stock

Follow this checklist to introduce a new film stock (e.g., Kodak Tri-X 400, Fuji Velvia 50, Cinestill 800T):

Film type availability is enforced by `supportsFilmFormat` in the roll editors and
shared save/import/publication validation. Add packaging only for the film types
listed in the profile; every 120 gate uses the same `"120"` packaging entry.

### Step 1: Create the Stock Profile JSON
Create `public/assets/film-stocks/<stock-id>.json` (modeled after [`public/assets/film-stocks/portra-400.json`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/public/assets/film-stocks/portra-400.json) or [`public/assets/film-stocks/ektachrome-e100.json`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/public/assets/film-stocks/ektachrome-e100.json)):
```json
{
  "id": "my-stock",
  "displayName": "My Film Stock Name",
  "type": "negative", // or "reversal"
  "process": "C-41",  // or "E-6", "B&W"
  "allowedViews": ["negative", "positive"],
  "formats": ["135", "120"], // Use only ["135"] for 35mm-only stocks
  "base": {
    "substrateBase": "rgba(217, 119, 36, 0.88)", // Base film acetate color & opacity
    "rebateText": "rgba(70, 30, 10, 0.95)",       // Edge lettering color
    "rebateSecondary": "rgba(100, 45, 15, 0.70)",  // Timing / sync code color
    "frameShadow": "rgba(50, 20, 6, 0.35)",
    "negativeMask": [0.88, 0.46, 0.18]            // Orange mask normalization vector
  },
  "rebate": {
    "label": "KODAK MY-STOCK",
    "font": "Arial, Helvetica, sans-serif",
    "fontWeight": "bold",
    "orientation": "same-direction",
    "halfFrameNumbers": true,
    "codePattern": null
  },
  "reference": {
    "edition": "Production batch description",
    "title": "Reference scan description",
    "url": "https://...",
    "accessed": "YYYY-MM-DD",
    "license": "Fair use study only; runtime artwork is original ISC.",
    "limitations": "Notes on any approximations"
  }
}
```

### Step 2: Register in Film Stocks Data Module
In [`src/data/filmStocks.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/data/filmStocks.ts):
1. Import the JSON:
   ```ts
   import my_stock from "../../public/assets/film-stocks/my-stock.json" with { type: "json" };
   ```
2. Add to the `FILM_STOCKS` array:
   ```ts
   export const FILM_STOCKS = [
     ektachrome_e100,
     ektar_100,
     portra_160,
     portra_400,
     portra_800,
     my_stock,
   ] as readonly FilmStockProfile[];
   ```
3. Update `FilmStockId` type if explicitly enumerated.

### Step 3: Register DX Barcode Pattern (Negative Stocks Only)
In [`src/utils/filmRebateCanvas.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/utils/filmRebateCanvas.ts):
Add the stock's 15-bit binary DX code into `STOCK_DX_BITS`:
```ts
const STOCK_DX_BITS: Record<string, readonly number[]> = {
  "my-stock": [1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0],
  // ...
};
```

### Step 4: Configure Shader Look & Curve Profile
1. In [`src/shaders/filmLook.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/shaders/filmLook.ts):
   - Add stock color curves, dye transmission response, or gamut tuning.
2. In [`src/components/FilmStrengthControl.tsx`](file:///Users/zhangzimou/orca/workspaces/film_photo/infra/src/components/FilmStrengthControl.tsx):
   - Add user-facing description in `FILM_LOOKS`:
     ```ts
     "my-stock": { description: "Brief visual characteristic description" }
     ```

### Step 5: Verification & Validation
Run the full test suites:
```bash
# 1. Verify build and packaging
npm run build

# 2. Verify all integration tests
npm run test:integration

# 3. Verify e2e tests across all stocks
# Note: m9-film-stocks iterates over all registered FILM_STOCKS automatically
PLAYWRIGHT_PORT=5180 PLAYWRIGHT_STATIC_PREVIEW=1 npm run test:e2e -- m9-film-stocks
```
