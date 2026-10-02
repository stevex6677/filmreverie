# Saved-roll packaging

The room cabinet displays one saved photographic roll per compartment. Empty
compartments use inert, stable pseudo-random gray packages. More than 16 saved
rolls produces additional shelf pages. Slot placement lives on the existing
IndexedDB roll record; legacy records are assigned slots transactionally.

Click/tap the cabinet to approach the shelf; select saved rolls from that close
view. Back to room or Escape restores the prior room heading. The shelf camera
fits the whole cabinet to the viewport and respects reduced motion.

## Artwork coverage

[manifest.json](manifest.json) records twenty packaging variants across eleven stocks.
The original eight stocks support both 35mm and 120: Kodak
Ektachrome E100, Ektar 100, Portra 160/400/800 and Fujifilm Provia 100F,
Velvia 50/100. Fourteen box fronts and all eight 35mm cartridge labels use original
photographs. Fuji cartons and cassette labels were corrected from separate
references on 2026-09-25; the cassette artwork is not a shrunken carton face.
Portra 160/400 35mm use authored SVG single-roll adaptations at 60×40×38 mm,
with reflowed typography and no five-roll label. These are display designs, not
claims of a retail packaging edition; their original multipack source records
remain in the manifest for provenance.
Kodak box images and four cartridge images come from Kodak Photo Systems; the E100
cartridge comes from Macodirect. Each entry includes the product page, image URL,
dimensions, source SHA-256, shared source path and measured panel corners.
The 120 multipack boxes illustrate the stock; they never imply multiple saved rolls.

### Fuji carton reference correction (2026-09-25)

Six simplified SVG carton faces were replaced with unchanged product photographs.
These selected green/blue/black/gold editions preserve the actual stock lettering,
FUJICHROME branding and format-specific layout, rather than assigning Velvia an
invented purple or magenta stripe. Sources:

| Stock | 135-36 single-roll carton | 120 five-roll carton |
| --- | --- | --- |
| Provia 100F | [Macodirect](https://www.macodirect.de/film/farbdiafilm/fuji-provia-100-f-135-36) | [Retrospekt](https://retrospekt.com/products/fujifilm-fujichrome-provia-100f-color-120-film-5-pack) |
| Velvia 50 | [Macodirect](https://www.macodirect.de/film/farbdiafilm/fuji-velvia-50-135-36) | [Retrospekt](https://retrospekt.com/products/fujichrome-velvia-50-color-120-film-5-pack) |
| Velvia 100 | [Macodirect](https://www.macodirect.de/film/farbdiafilm/fuji-velvia-100-135-36) | [WAFUU](https://wafuu.com/en-us/products/fujifilm-fujichrome-velvia-100-120-reversal-film-12-exp-5-pack) |

The 135 photos are 1240×1000; Provia/Velvia 50 120 photos are 3000×3000;
Velvia 100 120 is 2048×1070 and depicts the Japanese five-pack edition.
Measured front/top quadrilaterals remove the source camera's perspective.
Unphotographed right faces are solid Fuji green, not Kodak yellow or mirrored
left panels. Velvia 100 120 has no visible top in its source: its top is plain
green, not another copy of its front. These are documented simplifications,
not a claim of a fully photographed six-sided box. Source glare and curved
flaps remain, particularly on the shallow-angle 120 top panels.

Fuji 120 cartons use a nominal 135×72×28 mm envelope. Approximately 1.88:1
front proportions are supported by the nearly frontal
[Provia reference](https://reformedfilmlab.com/products/fuji-provia-100f-120-5-pack)
and the WAFUU Velvia 100 photograph. This corrects the previous 135×79 front's
vertical stretching; it is not a measured dimension claim. Single-roll cartons
remain nominal 60×40×38 mm. Existing Kodak dimensions and cover frames are unchanged.

Verification: production build and 13 targeted packaging/physical-scale integration
tests passed. The actual cabinet was reviewed with all six saved Fuji variants;
full and close-up captures are under ignored `artifacts/fuji-packaging/`.
All six published files and retained source copies have matching SHA-256 records.

### Fuji 135 cassette reference correction (2026-09-25)

The three invented cassette SVGs were replaced with separately sourced photographs:

| Cassette | Source | Visible edition |
| --- | --- | --- |
| Provia 100F | [Fujichrome Provia 100F - 02.jpg, DYVER / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fujichrome_Provia_100F_-_02.jpg) | Green header/footer, blue PROVIA 100F center, dark process band, white 36 / RDP III strip |
| Velvia 50 | [Macodirect alternate product photograph](https://www.macodirect.de/media/image/44/d8/a2/FV5011_1.jpg), [listing](https://www.macodirect.de/film/farbdiafilm/fuji-velvia-50-135-36) | Green/white body, black Velvia 50 lettering on the white lower band |
| Velvia 100 | [Macodirect alternate product photograph](https://www.macodirect.de/media/image/19/bd/a1/FV1011_1.jpg), [listing](https://www.macodirect.de/film/farbdiafilm/fuji-velvia-100-135-36) | Green body, white Velvia lettering, blue 100 and DAYLIGHT band; not Velvia 100F |

**Photograph credit:** “Fujichrome Provia 100F - 02.jpg” by
[DYVER](https://commons.wikimedia.org/wiki/User:DYVER), Wikimedia Commons,
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The original JPEG is retained unchanged. The displayed label and review captures
crop and geometrically project the photographic material; those photographic
adaptations are offered under CC BY-SA 4.0. This attribution and license apply to
the photograph, not to unrelated application code or other product imagery.
Macodirect photographs retain the existing third-party-product-imagery status;
provenance is not a license grant.

The renderer opts these three references into `cartridgeProjection: "photographic"`.
Vertex UVs sample by projected cylinder position rather than arc length, avoiding
a second squeeze of already-photographed lettering. `cartridgeCurvature` stores
the top/bottom center sag, as fractions of the photographed panel height; a cosine
profile follows the label's bowed boundaries without importing the photographed
black caps. These curved samples can extend beyond the straight `cartridgePanel`
quadrilateral while remaining inside the source image. Do not clamp them to the
quadrilateral. The existing modeled black caps, spindle and physical dimensions
remain unchanged. Kodak mapping and all six Fuji carton photographs are unchanged.

This is an approximate correction of near-frontal photographs, not a calibrated
360° unwrap: source lighting, some edge foreshortening and asymmetric curvature
remain. Unseen reverse/DX contacts are not invented. Published sources are
3920×2613 for Provia and 1240×1000 for each Velvia, with pinned hashes and byte-identical
retained originals under `film-packaging/fuji-cartridge-20260925/`.

Verification: production build and 13 packaging/physical-scale integration checks
passed. All three photographed labels loaded in the actual cabinet. Live geometry
inspection confirmed sine-distributed horizontal UVs and measured center sag.
The normal cabinet view and close-up renders of the mounted scene were visually
reviewed under ignored `artifacts/fuji-cartridge/`; close-ups use an inspection
camera, not a new application zoom control.

## Runtime assets and optional source acquisition

The required packaging images and authored SVGs in this directory are tracked
runtime assets. A fresh clone can run `npm ci`, `npm run dev` and `npm run build`
without private originals, remote setup or an image converter. `prepare:assets`
validates the published images against their manifest; startup does not fetch
or reconstruct them. No product image is hotlinked at runtime.

For authoring, follow the root [shared asset workflow](../../../SHARED_ASSETS.md).
Run locally from the repository root:

```sh
# Optional: acquire pinned originals without replacing existing source bytes.
npm run fetch:packaging
# Explicitly publish runtime copies from the pinned originals.
npm run fetch:packaging -- --publish
```

Fetching preserves existing source files and rejects changed upstream bytes.
Originals resolve under the discovered local main checkout's `ignored_assets/`:
`film-packaging/kodak-20260915/`, `film-packaging/fuji-20260925/` and
`film-packaging/fuji-cartridge-20260925/`.
`FILM_PHOTO_SHARED_ROOT` overrides that authoring root. Keep originals read-only
and back them up separately.
Reproducible cache belongs under the active checkout's `.cache/`, not among retained
authoring runs. Review and commit published runtime images with the manifest
and scripts; keep private sources and generated review captures out of Git.

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
| Kodak five-roll 120 carton | 135 × 79 × 28 | Nominal multipack envelope |
| Fuji five-roll 120 carton | 135 × 72 × 28 | Photograph-supported front ratio; nominal width/depth, not caliper measurements |
| Picture frame | 143.03 × 115.33 × 6.6 | Photo opening one-third taller than the nominal Kodak 120 carton; 2 mm wood surround, 6 mm core + 0.3 mm bevels |
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

When adding a supported stock, add only its supported formats and a matching 35mm cartridge,
record sources/checksums, measure panels, then check all variants in the room.
`tests/integration/m18-film-shelf.test.ts` checks stock/format coverage and corner
projection. `npm run validate:m19` runs the build and full integration/browser
suites locally; `PLAYWRIGHT_WORKERS=1` is a sensible starting point on a laptop
or a host with limited process capacity.

The photographs retain some baked-in lighting. Unseen box sides and cartridge
reverse faces are simplified, without fabricated lettering. Packaging failure
leaves a plain physical package and does not prevent opening photographs.

### Fuji 200, Pro Image 100 and Gold 200 (2026-10-01)

| Stock | Formats | Photographic packaging sources |
| --- | --- | --- |
| Fujifilm 200 | 135 only | [Alpine Camera](https://alpinecamerausa.com/products/fujifilm-200-35), checked against [Fujifilm's product photograph](https://www.fujifilm.com/us/en/consumer/films/consumer-film/fujifilm-200) |
| Kodak Pro Image 100 | 135 only | [Glazer's Camera](https://www.glazerscamera.com/products/proimage-100-35mm-36exp-single), separate five-roll carton and cassette photographs |
| Kodak Gold 200 | 135 and 120 | [Kodak Photo Systems 135](https://kodak.photosys.com/products/ek-200-gold-color-negative-film-35mm), [120](https://kodak.photosys.com/products/ek-200-gold-color-negative-film-120-5-pack), [Macodirect cassette](https://www.macodirect.de/film/farbnegativfilm/kodak-gold-200-135-36) |

The six original image files are bundled unchanged, with URLs, dimensions and
SHA-256 in the manifest; byte-identical originals are retained under
`ignored_assets/film-packaging/new-stocks-20261001/` in shared storage. They
remain third-party product photographs; source attribution is not a license grant.

Fuji uses the photographed rectangular carton without the tall retail hanging
header. Its cassette face samples the cassette illustration printed on that
carton, rather than an invented label or a separately photographed cassette.
The carton is nominally 60×40×38 mm. The green top retains the source's shallow
view and printed texture. This is Fujifilm 200 packaging, not a C200 edition.

Pro Image retains its actual five-roll pro-pack design at a nominal 135×47×30 mm,
with its cassette standing on the carton so it fits beside the saved cover frame.
It still represents one saved roll. Gold uses the yellow/black/purple Eastman
Kodak editions in nominal 60×40×38 mm (135) and 135×79×28 mm (120) envelopes.
These dimensions are display estimates, not caliper measurements. Unseen faces
are plain stock-colored surfaces. Cassette photographic projections preserve the
source label curvature; hidden reverse labels are not fabricated.

Stock `formats` metadata is authoritative for editor choices and save/import/
publication validation. Fuji 200 and Pro Image have no 120 manifest entries.
The offline build includes all new packaging and stock records.
