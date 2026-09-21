"""Replace only the upper viewing-lens inscription material, never its geometry.

Import-safe Blender module. Run prepare_upper_front.py with standalone Python
first; build_delivery owns execution, saving, rendering and exporting.
"""
import hashlib
import json
from pathlib import Path

import bpy
import numpy as np
from front_inscription_normals import inscription_normals


def _world_outline(screen, calibration):
    points = np.asarray(screen, dtype=np.float64)
    size = calibration['screen_size']
    scale = calibration['ortho_scale'] / size
    cx, cz = calibration['camera_target_xz']
    return np.column_stack((cx + (points[:, 0] - size / 2) * scale,
                            cz - (points[:, 1] - size / 2) * scale))


def _annulus(points, center, inner, outer):
    delta = points[:, (0, 2)] - center
    angle = np.arctan2(delta[:, 1], delta[:, 0])
    radius = np.linalg.norm(delta, axis=1)
    boundaries = []
    for outline in (inner, outer):
        edge = outline - center
        boundaries.append(np.interp(angle, np.arctan2(edge[:, 1], edge[:, 0]),
                                    np.linalg.norm(edge, axis=1), period=2 * np.pi))
    inner_radius, outer_radius = boundaries
    radial = (radius - inner_radius) / (outer_radius - inner_radius)
    clockwise = np.mod(.25 - angle / (2 * np.pi), 1.)
    return clockwise, radial


def _uv_digests(mesh, names):
    buffer = np.empty(len(mesh.loops) * 2, np.float32)
    result = {}
    for name in names:
        mesh.uv_layers[name].data.foreach_get('uv', buffer)
        result[name] = hashlib.sha256(buffer.tobytes()).hexdigest()
    return result


def _texture(nodes, links, uv_node, reference_dir, filename, colorspace):
    image = bpy.data.images.load(str(reference_dir / filename), check_existing=False)
    image.colorspace_settings.name = colorspace
    image.pack()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Linear'
    texture.extension = 'REPEAT'
    links.new(uv_node.outputs['UV'], texture.inputs['Vector'])
    return texture


def refine_upper_front(scene, reference_dir):
    """Assign packed enamel/ivory maps to the original narrow physical annulus."""
    reference_dir = Path(reference_dir)
    calibration = json.loads((reference_dir / 'upper_view_calibration.json').read_text())
    center = _world_outline([calibration['center_screen']], calibration)[0]
    inner = _world_outline(calibration['inner_screen'], calibration)
    outer = _world_outline(calibration['outer_screen'], calibration)
    meshes = [item for item in scene.objects if item.type == 'MESH']
    obj = next((item for item in meshes
                if item.name == 'Minolta Autocord | localized reference repairs'),
               max(meshes, key=lambda item: len(item.data.polygons)))
    mesh = obj.data
    if any(poly.loop_total != 3 for poly in mesh.polygons):
        raise ValueError('Upper lettering requires the existing triangulated source mesh')
    coords = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get('co', coords)
    coords = coords.reshape(-1, 3)
    indices = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', indices)
    triangles = indices.reshape(-1, 3)
    old_indices = np.empty(len(mesh.polygons), np.int32)
    mesh.polygons.foreach_get('material_index', old_indices)
    # Evaluate the entire triangle, not only its center: even boundary triangles
    # may not spill onto the glass, outer chrome lip or an adjacent bayonet tab.
    _, radial = _annulus(coords, center, inner, outer)
    depth_min, depth_max = calibration['depth_slab']
    in_surface = (radial >= 0.) & (radial <= 1.)
    in_surface &= (coords[:, 1] >= depth_min) & (coords[:, 1] <= depth_max)
    in_surface &= coords[:, 2] > calibration['minimum_z']
    selected = np.all(in_surface[triangles], axis=1) & (old_indices == 0)
    face_ids = np.flatnonzero(selected)
    if not len(face_ids):
        raise ValueError('Calibrated upper inscription annulus selected no source faces')
    loop_ids = (face_ids[:, None] * 3 + np.arange(3)).ravel()
    affected_vertices = np.unique(indices[loop_ids])
    uv_names = [layer.name for layer in mesh.uv_layers]
    uv_before = _uv_digests(mesh, uv_names)
    original_active = mesh.uv_layers.active_index
    original_render = next((layer.name for layer in mesh.uv_layers if layer.active_render), None)

    material = bpy.data.materials.new('Upper VIEW lens | aged black enamel and ivory inscription')
    material.use_nodes = True
    material.diffuse_color = (21 / 255, 22 / 255, 21 / 255, 1.)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0.
    bsdf.inputs['Roughness'].default_value = .39
    bsdf.inputs['Specular IOR Level'].default_value = .25
    layer = mesh.uv_layers.new(name='Front inscription strips')
    uv_node = nodes.new('ShaderNodeUVMap')
    uv_node.uv_map = layer.name
    color = _texture(nodes, links, uv_node, reference_dir, calibration['basecolor'], 'sRGB')
    roughness = _texture(nodes, links, uv_node, reference_dir, calibration['roughness'], 'Non-Color')
    links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(roughness.outputs['Color'], bsdf.inputs['Roughness'])
    u, v = _annulus(coords[indices[loop_ids]], center, inner, outer)
    u = u.reshape(-1, 3)
    # Unwrap each seam-crossing triangle into the adjacent repeat. Without this,
    # the twelve-o'clock seam would smear a whole circumference through VIEW.
    crosses_seam = np.ptp(u, axis=1) > .5
    u += crosses_seam[:, None] & (u < .5)
    uv = np.zeros((len(mesh.loops), 2), np.float32)
    uv[loop_ids, 0] = u.ravel()
    uv[loop_ids, 1] = v
    layer.data.foreach_set('uv', uv.ravel())
    mesh.uv_layers.active_index = original_active
    if original_render is not None:
        mesh.uv_layers[original_render].active_render = True
    mesh.materials.append(material)
    updated_indices = old_indices.copy()
    updated_indices[selected] = len(mesh.materials) - 1
    mesh.polygons.foreach_set('material_index', updated_indices)
    mesh.update()
    normal_report = inscription_normals(mesh, coords, indices, {'upper': loop_ids})

    after = np.empty(coords.size, np.float32)
    mesh.vertices.foreach_get('co', after)
    assigned = np.empty(len(mesh.polygons), np.int32)
    mesh.polygons.foreach_get('material_index', assigned)
    after_loops = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', after_loops)
    unchanged_coordinates = np.array_equal(coords.ravel(), after)
    unchanged_topology = np.array_equal(indices, after_loops)
    unchanged_outside = np.array_equal(old_indices[~selected], assigned[~selected])
    unchanged_uv = uv_before == _uv_digests(mesh, uv_names)
    if not all((unchanged_coordinates, unchanged_topology, unchanged_outside, unchanged_uv)):
        raise AssertionError('Upper annulus preservation invariant failed')
    affected = coords[affected_vertices]
    return {
        'object': obj.name, 'material': material.name,
        'transcription': calibration['transcription'],
        'reference': str(reference_dir / calibration['reference']),
        'affected_polygons': int(len(face_ids)), 'affected_vertices': int(len(affected_vertices)),
        'affected_polygon_ids_sha256': hashlib.sha256(face_ids.tobytes()).hexdigest(),
        'affected_bounds_xyz': [affected.min(axis=0).tolist(), affected.max(axis=0).tolist()],
        'center_xz': center.tolist(), 'inner_boundary_xz': inner.tolist(),
        'outer_boundary_xz': outer.tolist(), 'depth_slab': [depth_min, depth_max],
        'mask': 'Every triangle vertex inside independent calibrated annular boundaries and depth slab; source material only',
        'moved_vertices': 0, 'max_vertex_displacement': 0., 'new_polygons': 0,
        'all_coordinates_exactly_preserved': bool(unchanged_coordinates),
        'topology_exactly_preserved': bool(unchanged_topology),
        'outside_material_assignments_exactly_preserved': bool(unchanged_outside),
        'original_uv_layers_exactly_preserved': bool(unchanged_uv),
        'preserved': ['viewing glass', 'chrome bezel', 'bayonet tabs', 'front badge',
                      'lower taking lens', 'controls', 'body', 'side', 'rear', 'bottom'],
        'textures': [color.image.filepath, roughness.image.filepath],
        'textures_packed': bool(color.image.packed_file and roughness.image.packed_file),
        'surface_normal_repair': normal_report,
        'material_definition': {'metallic': 0., 'enamel_roughness': .39,
                                'ink_roughness': .49, 'specular_ior_level': .25,
                                'image_based_gltf_pbr': True},
        'visual_validation_note': 'Narrow inscription surface shading recovered from its smooth depth profile; '
                                  'vertex positions retained. Chrome and glass shading are unchanged.',
    }
