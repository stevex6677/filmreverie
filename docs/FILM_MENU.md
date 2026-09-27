# Film cartridge navigation

The room and light-table overview share `src/components/FilmStripHeader.tsx`.
`src/components/film-strip-header.css` controls the responsive layout. The strip
is 88 CSS pixels high at every viewport width; its SVG mask cuts two uninterrupted
rows of perforations out of one background. Edge numbers and barcodes sit outside
the holes. The cartridge overlaps the left end without stretching the film.

Room returns to the room view and clears any shelf selection or open settings.
Film Shelf and Cameras use their existing shelf navigation. Light Table closes
the shelf selection and dispatches `APPROACH_TABLE`. The strip remains available
in the table overview; focused photographs and camera inspection retain their
dedicated controls. The active destination has `aria-current="page"` and a thin
border. `invert(1)` applies to each inactive photograph **and its caption as one
element**, while the film substrate, perforations and edge markings stay fixed.
Focus outlines, native buttons and 44-pixel minimum targets remain available.

The public film strip shows Create your own as a permanent amber outlined frame,
separate from the four destinations and before the utility icons. It retains the
existing new-tab guest welcome link. Guests already in their own darkroom retain
the existing guest controls. The overflow menu contains owner login and layout
preference; Create your own is no longer an overflow item. Film Shelf and Cameras
have no bottom collection bar. While Film Shelf is selected, its collection
summary, New roll, Trash/Saved rolls, and pagination are in More options.
Deletion undo and loading errors still appear as temporary notices.

Desktop photo frames are capped at roughly 101 pixels wide (420 pixels including
gaps), about one-third narrower than before. On phones each photo is 88 pixels
wide in a horizontally scrollable navigation window. Only the destinations and
their edge markings scroll; the cartridge, continuous perforated substrate,
Create your own, and utility controls stay fixed. Keyboard focus and destination
changes and viewport resizing reveal the relevant frame. Arrow keys, Home and
End move between frames. The gear opens Settings (including the room lighting panel when
the table is empty). On narrow screens, the gear and overflow controls stack so
the image frames retain usable touch targets without widening the film.
Room is the selected positive image in room view; Light Table becomes positive
only in table view. In-flight room/table journeys can reverse when another
destination is selected.

The light-table overview has no separate Room, Adjust, or Adjust view buttons,
and no bottom Focus frame / Frames / Fit roll toolbar. Frame tapping and Enter
still open a photograph; focused-frame navigation and loupe controls remain.
Its loupe toggle lives beside the gear in the film strip; Settings retains tilt,
yaw, and the optional drag-to-tilt mode. Focused photographs retain compact
Loupe and Settings controls beside their Overview action.

Settings panels sit below the film header and have no title row or close button.
Outside taps and Escape dismiss them and restore focus to the opener; navigation
also closes open settings. Their shared 120-film styling is described below.

## Runtime assets and provenance

These assets were created using the built-in image generation tool on 2026-09-27.
The original atlas and cartridge used the approved menu mockup as reference;
the additional Room frame uses the prompt below. No external
image requests are made by the application. These runtime assets belong in Git
and are included in the existing offline build inventory.

| Runtime file | Dimensions | SHA-256 |
| --- | --- | --- |
| `public/assets/navigation/darkroom-frames.jpg` | 1536 × 512 | `4c9500ccce4a6fba054849c2a38032f2ff594a3c7084182c1d6198be40a9af71` |
| `public/assets/navigation/film-reverie-cartridge.png` | 288 × 432, alpha | `fd573b3bd1321dd7b97240ac61a14a814573ce448b9b87e8c9141b1dd39c8ff6` |
| `public/assets/navigation/darkroom-room.jpg` | 600 × 400 | `a7e75c56aa2b392028d750c0f449f62dcd1815e7bb169e66d8cd9652cd29ecd3` |

The original generated photo atlas was 2048 × 683; the runtime JPEG was resized
with macOS `sips` (maximum dimension 1536, JPEG quality 86). The cartridge was
resized from 1024 × 1536 to a maximum dimension of 432, preserving alpha. The
atlas contains three equal-width positive photographs; it has no baked labels
or negative states. CSS crops the atlas without stretching the photographs.

### Photo atlas generation prompt

Create a single website navigation photo atlas, a wide landscape image of EXACTLY THREE EQUAL-WIDTH panels edge-to-edge in one horizontal row, zero gaps, zero borders, no film perforations, absolutely NO TEXT or labels. Each panel fills exactly one third of the total image. ALL THREE are NORMAL POSITIVE COLOR PHOTOGRAPHS, none are negatives; software will invert later. Match photographic contents and darkroom mood of the three little nav windows in provided reference: LEFT third: front view of dark wooden shelf filled with assorted analog film canisters and boxes, warm tungsten light. MIDDLE third: illuminated warm ivory photographic light table seen at a low oblique angle with brown 35mm film negatives lying across it and a dark cylindrical loupe. RIGHT third: silver and black vintage analog 35mm SLR with a large black glass lens viewed from front, sitting on a dark wood bench, softly blurred darkroom backdrop. Physically realistic photographs, rich warm natural positive colors, tasteful shadows but image subject very readable at thumbnail size. Subjects center in each equal-width panel. No lettering anywhere, no caption or label backing; software adds text. Asset intended as a 3-column sprite atlas, exact equal column boundaries mandatory. Wide aspect ratio 3:1 preferred.

### Cartridge generation prompt

Create a standalone transparent-background raster cutout asset of ONLY the black-and-yellow 35mm film cartridge at far left of provided reference. No film strip, no table, no background, no cast shadow beyond object, no other objects. Genuine transparent alpha around object, not a checkerboard image. Faithful Portra 160 cartridge geometry: upright cylinder, black rolled metal top and bottom rims, protruding black short central spool spindle at top, right-side tiny felt slit where film would emerge. Front-on camera with enough slight perspective to see curved cylinder and top rim, slender true 35mm cartridge proportions. Black satin wrap with vertical Kodak-yellow NOTES stripe on left and carefully typeset light gray text on black: main label EXACTLY lowercase 'film reverie', small '160' adjacent, small 'Color Negative Film', small 'C-41' above yellow strip. NO Kodak or Portra brand text. Match the accepted reference cartridge closely, extremely realistic materials and soft controlled highlights, crisp legible custom label. Entire cartridge visible centered, minimal transparent padding, tall portrait asset. Output transparent background.

### Room frame generation prompt

Create one photorealistic positive-color navigation thumbnail for a vintage film photography web app. Landscape 3:2 composition. A wide frontal view of a small dark photographic darkroom: dark wooden shelving with film boxes and canisters along the back wall, a glowing ivory photographic light table with strips of film in the foreground, a subtle red safelight to the left. Include the whole room clearly, unlike a closeup of just the light table or shelves. Rich dark warm wood tones, restrained amber and red illumination, realistic photographic grain, crisp recognizable composition at small size, normal positive photographic colors. No text, no labels, no borders, no perforations, no film cartridge, no app UI. Fill the entire frame with the room photo. This is a separate asset for a Room navigation button; CSS will invert it when unselected.

## Verification

`tests/e2e/m21-film-strip.spec.ts` checks real destination changes, rendered pixel
inversion in both the image and caption, usable button bounds at 320–1440 pixels,
caption placement between hole rows, and overflow-menu keyboard focus. It also
checks rapid Room/Table navigation, panel dismissal after scrolling, brightness
and rendering controls, Escape and focus restoration, frame selection, and loupe
settings at desktop and phone sizes. Existing
layout and gallery tests cover the shared owner/guest controls. Gallery checks
verify the pinned call to action, touch swiping, keyboard navigation, new-tab
guest welcome, and the public table with all three utility controls. Browser emulation
does not establish physical iPhone or iPad acceptance.

Implementation validation (2026-09-27): production build and TypeScript checks
passed; 297 integration tests passed; 14 selected desktop/mobile Chrome cases
passed across the film-strip and gallery suites for the narrower frames and
persistent Create your own action. Final production-build desktop/phone
screenshots were visually inspected, including public light-table widths
320, 390 and 1280 pixels. The login cases were checked against the production preview because
the existing development preview uses the local authentication bridge. WebKit
could not be installed: this Playwright release does not support macOS 13.

Overview-toolbar removal: production build/TypeScript and four selected
film-navigation/frame-chooser cases passed on desktop and mobile Chrome.
The resulting overview screenshot was reviewed with the bottom toolbar absent.

Shelf-toolbar removal: production build and TypeScript passed. All 297
integration cases were verified (two camera asset checks hit the five-second
limit during a concurrent browser run; the full 13-case camera file passed on
its isolated rerun). Ten selected desktop/mobile Chrome cases passed across
shelf editing, trash/restore/undo, later shelf pages, film navigation and the
public gallery. Desktop/phone Film Shelf and Cameras screenshots were visually
reviewed with both bottom bars absent and no page errors in the capture run.

## 120-film settings panels

Room and light-table tools, the frame chooser and camera information share
`FilmPanelFrames` and `film-panel.css`: solid dark film margins with a small
frame number, the active film stock’s edge label and a numbered triangle.
Numbers follow the same reading direction as the film label. No sprocket
holes, barcodes, heading or close button appear on these panels. The desktop
and phone tool panels remain below the navigation strip, scroll independently,
and leave outside space available for dismissal.

`usePanelDismiss` closes on an outside tap/click or Escape. A pointer gesture
starting on a slider does not dismiss when it ends outside. Outside scene taps
are consumed, while navigation buttons retain their actions. The camera's
compact information sheet uses the same outside-dismissal behavior; its full
desktop information column remains part of the camera inspection layout.
