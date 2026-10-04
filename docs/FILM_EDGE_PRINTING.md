# Factory film-edge markings

The renderer measures markings along the uncut film in millimetres. Photo order,
image aspect ratio, the number of images in a strip, and viewport size must not
set the printing pitch. A 65 mm wide 135 panorama crosses more than one factory
number; an 18 mm half-frame image can fall between successive integer numbers.
The UI's exposure counter remains a separate image index.

## Evidence and calibration (2026-10-03)

| Stock / film | Number pitch used | Evidence status |
| --- | --- | --- |
| All supported 135 stocks | 38 mm integer; 19 mm `A` intermediate | Eight / four KS-1870 perforations at 4.75 mm pitch |
| Kodak 120: E100, Ektar, Portra 160/400/800, Gold | 45.5 mm upper `41, 42, …`; 60.667 mm lower `1, 2, …` | Manufacturer confirms the dual 16-/12-position numbering; distances retain the project's nominal 728 mm span calibration, not a manufacturer dimension |
| Fujichrome 120: Provia 100F, Velvia 50/100 | approximately 43 mm, single upper `1, 2, …` track | Manufacturer diagram confirms one track numbered 1–19; pitch estimated from the diagram's repeat-to-film-width ratio, not a dimensioned production specification |

Primary references:

- [Kodak Motion Picture Products catalog](https://www.kodak.com/content/pdfs/motion/Kodak-Motion-Picture-Products-Price-Catalog-US.pdf), “Perforation Types”: KS-1870 is 0.1870 inches / nominally 4.750 mm. Eight perforations give 38 mm and four give 19 mm. This is distinct from the 36 mm image gate and 35 mm film width.
- [Kodak Professional Photographic Catalog L-9](https://filmcolors.org/wp-content/uploads/2025/11/2003KodakProfessionalCatalog_L9.pdf), reference pages 6R–7R and 16R (PDF pages 90–91 and 100): developed-film diagrams, Kodak 120's upper 41–56 and lower 1–12 numbering, and separate stock legends. This is a historical manufacturer publication, not a specification for every current coating run.
- [Fujifilm Velvia 50 bulletin AF3-0221E2](https://asset.fujifilm.com/www/at/files/2019-09/3d88b84d7cbd43d8c3a32ca72d107ae4/films_velvia-50_datasheet_01.pdf), page 6: processed-film edge diagrams for 135, 120 and 220. The 120 upper indices run 1–19, with left-pointing triangles and no Kodak lower number track. The drawing shows roughly 123 image pixels per repeat against 174 pixels for the full 61 mm film width at the inspected raster scale: about 43 mm. The illustration has no dimensional guarantee.
- [Fujifilm Professional Film Data Guide](https://asset.fujifilm.com/www/ca/files/2020-03/d52487c5c6f84e7f935c299491c5c1ff/ProfessionalFilmDataGuide.pdf), section 1-3: the same 1–19 convention for Fujichrome 120 including RDP III and RVP variants.

These are **developed-film** markings. The red-window advance numbers on 120
backing paper are a different system and are not printed on this simulated film.
A 6×7 or panoramic camera does not manufacture a new factory numbering pitch.

## Scope and limits

The 135 number and perforation pitches are fixed physical dimensions. Exact
stock-specific 120 pitches were not established by the available primary
references. The 120 figures above are explicitly nominal; a measured developed
strip or a dimensioned factory drawing is needed to certify or refine them. Do
not describe these 120 values as an ISO-mandated spacing.

For 135, Kodak-style stock legends repeat independently at the historical
catalog's 50.8 mm interval; Fujichrome legends repeat in 38 mm cells. Numbers
remain on the lower rail so independent legend and number tracks cannot overlap.
Fuji 200 uses the existing Kodak-style 135 fallback, not a verified modern
Fuji 200 edge-print facsimile.

The reconstructed 120 legend accompanies each upper index to avoid collisions
between independently phased text on the narrow rail. Kodak's historical
catalog separately quotes 50.8 mm negative / 45.72 mm Ektachrome legend repeats,
but does not dimension their placement relative to both index tracks. Thus the
120 **legend** rhythm, font, starting phase and orientation-arrow artwork remain
approximations. No fake emulsion/batch identifier is added.

The app permits extended simulated rolls. Their indices continue monotonically
instead of silently wrapping to 41 or 1 after a nominal roll length. This is an
application extension, not a claim that a physical 120 roll carries extra indices.

## Implementation and verification

`src/data/filmEdgePrinting.ts` holds physical pitches and stock-family profiles.
`filmEdgeRepeats` places repeat cells using the accumulated `filmLengthOffset`;
`filmRebateCanvas` clears image gates separately from drawing factory marks.
`film120Rebate` uses the same coordinates. A cut can intersect lettering: draw
the preceding repeat and let the canvas clip it, without snapping to an image.
Perforations use the same roll origin at a constant 4.75 mm pitch.

Integration regressions measure actual canvas text coordinates for every stock,
verify 38/19 mm spacing with mixed panorama/half-frame gates, compare differently
cut versions of one roll, check perforation phase, cover all four medium-format
gates, and reject numbering wrap on extended rolls. Existing raster tests check
that short strips do not distort type and that image gates stay clear.
