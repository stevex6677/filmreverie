# M9 stock reference notes

The eleven JSON files are local runtime profiles and reference records. `src/data/filmStocks.ts` imports them into the app; `filmRebateCanvas.ts` draws original, scalable lettering and rail numbers. Base/rebate references primarily describe developed **135 still film**, not cartridges, motion-picture stock, or 120 backing paper. Each profile explicitly lists its supported film types in `formats`. No external image is requested at runtime and no reference photograph is redistributed.

| Stock / edition | Developed-film reference | Features used |
| --- | --- | --- |
| Ektachrome E100, 2018 reintroduction | [Clément Blin, June 2021 E-6 article](https://www.clementblin.net/blog-de-photographie-nature-conseil-et-technique/2021/6/21/dvelopper-des-diapositives-en-e6-soi-meme-) — perforated E100 strips on a light table | Dark neutral border, pale warm KODAK E100 lettering, full frame number on the name rail, full/half numbers on the opposite rail; both rails read the same way. |
| Ektar 100, 2008 edition | [Hubert Sieminski, developed strip photographed September 23, 2018](https://commons.wikimedia.org/wiki/File:Color_print_film_strip_01_-_negative.jpg) | KODAK EKTAR 100, orange base, dark lettering, full/half numbers and direction marker outside the perforations. |
| Portra 160, unified 2011 edition | [Eric-René Penoy film services page](https://www.ericrenepenoy.com/best-wedding-16mm-videographer-thailand) — the illustrated perforated **Portra 160 still-negative strips**, not the motion-picture service format | KODAK PORTRA 160, numbered outer rails and orange base. |
| Portra 400, unified 2010 edition | [Take It Easy Lab colour processing](https://takeiteasylab.com/collections/colour-film-developing) — developed frames 10–13 | KODAK PORTRA 400, dark lettering and full/half numbers; reference rotated to read left-to-right. |
| Portra 800, 2024 sample | [Dmitri / Daren / Yvonne, ISO 800 film comparison](https://www.analog.cafe/r/all-the-iso-800-colour-films-compared-b5eu) — Portra column, Sony/FLAT and Frontier scans including perforations | KODAK PORTRA 800 and outer-rail frame numbering. The article explicitly identifies its samples as 35mm loaded through adapters. These are converted scans, so their border colors are not used as calibrated transmission measurements. |
| Provia 100F (RDP III) | [Fujifilm Provia 100F Professional Data Sheet](https://www.fujifilm.com/products/photofinishing/films/pdf/provia_100f_datasheet.pdf) — developed 135/120 slide strips | Dark neutral reversal border, warm cream FUJIFILM PROVIA 100F lettering, RDP III emulsion marking, advance arrow and frame numbering. |
| Velvia 50 (RVP 50) | [Fujifilm Velvia 50 Professional Data Sheet](https://www.fujifilm.com/products/photofinishing/films/pdf/velvia_50_datasheet.pdf) — developed 135/120 slide strips | Deep black reversal border, rich warm amber FUJIFILM VELVIA 50 lettering, RVP 50 emulsion code, advance arrow and frame numbering. |
| Velvia 100 (RVP 100) | [Fujifilm Velvia 100 Professional Data Sheet](https://www.fujifilm.com/products/photofinishing/films/pdf/velvia_100_datasheet.pdf) — developed 135/120 slide strips | Deep black reversal border, pale golden cream FUJIFILM VELVIA 100 lettering, RVP 100 emulsion code, advance arrow and frame numbering. |

## Deliberate limits

These are reference-informed reconstructions, **not exact facsimiles**. References do not establish exact font tooling, batch identifiers, film-to-camera registration, spectral density, or manufacturing tolerances. Text position is normalized to the existing five-frame layout; numbers 1–5 identify this viewer's frames rather than copying the references' photographed frame numbers. The supported macro view and loupe receive a 6144 × 936 local texture with mipmaps. Lettering uses a system sans-serif approximation.

Optical edge-code tracks are visible on the negative references. Their full bit patterns and registration are not verified, so those tracks are deliberately omitted for all four negative stocks. No decorative barcode, cartridge DX code, fake batch code, SAFETY FILM inscription, or motion-picture KEYKODE is substituted. E100's selected reference has no discernible code track. This omission is a review limitation, not a claim that real negative film lacks edge codes.

The negative base colors and mask vectors are modest artistic approximations under the existing M8 illumination. M9 originally supplied no photographic grading or grain. M19 adds the optional photograph treatment described below; strength zero preserves the original photo pipeline. Positive preview reverses the complete negative strip, including its border and markings; the M19 strength control does not grade those borders.

The source photographs remain at their publishers' URLs (see each JSON's `reference.imageUrl`). Runtime lettering/geometry is original project artwork under the project's ISC license; Kodak names identify the represented stocks. No publisher license is inferred or transferred to reference photographs.


## M19 photographic looks — revision 1

`src/data/filmLooks.ts` holds the five authored photo profiles; `src/shaders/filmLook.ts` applies them before film transmission and table illumination. The existing JSON records remain the physical border/mask source of truth. No external resources load at runtime.

The strength scale is 0–100: 0 bypasses the added treatment exactly, 50 uses the authored parameters, and 100 increases their deviations from neutral. Tone and color scale continuously; grain amplitude grows more gently. Curves operate in perceptual sRGB, then return to linear RGB before the existing light/transmission and final display conversion. The tone curve preserves endpoints except for the intentional small Portra shadow lift. A hue-based attenuation reduces saturation changes in orange colors; it is not skin detection.

| Profile / represented edition | Manufacturer foundation | Authored interpretation |
| --- | --- | --- |
| Portra 160 / unified 2011 | [E-4051](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/e4051_Portra_160.pdf): fine grain and smooth, natural skin tones. | Restrained saturation, gentle contrast and highlight compression; smallest Portra grain. |
| Portra 400 / unified 2010 | [E-4050](https://www.kodakprofessional.com/sites/default/files/2025-07/e4050.pdf): natural skin, fine grain for its speed, color reproduction across lighting conditions. | Balanced saturation, gentle highlights and moderate fine texture. |
| Portra 800 / existing current-stock identity | [Kodak Photo Systems](https://kodak.photosys.com/products/portra-800-36exp-135-pro-pack-5-rolls): balanced saturation, natural skin and fine grain within its speed class. | Slightly fuller color, more apparent texture than the other Portras. |
| Ektar 100 / 2008 | [Kodak](https://www.kodak.com/en/still-film/product/professional/ektar-100-film/): vivid saturation, sharpness and very fine grain. | Highest saturation and tonal separation, smallest grain. |
| Ektachrome E100 / 2018 | [E-4000](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/e4000_ektachrome_100.pdf): neutral balance, moderate saturation, fine grain and low contrast. | Clean endpoints, near-neutral contrast, modest color enhancement. |
| Provia 100F / current | [Fujifilm RDP III](https://www.fujifilm.com/products/photofinishing/films/pdf/provia_100f_datasheet.pdf): natural color, faithful skin tones, ultra-fine RMS 8 grain. | Faithful natural color, clean highlights, neutral-cool daylight balance, ultra-fine grain. |
| Velvia 50 / current | [Fujifilm RVP 50](https://www.fujifilm.com/products/photofinishing/films/pdf/velvia_50_datasheet.pdf): legendary ultra-vivid saturation, high contrast, fine RMS 9 grain. | Ultra-vivid warm reds, rich emerald greens, deep inky crushed blacks, high contrast. |
| Velvia 100 / current | [Fujifilm RVP 100](https://www.fujifilm.com/products/photofinishing/films/pdf/velvia_100_datasheet.pdf): vivid saturation, high contrast, ultra-fine RMS 8 grain. | Vivid punchy saturation, strong contrast, magenta-toned rich skies and sunsets, ultra-fine grain. |

These parameters are artistic approximations, not fitted spectral/density measurements, exposure simulations or scanner profiles. Grain is procedural monochrome texture, not a measured dye-cloud model. Its scale is expressed per film millimeter, seeded by frame identity and filtered according to the rendered pixel footprint, so it stays still and does not become screen-space noise. Film format changes affect its apparent size; texture-resolution upgrades do not alter its seed or scale.

Original/imported pixels and stored thumbnails remain untouched. A saved roll stores `filmStrength` alongside `stockId`; absent or invalid values use 50, finite values clamp to 0–100, and explicit zero survives reopening and library edits. The shipped scene photographs already have pronounced color treatment. Candidate review on those scenes establishes the application behavior, but does not establish calibrated stock accuracy or performance on a broad range of skin tones. See the M19 review record for the actual evidence and remaining review limitations.

### New color negatives (2026-10-01)

| Stock | Formats | Look reference and interpretation |
| --- | --- | --- |
| Fujifilm 200 | 135 only | [Fujifilm AF3-0261E](https://asset.fujifilm.com/master/americas/files/2022-02/112b0a02e409bdf6b5429648695770a4/fujifilm-200-speed-film_data-sheet.pdf): vivid color and fine grain. The authored look adds restrained green/cool color separation, moderate contrast and fine texture. |
| Kodak Pro Image 100 | 135 only | [Kodak E-4L](https://www.bhphotovideo.com/lit_files/519169.pdf): portrait-oriented color accuracy and saturation. The authored look uses balanced color, a small warm bias, gentle highlights and fine grain. |
| Kodak Gold 200 | 135 and 120 | [Kodak product information](https://www.kodak.com/en/still-film/product/consumer/gold-200-film/) and [120 launch](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/Gold%20120%20Press%20Release.pdf): warm saturated color and fine detail. The authored look uses the strongest warm bias of these three, fuller saturation and more apparent grain. |

These are perceptual RGB interpretations, not measured film emulations or claims
about shared emulsions. Manufacturer descriptions inform the direction, not the
numeric parameters. Strength 0 preserves the input; 50 is the default and 100
intensifies the look. The same profiles drive editor previews, table/loupe shaders,
screening/export and `scripts/apply-filter.mjs` (`fuji200`, `proimage100`, `gold200`).
Grain retains the existing physical-millimeter scaling for Gold's 120 formats.

The new procedural rail labels identify each stock; exact factory edge typography,
batch markings and optical DX codes are unverified. They intentionally omit the
unverified code tracks instead of reusing Portra's pattern. Packaging references
and their separate image provenance live in `../film-packaging/README.md`.
