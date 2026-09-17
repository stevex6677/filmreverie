# Film Filter References & Evaluation Baseline

This folder serves as the reference benchmark for the film simulation filters in the darkroom film viewer. It contains **5 diverse real-world photographic scenes**, each processed through all **5 film stock filters** at their default authored strength (`strength = 50`), along with side-by-side comparison sheets, the standalone test tool, and technical documentation.

---

## 1. Quick Visual Overview

All reference images are 1200×800 (standard 3:2 35mm film aspect ratio, 36×24mm gate).

* **Master Grid**: [`all_filters_comparison.jpg`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/film_filter_references/all_filters_comparison.jpg) — Full 5×6 matrix comparing all 5 scenes across all 5 film stocks against the originals.
* **Scene Comparison Sheets**:
  * Sunny: [`01_sunny_comparison.jpg`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/film_filter_references/01_sunny_comparison.jpg)
  * Cloudy / Overcast: [`02_cloudy_comparison.jpg`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/film_filter_references/02_cloudy_comparison.jpg)
  * Rainy: [`03_rainy_comparison.jpg`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/film_filter_references/03_rainy_comparison.jpg)
  * Sunset / Golden Hour: [`04_sunset_comparison.jpg`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/film_filter_references/04_sunset_comparison.jpg)
  * Portrait: [`05_portrait_comparison.jpg`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/film_filter_references/05_portrait_comparison.jpg)

---

## 2. Standalone Film Filter CLI Tool (`scripts/apply-filter.mjs`)

A dedicated script is provided to apply any film filter directly to any image on disk:

```bash
node scripts/apply-filter.mjs <input-image> <film-stock> [output-image] [strength]
```

### Options & Flags
* `<input-image>` / `-i, --input <path>`: Source image file (`.jpg`, `.png`, etc.).
* `<film-stock>` / `-s, --stock <name>`: Target film stock ID or alias.
* `[output-image]` / `-o, --output <path>`: Optional destination path (defaults to `<input>_<stock>.jpg`).
* `[strength]` / `--strength <0-100>`: Filter intensity, from `0` (bypass) to `100` (max emphasis). Default is `50`.

### Supported Film Stocks & Aliases
| Film Stock ID | Aliases | Emulsion Description |
| :--- | :--- | :--- |
| `portra-160` | `160`, `portra160` | Kodak Portra 160 (Soft pastel colors, gentle highlights, very fine grain) |
| `portra-400` | `400`, `portra400` | Kodak Portra 400 (Natural warmth, balanced midtones, fine organic grain) |
| `portra-800` | `800`, `portra800` | Kodak Portra 800 (Rich tones, amber cast in low light, distinct grain) |
| `ektar-100` | `ektar`, `100`, `ektar100` | Kodak Ektar 100 (Ultra-vivid colors, high contrast, crisp sapphire blues) |
| `ektachrome-e100`| `e100`, `ektachrome` | Kodak Ektachrome E100 (E-6 slide film, brilliant whites, deep inky blacks) |

### CLI Usage Examples
```bash
# 1. Quick test using default strength (50) and auto output path:
node scripts/apply-filter.mjs photo.jpg portra-400
# -> Writes photo_portra-400.jpg

# 2. Specify explicit output path:
node scripts/apply-filter.mjs sunset.jpg ektar-100 output.jpg

# 3. Custom strength (e.g. 75):
node scripts/apply-filter.mjs portrait.jpg portra-160 portrait_160_strong.jpg 75

# 4. Using named flags:
node scripts/apply-filter.mjs --input street.jpg --stock portra-800 --output graded.jpg --strength 60
```

---

## 3. The 5 Reference Scenes

| File | Scene Name | Lighting & Aesthetic | Purpose |
| :--- | :--- | :--- | :--- |
| `01_sunny.jpg` | **Sunny Daylight** | Bright direct sun, clear blue sky, fluffy clouds, wooden pier with strong directional shadows. | Tests high dynamic range, sky rendering, wood grain texture, shadow contrast. |
| `02_cloudy.jpg` | **Cloudy / Overcast** | Diffuse overcast mist, winding road through dense pine forest, cool neutral sky, damp asphalt. | Tests low-contrast tonal separation, dark foliage greens, subtle gradient roll-off. |
| `03_rainy.jpg` | **Rainy Evening** | Raindrops on glass window, wet reflections, dark ambient street, bright vehicle taillights and bokeh. | Tests night/darkroom performance, light bloom around bokeh, deep shadow noise. |
| `04_sunset.jpg` | **Sunset Golden Hour** | Low setting sun, intense warm golden backlight, lens flare, back-lit silhouette. | Tests warm highlight handling, flare roll-off, extreme warm color grading. |
| `05_portrait.jpg` | **Portrait Natural Light** | Soft directional daylight, delicate skin tones, red lipstick, fine curly hair, neutral background. | **Critical test for Portra films**: tests skin tone fidelity, highlight roll-off on skin. |

---

## 4. Film Stock Characteristics & Tuned Profiles

The filter profiles live in [`src/data/filmLooks.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/src/data/filmLooks.ts) and run through the WebGL shader [`src/shaders/filmLook.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/src/shaders/filmLook.ts).

### Tuned Profile Parameters (Default Strength `50`)

| Film Stock | Contrast | Shadows / Highlights | Saturation | Color Tint `[R, G, B]` | Grain (Amp / Density) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Portra 160** | `0.90` (-10%) | `+0.040` / `-0.160` | `0.88` (-12%) | `[+0.025, -0.006, -0.016]` | `0.014` @ 55/mm |
| **Portra 400** | `0.93` (-7%)  | `+0.030` / `-0.120` | `0.94` (-6%)  | `[+0.030, -0.008, -0.020]` | `0.022` @ 45/mm |
| **Portra 800** | `1.06` (+6%)  | `+0.015` / `-0.080` | `1.08` (+8%)  | `[+0.035, -0.006, -0.025]` | `0.032` @ 35/mm |
| **Ektar 100**  | `1.18` (+18%) | `-0.010` / `-0.040` | `1.28` (+28%) | `[+0.020, +0.010, +0.035]` | `0.010` @ 65/mm |
| **E100 Slide** | `1.14` (+14%) | `-0.015` / `+0.010` | `1.16` (+16%) | `[-0.010, +0.005, +0.025]` | `0.011` @ 60/mm |

---

### Detailed Stock Breakdowns

#### 1. Kodak Portra 160 (Color Negative, ISO 160)
* **Real-World Character**: Studio portraiture and bright daylight film. Very gentle contrast, pastel color rendition, smooth highlight roll-off that preserves delicate skin highlights.
* **Tuned Behavior**:
  * Softened contrast (`0.90`) and compressed highlights (`-0.160`) create creamy, non-clipping skin highlights.
  * Lifted shadows (`+0.040`) preserve shadow detail in hair and clothing.
  * Subtle warm peach tone (`[+0.025, -0.006, -0.016]`) creates a healthy, flattering complexion.
  * Very fine, tight grain (`0.014` @ 55/mm).
* **Portra 160 vs 400 relationship**: Shares the natural portrait signature with Portra 400, but is slightly more pastel, slightly softer in contrast, and features tighter, finer grain.

#### 2. Kodak Portra 400 (Color Negative, ISO 400)
* **Real-World Character**: The quintessential modern color negative film. Balanced contrast, natural warm skin tones, rich organic earthy tones, fine distinct grain structure.
* **Tuned Behavior**:
  * Moderate gentle contrast (`0.93`) and mild highlight compression (`-0.120`).
  * Golden-warm color bias (`[+0.030, -0.008, -0.020]`) gives sunset scenes, wooden piers, and skin a warm golden-hour glow.
  * Fine organic grain (`0.022` @ 45/mm) provides distinct analog surface texture without digital noise.
  * Maintains family consistency with Portra 160 while providing a touch more midtone punch.

#### 3. Kodak Portra 800 (Color Negative, ISO 800)
* **Real-World Character**: High-speed film for low light, dusk, and overcast days. Richer contrast and fuller color to punch through flat or dim illumination.
* **Tuned Behavior**:
  * Positive contrast (`1.06`) and saturation (`1.08`) provide richer, deeper colors.
  * Warm amber tint (`[+0.035, -0.006, -0.025]`) mimics tungsten and twilight response.
  * Visible, tactile analog grain (`0.032` @ 35/mm) adds texture across midtones and shadows.

#### 4. Kodak Ektar 100 (Color Negative, ISO 100)
* **Real-World Character**: "The slide film of negative stocks"—the sharpest, highest-saturation color negative film in existence.
* **Tuned Behavior**:
  * High, snappy contrast (`1.18`) with deep Dmax shadows (`-0.010`).
  * Vivid saturation (+28%) that makes sky blues, foliage greens, and red tones pop immediately.
  * Cyan-blue and rich red color vector (`[+0.020, +0.010, +0.035]`).
  * Ultra-fine micro grain (`0.010` @ 65/mm) maintains maximum edge sharpness.

#### 5. Kodak Ektachrome E100 (Color Reversal Slide Film, ISO 100)
* **Real-World Character**: Professional E-6 transparency slide film. Steep characteristic curve, clean brilliant whites, deep inky blacks, cool cyan-blue open shade rendering.
* **Tuned Behavior**:
  * Steep slide contrast curve (`1.14`) with deep blacks (`-0.015`) and clean, punchy highlights (`+0.010`).
  * Rich, clean slide saturation (`1.16`).
  * Cool-neutral slide bias (`[-0.010, +0.005, +0.025]`) that gives clean neutral whites without warm negative mask fog.
  * Virtually grain-free slide dye structure (`0.011` @ 60/mm).

---

## 5. Shader Pipeline Enhancements

The shader in [`src/shaders/filmLook.ts`](file:///Users/zhangzimou/orca/workspaces/film_photo/effect/src/shaders/filmLook.ts) was enhanced to ensure the filter effect is visible and organic:

1. **Direct Color Tint Application**:
   * Previously, `uFilmColor` was component-wise multiplied by `chroma`, which inverted negative channels (e.g. blue) and diminished the shift to near zero.
   * Now: `c = vec3(luma) + chroma * saturation + uFilmColor * colorful * amount;`
   * Neutral grays, pure whites, and pure blacks remain clean, while colorful areas receive the authentic film color bias.

2. **Refined Skin Saturation Protection**:
   * Skin protection was tuned to `(1.0 - 0.35 * skin)` so that warm portrait skin retains healthy warmth without becoming garish.

3. **Resolved Grain Footprint Scaling**:
   * The grain anti-aliasing cutoff was widened (`smoothstep(0.8, 2.8, footprint)`), allowing grain to be resolved at 1:1 view while preventing moiré shimmering in distant 3D overview mode.

---

## 6. File Inventory

```
film_filter_references/
├── README.md
├── all_filters_comparison.jpg         <-- Master 5×6 matrix comparison
├── 01_sunny.jpg                       <-- Original
├── 01_sunny_comparison.jpg            <-- 2×3 side-by-side sheet
├── 01_sunny_portra-160.jpg
├── 01_sunny_portra-400.jpg
├── 01_sunny_portra-800.jpg
├── 01_sunny_ektar-100.jpg
├── 01_sunny_ektachrome-e100.jpg
├── 02_cloudy.jpg                      <-- Original
├── 02_cloudy_comparison.jpg           <-- 2×3 side-by-side sheet
├── 02_cloudy_portra-160.jpg
├── 02_cloudy_portra-400.jpg
├── 02_cloudy_portra-800.jpg
├── 02_cloudy_ektar-100.jpg
├── 02_cloudy_ektachrome-e100.jpg
├── 03_rainy.jpg                       <-- Original
├── 03_rainy_comparison.jpg            <-- 2×3 side-by-side sheet
├── 03_rainy_portra-160.jpg
├── 03_rainy_portra-400.jpg
├── 03_rainy_portra-800.jpg
├── 03_rainy_ektar-100.jpg
├── 03_rainy_ektachrome-e100.jpg
├── 04_sunset.jpg                      <-- Original
├── 04_sunset_comparison.jpg           <-- 2×3 side-by-side sheet
├── 04_sunset_portra-160.jpg
├── 04_sunset_portra-400.jpg
├── 04_sunset_portra-800.jpg
├── 04_sunset_ektar-100.jpg
├── 04_sunset_ektachrome-e100.jpg
├── 05_portrait.jpg                    <-- Original
├── 05_portrait_comparison.jpg         <-- 2×3 side-by-side sheet
├── 05_portrait_portra-160.jpg
├── 05_portrait_portra-400.jpg
├── 05_portrait_portra-800.jpg
├── 05_portrait_ektar-100.jpg
└── 05_portrait_ektachrome-e100.jpg
```
