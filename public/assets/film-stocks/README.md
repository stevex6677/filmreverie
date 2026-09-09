# M9 stock reference notes

The five JSON files are local runtime profiles and reference records. `src/data/filmStocks.ts` imports them into the app; `filmRebateCanvas.ts` draws original, scalable lettering and rail numbers. All profiles describe developed **135 still film**, not cartridges, motion-picture stock, or 120 backing paper. No external image is requested at runtime and no reference photograph is redistributed.

| Stock / edition | Developed-film reference | Features used |
| --- | --- | --- |
| Ektachrome E100, 2018 reintroduction | [Clément Blin, June 2021 E-6 article](https://www.clementblin.net/blog-de-photographie-nature-conseil-et-technique/2021/6/21/dvelopper-des-diapositives-en-e6-soi-meme-) — perforated E100 strips on a light table | Dark neutral border, pale warm KODAK E100 lettering, full frame number on the name rail, full/half numbers on the opposite rail; both rails read the same way. |
| Ektar 100, 2008 edition | [Hubert Sieminski, developed strip photographed September 23, 2018](https://commons.wikimedia.org/wiki/File:Color_print_film_strip_01_-_negative.jpg) | KODAK EKTAR 100, orange base, dark lettering, full/half numbers and direction marker outside the perforations. |
| Portra 160, unified 2011 edition | [Eric-René Penoy film services page](https://www.ericrenepenoy.com/best-wedding-16mm-videographer-thailand) — the illustrated perforated **Portra 160 still-negative strips**, not the motion-picture service format | KODAK PORTRA 160, numbered outer rails and orange base. |
| Portra 400, unified 2010 edition | [Take It Easy Lab colour processing](https://takeiteasylab.com/collections/colour-film-developing) — developed frames 10–13 | KODAK PORTRA 400, dark lettering and full/half numbers; reference rotated to read left-to-right. |
| Portra 800, 2024 sample | [Dmitri / Daren / Yvonne, ISO 800 film comparison](https://www.analog.cafe/r/all-the-iso-800-colour-films-compared-b5eu) — Portra column, Sony/FLAT and Frontier scans including perforations | KODAK PORTRA 800 and outer-rail frame numbering. The article explicitly identifies its samples as 35mm loaded through adapters. These are converted scans, so their border colors are not used as calibrated transmission measurements. |

## Deliberate limits

These are reference-informed reconstructions, **not exact facsimiles**. References do not establish exact font tooling, batch identifiers, film-to-camera registration, spectral density, or manufacturing tolerances. Text position is normalized to the existing five-frame layout; numbers 1–5 identify this viewer's frames rather than copying the references' photographed frame numbers. The supported macro view and loupe receive a 6144 × 936 local texture with mipmaps. Lettering uses a system sans-serif approximation.

Optical edge-code tracks are visible on the negative references. Their full bit patterns and registration are not verified, so those tracks are deliberately omitted for all four negative stocks. No decorative barcode, cartridge DX code, fake batch code, SAFETY FILM inscription, or motion-picture KEYKODE is substituted. E100's selected reference has no discernible code track. This omission is a review limitation, not a claim that real negative film lacks edge codes.

The negative base colors and mask vectors are modest artistic approximations under the existing M8 illumination. M9 does not simulate stock-specific photographic grading or grain. Every positive photo uses the same existing image and shader path; only physical borders/markings and permitted views change. The negative-stock physical border remains orange during positive preview.

The source photographs remain at their publishers' URLs (see each JSON's `reference.imageUrl`). Runtime lettering/geometry is original project artwork under the project's ISC license; Kodak names identify the represented stocks. No publisher license is inferred or transferred to reference photographs.
