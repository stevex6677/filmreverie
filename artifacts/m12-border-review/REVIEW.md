# M12 border and crop revision

Status: **Awaiting human review**. This revision implements the user's three explicit corrections to the initial M12 delivery.

- Positive mode converts all negative film, including borders, frame gaps, stock names, numbers, and index marks. E100 remains positive-only. Film and loupe use the same rendered material.
- Every photo center-crops to fill its image opening at all four rotations, preserving proportions and original files. The draft preview shows the crop. Removed the drawn gate outline and corrected filtered transparent texels that caused dark/white edge seams.
- Rebuilt 120 artwork from downloaded developed-film samples and Kodak documentation: narrow unperforated rails, physical-size lettering, independent upper/lower numbering tracks and triangles, continuing across strip cuts. [References and limitations](REFERENCES.md).

[Preview](http://127.0.0.1:5193/?mode=inspect). Reload an existing tab to load this revision. Existing saved rolls use cropping immediately; originals and stored orientation are unchanged.

Review captures include `ektar-100-whole-negative.png` and `ektar-100-whole-positive.png`, corresponding captures for all five stocks, `120-frame-negative.png`, `120-frame-positive.png`, `120-border-loupe.png`, `real-crop-preview.png`, and `border-review.webm`. These show existing bundled photographs imported into an isolated review browser, not new downloaded photographs. The downloaded images are study references only.

The new browser crop test compares a wide image against a square reference at the center, corners, and four edges in all four rotations, checks negative and positive edge seams, and reloads saved orientation. Integration coverage checks crop proportions/source bounds for five source aspects × five formats × four rotations, mode routing, numbering continuity, and actual 120 raster ink/gate separation.

The previous M9 assertion requiring unchanged orange borders in positive mode has been explicitly replaced by assertions requiring border conversion and restoration. Existing positive-photo color equivalence across stocks remains required. Historical accepted artifacts and the earlier M12 evidence remain untouched; current candidates are isolated here.

Final `npm run validate:m12` exited 0: production build passed, **138/138 integration tests across 15 files** and **45/45 browser tests** passed, with zero failures/skips/retries (two workers; 17.1-minute browser run). Exact command and checkout mapping: `validation-command.txt`; full log: `validation.log`. All 69 source hashes in `source-hashes.json` match the remote validation checkout. The separate desktop preview was reloaded with the revised build and retained its saved roll, frame 2, and positive view. The earlier interrupted run is `validation-before-edge-correction.log`; it is not the final result.
