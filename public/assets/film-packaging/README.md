# Saved-roll packaging

The room cabinet displays one saved photographic roll per compartment. Empty
compartments use inert, stable pseudo-random gray packages. More than 16 saved
rolls produces additional shelf pages. Slot placement lives on the existing
IndexedDB roll record; legacy records are assigned slots transactionally.

Click/tap the cabinet to approach the shelf; select saved rolls from that close
view. Back to room or Escape restores the prior room heading. The shelf camera
fits the whole cabinet to the viewport and respects reduced motion.

## Artwork coverage

[manifest.json](manifest.json) records all five supported Kodak stocks in 35mm
and 120: Ektachrome E100, Ektar 100, Portra 160, Portra 400 and Portra 800.
Eight boxes and five matching 35mm cartridges use original product photographs.
Portra 160/400 35mm use authored SVG single-roll adaptations at 60×40×38 mm,
with reflowed typography and no five-roll label. These are display designs, not
claims of a retail packaging edition; their original multipack source records
remain in the manifest for provenance.
Box images and four cartridge images come from Kodak Photo Systems; the E100
cartridge comes from Macodirect. Each entry includes the product page, image URL,
dimensions, source SHA-256, shared source path and measured panel corners.
The 120 multipack boxes illustrate the stock; they never imply multiple saved rolls.

## Reproduce the assets

Follow the root [shared asset workflow](../../../SHARED_ASSETS.md). Run these
commands in the mapped remote checkout after flushing its Mutagen session:

```sh
npm run fetch:packaging
npm run prepare:assets
```

Fetching preserves existing source files and rejects changed upstream bytes.
Originals resolve under the main checkout's
`ignored_assets/film-packaging/kodak-20260915/`. Preparation validates SHA-256,
keeps byte-identical copies under
`ignored_generated/film-packaging/textures/<sha256>/`, and fills the ignored
`public/assets/film-packaging/` serving cache. Builds prepare these assets too.
No product image is hotlinked at runtime. Commit the manifest and scripts,
not downloaded images or generated captures.

## Rendering and maintenance

### Physical scale and dimension audit (2026-09-16)

`src/data/physicalScale.ts` supplies one world-units-per-millimeter conversion
for film on the table, cartons, cartridges, frames and compartment dimensions.
`manifest.json` stores carton dimensions as `sizeMm` (width, height, depth).
Saved and gray versions use the same dimensions; there is no saved-only shrink
factor or compressed depth. Camera fitting changes the view, never these sizes.

| Object | Modeled dimensions in mm | Basis |
| --- | --- | --- |
| 35mm negative | 36 × 24 image; 35 film width | Existing film-format definition |
| 120 negative | 61 film width; image gate follows selected format | Existing film-format definition |
| 35mm cartridge | 25 body diameter, 41 body height, 47 including spindle | Nominal cassette envelope; 26.5 cap diameter |
| Single 35mm carton | 60 × 40 × 38 | Nominal retail carton envelope |
| Five-roll 120 carton | 135 × 79 × 28 | Nominal multipack envelope |
| Picture frame | 143.03 × 115.33 × 6.6 | Photo opening one-third taller than a 120 carton; 2 mm wood surround, 6 mm core + 0.3 mm bevels |
| Mat opening | Up to 133.03 × 105.33 | 3 mm mat border; inset further as needed to preserve the roll's saved crop |
| Compartment pitch | 310 × 135, depth 85 | Fits a 120 carton and enlarged frame, or a 35mm cartridge, carton and frame; 12 mm gaps between rotated footprints |

Cartons, cartridges and picture frames all turn 10° in the same direction
around their vertical axis. Placement accounts for the rotated width and
depth without changing the objects' physical dimensions.

**Carton values are nominal, not caliper measurements of every photographed
edition.** The [Portra 400 120 retail listing](https://www.bhphotovideo.com/c/product/742299-USA/Kodak_8331506_120_Professional_Portra_400.html/overview)
reports 5.3×3.1×1 inches, supporting the approximately 135×79 mm front envelope.
The [E100 single-roll listing](https://www.bhphotovideo.com/c/product/1951819-REG/kodak_7518533_eastman_professional_ektachrome_e100.html)
reports 2.45×1.6×1.5 inches for a different, retro packaging edition, supporting
the single-roll envelope rather than exact equivalence with our photograph.
Other retailer records conflict with the rectangular boxes pictured (for
example square dimensions in the [Ektar 120 listing](https://www.bhphotovideo.com/c/product/608455-USA/Kodak_8314098_120_Ektar_100_Color.html)).
These do not establish exact edition-specific carton dimensions. Keep the
nominal status explicit; physical measurements can replace `sizeMm` without
changing object scale, film dimensions or the shelf's arrangement rule.

Film scale no longer changes with frame count, format or free-image width.
Exceptionally wide free-format negatives widen the light table instead of
shrinking. Legacy saved camera coordinates migrate to the new film scale once;
photographic originals and crop settings are unchanged.

`src/utils/packagingMaterial.ts` projects each photographed quadrilateral onto a
box panel using a homography (a perspective-correct texture mapping). Corner
coordinates are normalized, in top-left, top-right, bottom-right, bottom-left
order. Original image bytes are untouched. Cartridge labels wrap around a
cylinder with modeled caps and spindle. The material desaturates empty cells.

When adding a supported stock, add both formats and a matching 35mm cartridge,
record sources/checksums, measure panels, then check all variants in the room.
`tests/integration/m18-film-shelf.test.ts` checks stock/format coverage and corner
projection. `npm run validate:m18` runs the build and full integration/browser
suites; `PLAYWRIGHT_WORKERS=1` is appropriate on the shared server's current
process limit.

The photographs retain some baked-in lighting. Unseen box sides and cartridge
reverse faces are simplified, without fabricated lettering. Packaging failure
leaves a plain physical package and does not prevent opening photographs.
