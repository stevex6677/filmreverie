# Independent Mamiya Universal component studies

Three new models reconstructed from the detached-component photographs.
Each `.blend` contains one part, its editable construction, and a review studio.
There is no assembled camera scene. Earlier assembled models are unchanged.

| Part | Editable file | Reference photos | Review views |
| --- | --- | --- | --- |
| Camera body | `body_study.blend` | IMG_1989–1999, IMG_2001 | Front oblique, front elevation, rear oblique, side profile |
| Sekor lens | `lens_study.blend` | IMG_1978–1983 | Oblique, side profile, optical face |
| Roll-film back | `film_back_study.blend` | IMG_1984–1988, IMG_2005 | Rear oblique, rear elevation, top controls, attachment face |

## What changed

**Body:** larger mount and clear opening relative to body width, a hollow round-to-square chamber, curved nameplate clearance, recessed finder surrounds, stepped side panels and rear frame, and a thin asymmetric eyecup with a rolled lip. The lens and film back are absent.

**Lens:** a continuous stepped radial profile, distinct mount / focus / shutter / front-barrel sections, integrated groups of axial flutes, scalloped locking ring, thin vented hood, recessed optical seat, and articulated control arms. The lens stands on its rear mount with its optical axis along +Z.

**Film back:** unequal end chambers, a shallower central cover, a stepped upper bridge, continuous curved cover and seams, memo clip, folded latch, spool retainers, and swept advance lever. The ASA dial is on the left when viewed from the rear; the advance lever and latch are on the right.

## Scope and scale

These are neutral-gray shape studies. Surface textures, wear, optical shaders, and fine painted lens scales are deferred so that silhouettes and construction can be judged directly. Major labels remain editable geometry.

Dimensions are working estimates from photo ratios, not measured CAD dimensions. The nominal body shell is 140 × 184 × 55 mm; the lens is approximately 96 mm across its hood and 113 mm long; the film back is approximately 236 mm wide. These independent working scales have not been fitted together. The unphotographed film-back attachment internals are simplified.

Reference JPEGs are in `../detail_reference_previews/`. No external textures or linked libraries are required by the Blender files.

## Editing and rendering

Each file has three collections:

- `01 Editable component`: named meshes, curves and labels, parented to one component origin.
- `02 Hidden construction`: retained cutters for editable openings and slots.
- `03 Review studio`: cameras, lights and seamless backdrop; hidden in the working viewport but enabled for rendering.

The files open focused on their individual component. Review images are in `renders/`, at 1400 × 1400 pixels using Cycles, 48 samples, and denoising. Each part has a contact sheet, and `component_overview.jpg` shows the three independent studies together as a comparison image.

Rebuild in a **fresh background Blender process**, from this directory:

```sh
blender --background --factory-startup --python build_components.py -- body
blender --background --factory-startup --python build_components.py -- lens
blender --background --factory-startup --python build_components.py -- film_back
```

The builder initializes an empty scene; use the background commands rather than executing it inside an unsaved interactive Blender session.

Render the cameras of one saved part:

```sh
blender --background body_study.blend --python render_component.py
```

Optional render arguments are `-- RESOLUTION SAMPLES CAMERA_INDEX`. Index 0 renders all cameras. Resolutions below 1400 are written to `previews/`.
