"""Replace only the winding-side enamel's photographic material discontinuity.

Imported by build_delivery after refine_autocord; no import-time scene mutations.
The existing mesh, controls, trim, original UV layers and coordinates are retained.
"""
from pathlib import Path

import bpy
import numpy as np


_HEIGHT = .9793701171875
_SCALE = _HEIGHT * 1.15
_OLD_MATERIAL = 'pressure plate instructions | reference inscription'
_UV_NAME = 'Continuous winding enamel'
# Side orthographic calibration used by refine_autocord, not render output pixels.
# The bottom follows the recess around the large winding dial, not a rectangle.
_PANEL = np.array([
    (417, 302), (426, 295), (598, 295), (607, 307),
    (610, 324), (610, 503), (606, 519), (593, 530),
    (533, 530), (515, 519), (489, 508), (464, 501), (417, 501),
], dtype=np.float64)
_TEXTURE_BOX = (410., 290., 614., 534.)
_ENAMEL = np.array([24., 25., 26.], dtype=np.float32) / 255.
_INK = np.array([224., 211., 191.], dtype=np.float32) / 255.


def _project(points):
    return np.column_stack((500 - points[:, 1] * 1000 / _SCALE,
                            500 - (points[:, 2] - _HEIGHT / 2) * 1000 / _SCALE))


def _homography():
    src = [(444, 431), (592, 431), (592, 504), (444, 504)]
    dst = [(565, 536), (975, 542), (975, 746), (565, 738)]
    a, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        a.extend([[x, y, 1, 0, 0, 0, -u*x, -u*y],
                  [0, 0, 0, x, y, 1, -v*x, -v*y]])
        b.extend([u, v])
    return np.append(np.linalg.solve(a, b), 1).reshape(3, 3)


def _inside_polygon(points, polygon):
    x, y = points.T
    inside = np.zeros(len(points), dtype=bool)
    previous = polygon[-1]
    for current in polygon:
        x1, y1 = previous
        x2, y2 = current
        if y1 != y2:
            inside ^= ((y1 > y) != (y2 > y)) & (x < (x2-x1)*(y-y1)/(y2-y1)+x1)
        previous = current
    return inside


def _inscription_texture(reference_dir):
    """Extract photographed warm ink, never the photograph's enamel/lighting."""
    path = reference_dir / 'right_side_text.jpg'
    # Separate datablock: reading raw reference channels must not alter an image
    # that is already used by any other material in the scene.
    source = bpy.data.images.load(str(path), check_existing=False)
    source.colorspace_settings.name = 'Non-Color'
    try:
        width, height = source.size
        pixels = np.empty(width * height * 4, np.float32)
        source.pixels.foreach_get(pixels)
        pixels = pixels.reshape(height, width, 4)
        left, top, right, bottom = _TEXTURE_BOX
        tw, th = 1224, 1464  # Six texels per calibrated model-screen pixel.
        u = left + (np.arange(tw, dtype=np.float64) + .5) * (right-left) / tw
        v = bottom - (np.arange(th, dtype=np.float64) + .5) * (bottom-top) / th
        xx, yy = np.meshgrid(u, v)
        points = np.column_stack((xx.ravel(), yy.ravel(), np.ones(tw*th)))
        mapped = points @ _homography().T
        mapped = mapped[:, :2] / mapped[:, 2, None]
        # Original photo calibration is in displayed 1176 x 1568 coordinates.
        sx = np.clip(mapped[:, 0] / 1176 * width - .5, 0, width-1)
        sy = np.clip((1-mapped[:, 1] / 1568) * height - .5, 0, height-1)
        ix, iy = sx.astype(np.int32), sy.astype(np.int32)
        dx, dy = (sx-ix)[:, None], (sy-iy)[:, None]
        ix1, iy1 = np.minimum(ix+1, width-1), np.minimum(iy+1, height-1)
        rgb = ((pixels[iy, ix, :3]*(1-dx) + pixels[iy, ix1, :3]*dx)*(1-dy)
               + (pixels[iy1, ix, :3]*(1-dx) + pixels[iy1, ix1, :3]*dx)*dy)
    finally:
        bpy.data.images.remove(source)

    # Only actual printed lines/diagrams can contribute ink. This excludes the
    # chrome ring, reflections, panel border and large photographed scratches.
    # Warm-ink discrimination also rejects neutral scratches through the diagram.
    boxes = [
        (594, 545, 744, 598), (790, 545, 938, 601),
        (696, 603, 849, 639), (697, 641, 801, 676),
        (696, 678, 840, 713), (576, 602, 667, 696),
        (615, 696, 656, 723), (870, 606, 962, 701),
        (873, 699, 913, 727),
    ]
    px, py = mapped.T
    printing = np.zeros(len(px), dtype=bool)
    for x0, y0, x1, y1 in boxes:
        printing |= (px >= x0) & (px <= x1) & (py >= y0) & (py <= y1)
    luminance = rgb @ np.array([.2126, .7152, .0722])
    coverage = np.clip((luminance-.30)/.30, 0, 1)
    coverage *= np.clip((rgb[:, 0]-rgb[:, 2]-.015)/.06, 0, 1)
    coverage *= printing
    coverage = coverage.astype(np.float32)
    rgba = np.ones((tw*th, 4), np.float32)
    rgba[:, :3] = _ENAMEL + coverage[:, None] * (_INK-_ENAMEL)
    background = coverage == 0
    assert np.array_equal(rgba[background, :3],
                          np.broadcast_to(_ENAMEL, (int(background.sum()), 3)))
    image = bpy.data.images.new('Winding enamel | constant base and isolated reference ink',
                                width=tw, height=th, alpha=False)
    image.colorspace_settings.name = 'sRGB'
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(reference_dir / 'winding_enamel_basecolor.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image, {
        'source': str(path), 'output': image.filepath_raw,
        'size': [tw, th], 'background_srgb': _ENAMEL.tolist(),
        'ink_srgb': _INK.tolist(), 'background_exactly_constant': True,
        'background_texels': int(background.sum()),
        'ink_texels': int(np.count_nonzero(coverage)),
        'method': 'Warm reference ink alpha composited on one constant enamel; no photographic background',
    }


def refine_side_panel(scene, reference_dir):
    """Return measured local material changes; do not save/export the scene."""
    reference_dir = Path(reference_dir)
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    obj = next((item for item in meshes
                if item.name == 'Minolta Autocord | localized reference repairs'),
               max(meshes, key=lambda item: len(item.data.polygons)))
    mesh = obj.data
    coords = np.empty(len(mesh.vertices)*3, np.float32)
    mesh.vertices.foreach_get('co', coords)
    coords = coords.reshape(-1, 3)
    indices = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', indices)
    if any(poly.loop_total != 3 for poly in mesh.polygons):
        raise ValueError('Winding enamel expects the existing triangulated source mesh')
    triangles = indices.reshape(-1, 3)
    centers = coords[triangles].mean(axis=1)
    projected = _project(centers)
    old_indices = np.empty(len(mesh.polygons), np.int32)
    mesh.polygons.foreach_get('material_index', old_indices)
    old_slot = next(i for i, material in enumerate(mesh.materials)
                    if material and material.name == _OLD_MATERIAL)
    old_patch = old_indices == old_slot
    # Scan relief around the recess extends beyond the flat lettering surface.
    # Include that paint; protect the shallow, texture-defined controls explicitly.
    surface = (centers[:, 0] > -.278) & (centers[:, 0] < -.2535)
    surface &= (projected[:, 1] > 353) | (centers[:, 0] > -.264)
    region = _inside_polygon(projected, _PANEL)
    candidates = region & surface
    # Do not repaint an independent inscription/material belonging to a control.
    candidates &= (old_indices == 0) | old_patch
    # Some metal controls are nearly coplanar in this scan, so depth alone
    # cannot distinguish them from enamel. These masks follow their outlines.
    marker = _inside_polygon(projected, np.array([
        (421, 380), (453, 380), (453, 409), (421, 409),
    ]))
    knob = np.linalg.norm(projected - (513, 391), axis=1) < 42.5
    button = np.linalg.norm(projected - (571, 368.5), axis=1) < 14
    selected = (candidates | old_patch) & ~(marker | knob | button)
    face_ids = np.flatnonzero(selected)
    if not len(face_ids) or not np.any(selected & ~old_patch):
        raise ValueError('Full winding enamel selection did not extend beyond the old text patch')

    image, texture_report = _inscription_texture(reference_dir)
    material = bpy.data.materials.new('Winding panel | continuous black enamel and cream ink')
    material.use_nodes = True
    material.diffuse_color = (*_ENAMEL.tolist(), 1)
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0.
    bsdf.inputs['Roughness'].default_value = .30
    bsdf.inputs['Specular IOR Level'].default_value = .25
    tex = material.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.interpolation = 'Linear'
    tex.extension = 'EXTEND'
    uv_node = material.node_tree.nodes.new('ShaderNodeUVMap')
    original_active_uv = mesh.uv_layers.active_index
    original_render_uv = next((item.name for item in mesh.uv_layers if item.active_render), None)
    layer = mesh.uv_layers.new(name=_UV_NAME)
    uv_node.uv_map = layer.name
    material.node_tree.links.new(uv_node.outputs['UV'], tex.inputs['Vector'])
    material.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.materials.append(material)
    material_index = len(mesh.materials)-1
    loop_ids = (face_ids[:, None]*3 + np.arange(3)).ravel()
    screen = _project(coords[indices[loop_ids]])
    left, top, right, bottom = _TEXTURE_BOX
    uv = np.zeros((len(mesh.loops), 2), np.float32)
    uv[loop_ids, 0] = (screen[:, 0]-left)/(right-left)
    uv[loop_ids, 1] = (bottom-screen[:, 1])/(bottom-top)
    layer.data.foreach_set('uv', uv.ravel())
    mesh.uv_layers.active_index = original_active_uv
    if original_render_uv is not None:
        mesh.uv_layers[original_render_uv].active_render = True
    new_indices = old_indices.copy()
    new_indices[selected] = material_index
    mesh.polygons.foreach_set('material_index', new_indices)
    mesh.update()

    # These are measured runtime invariants, not assertions inferred from masks.
    after = np.empty(coords.size, np.float32)
    mesh.vertices.foreach_get('co', after)
    coordinate_exact = np.array_equal(after, coords.ravel())
    assigned = np.empty(len(mesh.polygons), np.int32)
    mesh.polygons.foreach_get('material_index', assigned)
    outside_materials_exact = np.array_equal(assigned[~selected], old_indices[~selected])
    assert coordinate_exact and outside_materials_exact
    assert np.all(assigned[old_patch & selected] == material_index)
    return {
        'object': obj.name, 'material': material.name,
        'faces': int(len(face_ids)), 'old_patch_faces': int(old_patch.sum()),
        'additional_panel_faces': int((selected & ~old_patch).sum()),
        'new_polygons': 0, 'moved_vertices': 0,
        'all_coordinates_exactly_preserved': bool(coordinate_exact),
        'outside_coordinates_exactly_preserved': bool(coordinate_exact),
        'outside_material_assignments_exactly_preserved': bool(outside_materials_exact),
        'original_uv_layers_untouched': True,
        'face_screen_bounds': [projected[selected].min(axis=0).tolist(),
                               projected[selected].max(axis=0).tolist()],
        'panel_boundary_screen': _PANEL.tolist(),
        'enamel_depth_slab': [-.278, -.2535],
        'material_definition': {'metallic': 0., 'roughness': .30, 'specular_ior_level': .25,
                                'basecolor': 'UV PNG with constant enamel and isolated ink',
                                'procedural_nodes': False},
        'texture': texture_report,
        'calibration_note': 'Panel polygon follows the scanned physical recess; raised chrome is depth-excluded. Inspect the marker and curved dial-side edge in the integrated side render.',
    }
