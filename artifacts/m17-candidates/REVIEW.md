# M17 — Three-state physical loupe

Implementation and automated review are complete; human acceptance is pending.
The user authorized M17 on 2026-09-14, including the correction that scrolling
and pinching must not zoom in Inspection, while movement remains available.

## Delivered behavior

- Inactivated: a physical loupe rests at the table edge; the visible Loupe button
  also picks it up when the object is outside the current view.
- Activated: the loupe has a fixed physical size relative to the film. Pickup,
  camera zoom and viewport changes never resize it; apparent size follows perspective.
  Drag the body or glass without snapping the grab point. Tap the lens or Inspect
  to approach. Put away returns it to the table edge. Magnification offers 2×,
  4× and 8×, defaulting to 4× and preserving the last preference.
- Inspection: a 500 ms camera approach centers the existing object. The saved
  table pan/zoom is retained separately from this derived camera view. Dragging
  moves across the table; two-finger translation works while finger separation
  and wheel deltas cannot change camera distance or optical power. Click/tap
  again in the inspection view, or use Pull back, to return. Pull back
  restores table framing and retains the sampled position. Escape pulls back,
  then puts away, then follows the existing Focus/Overview hierarchy. Arrow keys
  move an active loupe, and Enter inspects it.
- A second contact or a drag suppresses both tap entry and tap pull-back. Blur, resize, pointer
  cancellation, capture loss and blocked UI cancel gestures. Reduced motion
  places the camera immediately. An approach can be reversed with Pull back/Esc.
- The model uses a hollow tapered body, 96 instanced grip ribs, flat collar,
  recessed bevel and glass, frosted skirt, retaining rings and soft contact shade.
  The old gold trim and hard shadow ring are removed.
- Optical effects toggle peripheral distortion, color separation, softness and
  vignetting while preserving central clarity and the physical housing. Effects
  and magnification preferences persist in local storage when available.
- Scene capture magnifies photographs, rebate, perforations and bare table.
  Source-detail loading prioritizes the frame beneath the loupe, independently
  of the selected Focus frame. No image content or detail is synthesized.

## Validation

Fixed-size follow-up on 2026-09-14: removed the activation-time zoom/aspect
calibration. Loupe scale is initialized from the film scene scale and preserved
through pickup and parking. Regression tests cover repeated activation at
multiple camera distances and desktop/iPad/iPhone aspect ratios, plus rendered
size growth when activating after zooming closer.

`PLAYWRIGHT_PORT=5193 PLAYWRIGHT_WORKERS=3 PLAYWRIGHT_OUTPUT_DIR=/workspace/film_photo/ignored_generated/m17-loupe/runs/20260914-ui-design-fixed-size npm run validate:m17`
passed the production build, 184 integration tests and all 24 M16/M17 browser
tests (47.7 seconds, no failures, skips or retries). Full browser evidence is in
that remote shared run directory; `activated-desktop.png` is copied to the
corresponding local shared run directory for visual review. Both preview routes
returned HTTP 200. Local diff whitespace checks passed.

Follow-up on 2026-09-14: clicking/tapping again in Inspection now pulls back.
The gesture hint and mouse/native Chromium touch/WebKit pointer journeys cover
this return, exact prior framing, retained sampling and drag/multitouch rejection.
The camera view matrix is refreshed before the loupe projects its hit region.
Two earlier runs exposed intermittent scene-placement failures after a camera
return; all 12 M17 browser tests passed after that matrix update (29.2 seconds,
no retries), along with the production build and all 183 integration tests.
All 9 M16 table browser checks also passed (22.1 seconds, no retries).
New M17 evidence: `ignored_generated/m17-loupe/runs/20260914-ui-design-tap-back-matrix/`.

Executed in the mapped remote checkout after flushing `orca-worktrees`:

```sh
PLAYWRIGHT_PORT=5193 PLAYWRIGHT_WORKERS=3 \
PLAYWRIGHT_OUTPUT_DIR=/workspace/film_photo/ignored_generated/m17-loupe/runs/20260914-ui-design-final \
npm run validate:m17
```

Passed on 2026-09-14 UTC:

- Production TypeScript/Vite build. The existing large-bundle advisory remains.
- 183 integration tests, 22 files.
- 21 browser tests: the M16 and M17 suites across desktop Chrome, mobile Chrome
  and mobile WebKit. Zero failures, skips or retries; browser run 42.9 seconds.
- Browser assertions include intermediate approach position, reversed approach,
  exact return pose, drag versus tap, two-contact cancellation, native Chromium
  multitouch, constant eye distance under pinch/wheel, translated sampling,
  magnification changes without camera zoom, persistent effects, positive versus
  negative pixels, perforation contrast and neutral/dimmable bare-table capture.
- Responsive screenshot/control-bound checks include 375×667, 390×844,
  820×1180, 1180×820, 844×390 and desktop 1280×800.
- Local `git diff --check` passed. No generated binaries are tracked.

The M17 gate intentionally runs the current M16/M17 browser interaction suites,
not the full historical M1–M15 browser suite. Earlier loupe journeys that assume
passive hover following, 2.5× default power or a detached touch lens describe
superseded interactions. Their historical accepted images are unchanged. The M6
and M8 integration default-power assertions were updated to the agreed 4× default;
all integration tests still run. M17 supplies current scene-optics coverage.

Mobile WebKit cannot dispatch native wheel input through Playwright: its wheel
handler is checked with a dispatched WheelEvent. Its multi-contact Pointer Event
path uses dispatched contacts. Chromium uses native CDP touch input. These are
browser tests, not physical iPhone/iPad Safari certification. No video recording
was enabled or claimed. Physical-device ergonomics and human visual acceptance
remain for review.

## Evidence and preview

Binary evidence is stored under the shared generated root:
`ignored_generated/m17-loupe/runs/20260914-ui-design-final/`.
Useful files include `inspection-effects-on.png`, `inspection-effects-off-8x.png`,
`activated-return.png`, `inspection-390x844.png`, `inspection-820x1180.png` and the
`scene-*.png` photo/perforation/table captures in their corresponding test folders.

Visual iteration replaced an initially overbright rounded rim with the dark,
flat collar and stepped bevel, closed a seam revealing the film, and initially reduced the
Activated size on pickup. The fixed-size follow-up removes that camera-dependent
resizing in response to user review. Early run
folders are diagnostic candidates, not accepted baselines.

The active local checkout is the Orca worktree
`/Users/zhangzimou/orca/workspaces/film_photo/ui-design`, mapped to
`/workspace/worktrees/orca/film_photo/ui-design`. The root `orca-worktrees`
Mutagen session was created with those root endpoints and verified connected and
conflict-free. The existing `film-photo` session actually excludes generated
folders in this environment; this run's media was copied back to the canonical
local shared output directory with SCP, without adding overlapping sync routes.

The production preview runs remotely on port 5194, forwarded over SSH:

- Mac: http://localhost:5194/?mode=inspect
- iPhone/iPad on the same Tailscale network: http://macbook:5194/?mode=inspect

Both routes returned HTTP 200. The existing port 5178 Tailscale service is preserved.

For review, open a frame, choose Loupe, drag it, tap the lens, move within
Inspection, try wheel/pinch, change power/effects, and Pull back. Check portrait
and landscape on an actual iPhone and iPad. High magnification remains limited by
the resolution of the source photograph.
