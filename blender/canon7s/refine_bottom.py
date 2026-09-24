"""Reference-matched Canon 7s underside; launch on the recorded master via the local Blender CLI.

This stage saves only a packed master and its measured report. It never invokes
rendering/export, rescales the camera, or changes any source image.
"""
from pathlib import Path
from math import cos, sin, pi, sqrt
import hashlib
import json
import shutil
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

PREFIX = 'Canon 7s underside | '
PARENT = 'blender/canon7s/surface_smoothing/runs/20260922-surface-b/canon7s-refined.blend'
PARENT_SHA = 'a67fa8e2e46c641ca9916c1e6223861efacfefb5942cc56d5d196e3d88ff7309'
REFERENCE_SHA = '800e6b2fb32e65ab76456ce8f5155788a0db0e3d78bcc0e8dbd7c29caf08e8fb'
REFERENCE_JPG = 'blender/canon7s/bottom/runs/20260922-bottom-a/reference/bottom_reference.jpg'
WIDTH = .9791259765625
WIDTH_MM = 138.0
UNIT_PER_MM = WIDTH / WIDTH_MM
CAP = (-.389, .091)
SOCKET = (.208, .091)
LATCH = (.381, .088)
SCREWS = ((.301, -.015), (.312, .169))
PLATE_Z = -.00015


def sha_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def digest_array(values):
    return hashlib.sha256(np.ascontiguousarray(values).tobytes()).hexdigest()


def values(collection, field, size, dtype=np.float32):
    result = np.empty((len(collection), size), dtype)
    collection.foreach_get(field, result.ravel())
    return result


def metal(name, color, roughness=.31, metallic=.88):
    material = bpy.data.materials.new(PREFIX + name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    material.diffuse_color = (*color, 1)
    return material


def intersects_disk(triangles, center, radius):
    """Include intersecting edges and triangles that enclose the entire disk."""
    points = triangles[:, :, :2] - np.asarray(center)
    hit = (np.sum(points * points, axis=2) <= radius * radius).any(axis=1)
    signs = []
    for j in range(3):
        a, b = points[:, j], points[:, (j + 1) % 3]
        edge = b - a
        t = np.clip(-np.sum(a * edge, axis=1) /
                    np.maximum(np.sum(edge * edge, axis=1), 1e-20), 0, 1)
        nearest = a + edge * t[:, None]
        hit |= np.sum(nearest * nearest, axis=1) <= radius * radius
        signs.append(edge[:, 0] * -a[:, 1] - edge[:, 1] * -a[:, 0])
    signs = np.asarray(signs)
    return hit | np.all(signs >= 0, axis=0) | np.all(signs <= 0, axis=0)


def mesh_object(scene, name, vertices, faces, material, smooth=True, cutouts=()):
    vertices = np.asarray(vertices, np.float32)
    faces = np.asarray(faces, np.int32)
    if cutouts:
        triangles = vertices[faces]
        keep = np.ones(len(faces), bool)
        for center, radius, ceiling in cutouts:
            keep &= ~(intersects_disk(triangles, center, radius) &
                      (triangles[:, :, 2].max(axis=1) < ceiling))
        faces = faces[keep]
    mesh = bpy.data.meshes.new(PREFIX + name)
    mesh.from_pydata(vertices.tolist(), [], faces.tolist())
    mesh.materials.append(material)
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = smooth and abs(face.normal.z) < .999
    obj = bpy.data.objects.new(mesh.name, mesh)
    scene.collection.objects.link(obj)
    obj['refinement_area'] = 'underside only'
    return obj


def lathe(scene, name, center, profile, material, segments=192, angles=None, cutouts=()):
    """Clockwise r/z profile, closed without a Boolean; visible bottom is -Z."""
    start, end = (0, 2 * pi) if angles is None else angles
    columns = segments if angles is None else segments + 1
    vertices = [(center[0] + radius * cos(start + (end - start) * j / segments),
                 center[1] + radius * sin(start + (end - start) * j / segments), z)
                for radius, z in profile for j in range(columns)]
    faces = []
    for row in range(len(profile)):
        following = (row + 1) % len(profile)
        for j in range(segments):
            k = (j + 1) % columns
            a, b = row * columns + j, row * columns + k
            c, d = following * columns + k, following * columns + j
            faces.extend(((a, c, b), (a, d, c)))
    if angles is not None:
        # The beveled rectangular profile is convex, so a fan closes each split.
        radius, z = np.mean(profile, axis=0)
        for endpoint, angle in ((0, start), (segments, end)):
            index = len(vertices)
            vertices.append((center[0] + radius * cos(angle), center[1] + radius * sin(angle), z))
            for row in range(len(profile)):
                a = row * columns + endpoint
                b = ((row + 1) % len(profile)) * columns + endpoint
                faces.append((index, b, a) if endpoint == 0 else (index, a, b))
    return mesh_object(scene, name, vertices, faces, material, cutouts=cutouts)


def disk(scene, name, center, radius, front, back, material, segments=160):
    vertices = [(center[0], center[1], front), (center[0], center[1], back)]
    for z in (front, back):
        vertices.extend((center[0] + radius * cos(2 * pi * j / segments),
                         center[1] + radius * sin(2 * pi * j / segments), z)
                        for j in range(segments))
    faces = []
    for j in range(segments):
        k = (j + 1) % segments
        a, b, c, d = 2 + j, 2 + k, 2 + segments + k, 2 + segments + j
        faces.extend(((0, b, a), (1, d, c), (a, b, c), (a, c, d)))
    return mesh_object(scene, name, vertices, faces, material)


def slotted_disk(scene, name, center, radius, length, width, angle, front, depth,
                 material, dark, segments=192):
    """Analytic capsule opening, bevel, vertical walls and recessed slot floor."""
    half_straight, half_width = (length - width) / 2, width / 2
    bevel = min(.00045, width * .18)
    back = front + depth + .0008
    vertices = []
    for row in range(6):
        for j in range(segments):
            theta = 2 * pi * j / segments
            c, s = abs(cos(theta)), abs(sin(theta))
            if half_width * c <= half_straight * s:
                opening = half_width / max(s, 1e-12)
            else:
                opening = half_straight * c + sqrt(max(0, half_width ** 2 - half_straight ** 2 * s ** 2))
            r, z = ((radius, back), (radius, front + bevel),
                    (radius - bevel, front), (opening + bevel, front),
                    (opening, front + bevel), (opening, front + depth))[row]
            vertices.append((center[0] + r * cos(theta + angle),
                             center[1] + r * sin(theta + angle), z))
    faces = []
    for row in range(5):
        for j in range(segments):
            k = (j + 1) % segments
            a, b, c, d = row * segments + j, row * segments + k, (row + 1) * segments + k, (row + 1) * segments + j
            faces.extend(((a, c, b), (a, d, c)))
    floor_start = len(faces)
    vertices.extend(((center[0], center[1], front + depth), (center[0], center[1], back)))
    for j in range(segments):
        k = (j + 1) % segments
        faces.append((6 * segments, 5 * segments + k, 5 * segments + j))
    for j in range(segments):
        faces.append((6 * segments + 1, j, (j + 1) % segments))
    obj = mesh_object(scene, name, vertices, faces, material)
    obj.data.materials.append(dark)
    for face in list(obj.data.polygons)[floor_start:floor_start + segments]:
        face.material_index = 1
    return obj


def threaded_socket(scene, silver, interior, dark):
    nominal, pitch = 6.35 * UNIT_PER_MM, 1.27 * UNIT_PER_MM
    major = nominal / 2
    thread_depth = 5 * sqrt(3) / 16 * pitch
    minor = major - thread_depth
    mouth, depth = .0022, 7.0 * UNIT_PER_MM
    end = mouth + depth
    objects = [lathe(scene, 'tripod socket mouth and narrow rim', SOCKET,
                    [(.034, .005), (.034, PLATE_Z), (.0325, PLATE_Z - .00012),
                     (.0260, PLATE_Z - .00012), (major + .0012, .0006),
                     (major, mouth), (major, .005)], silver)]
    segments, rows = 192, int(np.ceil(depth / pitch * 28))
    vertices = []
    for row in range(rows + 1):
        z = mouth + depth * row / rows
        fade = min(1, (z - mouth) / (pitch * .45), (end - z) / (pitch * .35))
        for j in range(segments):
            theta = 2 * pi * j / segments
            phase = ((z - mouth) / pitch - j / segments) % 1
            ridge = np.clip((.4375 - abs(phase - .5)) * sqrt(3) * pitch, 0, thread_depth)
            radius = major - ridge * fade
            vertices.append((SOCKET[0] + radius * cos(theta), SOCKET[1] + radius * sin(theta), z))
    faces = []
    for row in range(rows):
        for j in range(segments):
            k = (j + 1) % segments
            a, b, c, d = row * segments + j, row * segments + k, (row + 1) * segments + k, (row + 1) * segments + j
            faces.extend(((a, c, b), (a, d, c)))
    objects.append(mesh_object(scene, 'continuous female 1-4-20 thread', vertices, faces, interior))
    objects.append(disk(scene, 'tripod socket blind end', SOCKET, major, end, end + .001, dark))
    return objects, {'center_xy': list(SOCKET), 'standard': '1/4-20 UNC, right-handed',
                     'nominal_major_diameter_mm': 6.35, 'pitch_mm': 1.27,
                     'major_radius': major, 'minor_radius': minor, 'pitch': pitch,
                     'basic_internal_minor_diameter_mm': 2 * minor / UNIT_PER_MM,
                     'thread_profile': '60-degree flanks; truncated root and crest; eased entry/runout',
                     'mouth_z': mouth, 'blind_end_z': end, 'depth_mm': 7.0,
                     'depth_is_reference_estimate': True, 'turns': depth / pitch,
                     'wall_object': objects[1].name, 'blind_end_object': objects[2].name}


def other_mesh_state(obj):
    mesh = obj.data
    return {'name': obj.name, 'matrix': [list(row) for row in obj.matrix_world],
            'coordinates_sha256': digest_array(values(mesh.vertices, 'co', 3)),
            'topology_sha256': digest_array(values(mesh.loops, 'vertex_index', 1, np.int32)),
            'materials': [material.name if material else None for material in mesh.materials]}


def repair_source(source, scene, plate_material):
    """Delete only local underside faces; retain original vertex and corner data."""
    mesh = source.data
    if any(face.loop_total != 3 for face in mesh.polygons):
        raise RuntimeError('The exact parent must retain triangulated scan topology')
    if not np.array_equal(np.asarray(source.matrix_world), np.eye(4)):
        raise RuntimeError('The recorded Canon parent uses identity world coordinates')
    coordinates = values(mesh.vertices, 'co', 3)
    loops = values(mesh.loops, 'vertex_index', 1, np.int32).ravel()
    indices = loops.reshape(-1, 3)
    triangles = coordinates[indices]
    original_materials = values(mesh.polygons, 'material_index', 1, np.int32).ravel()
    original_smooth = values(mesh.polygons, 'use_smooth', 1, bool).ravel()
    original_normals = values(mesh.corner_normals, 'vector', 3)
    raw_normals = values(mesh.attributes['custom_normal'].data, 'value', 2, np.int32)
    uv = {layer.name: values(layer.data, 'uv', 2) for layer in mesh.uv_layers}
    colors = {layer.name: {'type': layer.data_type, 'domain': layer.domain,
                         'values': values(layer.data, 'color_srgb' if layer.data_type == 'BYTE_COLOR' else 'color', 4)}
              for layer in mesh.color_attributes}
    active_uv = mesh.uv_layers.active_index
    render_uv = [layer.name for layer in mesh.uv_layers if layer.active_render]
    active_color, render_color = mesh.color_attributes.active_color_index, mesh.color_attributes.render_color_index
    if set(uv) != {'UVMap', 'Canon reference details'} or 'Surface finish' not in colors:
        raise RuntimeError('Recorded parent UV/color layers are missing')
    if any(layer['domain'] != 'CORNER' for layer in colors.values()):
        raise RuntimeError('Unexpected parent color attribute domain')

    # The measured parent already has a smooth, nearly planar bottom. Retain it
    # exactly; replace its scanned stains/ghost fittings only on the underside.
    bottom = triangles[:, :, 2].max(axis=1) < .006
    slots = original_materials.copy()
    mesh.materials.append(plate_material)
    slots[bottom] = len(mesh.materials) - 1
    mesh.polygons.foreach_set('material_index', slots)
    cuts = [('battery cap', CAP, .0590, .018), ('tripod socket', SOCKET, .0250, .057),
            ('folding latch', LATCH, .0620, .020)]
    cuts.extend((f'plate screw {i}', center, .0080, .012) for i, center in enumerate(SCREWS, 1))
    removed = np.zeros(len(indices), bool)
    cut_reports = []
    patches = []
    for name, center, radius, ceiling in cuts:
        near = ((triangles[:, :, 0].min(axis=1) < center[0] + radius) &
                (triangles[:, :, 0].max(axis=1) > center[0] - radius) &
                (triangles[:, :, 1].min(axis=1) < center[1] + radius) &
                (triangles[:, :, 1].max(axis=1) > center[1] - radius) &
                (triangles[:, :, 2].max(axis=1) < ceiling))
        candidates = np.flatnonzero(near)
        selected = candidates[intersects_disk(triangles[candidates], center, radius)]
        if not len(selected):
            raise RuntimeError(f'No parent underside faces found for {name}')
        removed[selected] = True
        outer = max(radius + .003, float(np.linalg.norm(triangles[selected, :, :2] - center, axis=2).max()) + .0008)
        if outer > radius + .022:
            raise RuntimeError(f'Unexpectedly coarse parent cut boundary at {name}: {outer}')
        # A same-finish local annulus conceals the jagged triangulated cut edge.
        # This is base plate, not an additional decorative ring or a raised foot.
        patches.append(lathe(scene, f'base plate repair surround {name}', center,
                             [(outer, .0015), (outer, PLATE_Z), (radius, PLATE_Z),
                              (radius, .0015)], plate_material))
        cut_reports.append({'name': name, 'center_xy': list(center), 'aperture_radius': radius,
                            'source_z_ceiling': ceiling, 'removed_faces': int(len(selected)),
                            'repair_outer_radius': outer,
                            'removed_vertex_bounds': [triangles[selected].min(axis=(0, 1)).tolist(),
                                                      triangles[selected].max(axis=(0, 1)).tolist()]})
    keep = ~removed
    retained_loops = np.repeat(keep, 3)
    # Only faces are removed: vertex indices, UV seams and all point positions
    # remain stable. No remeshing, welding or million-polygon Boolean is used.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[int(i)] for i in np.flatnonzero(removed)], context='FACES_ONLY')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    actual_loops = values(mesh.loops, 'vertex_index', 1, np.int32).ravel()
    if not np.array_equal(actual_loops, loops[retained_loops]):
        raise RuntimeError('Unexpected topology or loop ordering after local face deletion')
    if not np.array_equal(values(mesh.vertices, 'co', 3), coordinates):
        raise RuntimeError('Local face deletion changed original vertex coordinates')

    # Restore the encoded normal values, not a decoded/re-encoded approximation.
    # Their normal-space basis is unchanged away from the cut-adjacent vertices.
    normal_attribute = mesh.attributes.get('custom_normal')
    if normal_attribute is None:
        mesh.normals_split_custom_set(original_normals[retained_loops])
        normal_attribute = mesh.attributes['custom_normal']
    normal_attribute.data.foreach_set('value', raw_normals[retained_loops].ravel())
    mesh.update()
    if not mesh.has_custom_normals:
        raise RuntimeError('Custom normals were lost')
    if not np.array_equal(values(normal_attribute.data, 'value', 2, np.int32), raw_normals[retained_loops]):
        raise RuntimeError('Encoded custom normals were altered')
    uv_report = {}
    for layer in mesh.uv_layers:
        actual = values(layer.data, 'uv', 2)
        expected = uv[layer.name][retained_loops]
        if not np.array_equal(actual, expected):
            raise RuntimeError(f'UV data changed during underside repair: {layer.name}')
        uv_report[layer.name] = {'parent_sha256': digest_array(uv[layer.name]),
                               'retained_sha256': digest_array(actual), 'retained_values_exact': True}
    color_report = {}
    for layer in mesh.color_attributes:
        snapshot = colors[layer.name]
        actual = values(layer.data, 'color_srgb' if layer.data_type == 'BYTE_COLOR' else 'color', 4)
        expected = snapshot['values'][retained_loops]
        if layer.domain != snapshot['domain'] or layer.data_type != snapshot['type'] or not np.array_equal(actual, expected):
            raise RuntimeError(f'Color data changed during underside repair: {layer.name}')
        color_report[layer.name] = {'type': layer.data_type, 'domain': layer.domain,
                                  'parent_sha256': digest_array(snapshot['values']),
                                  'retained_sha256': digest_array(actual), 'retained_values_exact': True}
    mesh.uv_layers.active_index = active_uv
    for layer in mesh.uv_layers:
        layer.active_render = layer.name in render_uv
    mesh.color_attributes.active_color_index = active_color
    mesh.color_attributes.render_color_index = render_color
    if not np.array_equal(values(mesh.polygons, 'material_index', 1, np.int32).ravel(), slots[keep]):
        raise RuntimeError('Unexpected source material reassignment')
    if not np.array_equal(values(mesh.polygons, 'use_smooth', 1, bool).ravel(), original_smooth[keep]):
        raise RuntimeError('Original source shading flags changed')
    touched_vertices = np.zeros(len(coordinates), bool)
    touched_vertices[indices[removed].ravel()] = True
    outside = ~(bottom | touched_vertices[indices].any(axis=1) | removed)
    outside_after = outside[keep]
    normal_error = float(np.max(np.abs(values(mesh.corner_normals, 'vector', 3)[np.repeat(outside_after, 3)] -
                                      original_normals[np.repeat(outside, 3)])))
    if normal_error > 1e-6:
        raise RuntimeError(f'Normals changed outside the underside: {normal_error}')
    report = {'source_object': source.name, 'source_vertices_before': len(coordinates),
              'source_vertices_after': len(mesh.vertices), 'source_faces_before': len(indices),
              'source_faces_after': len(mesh.polygons), 'removed_local_faces': int(removed.sum()),
              'moved_source_vertices': 0, 'all_source_vertex_coordinates_exactly_preserved': True,
              'source_coordinate_sha256': digest_array(coordinates),
              'source_bounds_before': [coordinates.min(axis=0).tolist(), coordinates.max(axis=0).tolist()],
              'source_bounds_after': [coordinates.min(axis=0).tolist(), coordinates.max(axis=0).tolist()],
              'underside_finish_z_ceiling': .006, 'underside_finish_faces': int((bottom & keep).sum()),
              'outside_underside_faces': int(outside.sum()), 'outside_materials_unchanged': True,
              'retained_topology_exact': True, 'original_smoothing_flags_exact': True,
              'uv_layers': uv_report, 'color_attributes': color_report,
              'encoded_custom_normals_retained_exactly': True,
              'retained_encoded_custom_normals_sha256': digest_array(raw_normals[retained_loops]),
              'outside_underside_decoded_normal_max_abs_error': normal_error,
              'cuts': cut_reports,
              'preservation_scope': 'All original vertices, retained UV/color/corner-normal values and non-underside materials; removed corner data belongs only to reported underside holes.'}
    return patches, report


def main():
    parent = Path(bpy.data.filepath).resolve()
    if parent != generated_path(PARENT).resolve() or sha_file(parent) != PARENT_SHA:
        raise RuntimeError('Open the exact recorded surface-b Canon master before this stage')
    reference = asset_path('blender/canon7s/reference/bottom.HEIC')
    if sha_file(reference) != REFERENCE_SHA:
        raise RuntimeError('The read-only underside reference checksum does not match')
    jpg = generated_path(REFERENCE_JPG)
    jpg_sha = sha_file(jpg)
    out = output_dir('blender/canon7s/bottom')
    if out == parent.parent:
        raise RuntimeError('The bottom stage cannot overwrite its parent run')
    scene = bpy.context.scene
    if any(obj.name.startswith(PREFIX) for obj in scene.objects):
        raise RuntimeError('Underside fittings already exist; start from the exact parent')
    source = max((obj for obj in scene.objects if obj.type == 'MESH'), key=lambda obj: len(obj.data.vertices))
    other_objects = [obj for obj in scene.objects if obj.type == 'MESH' and obj != source]
    other_before = [other_mesh_state(obj) for obj in other_objects]
    source_materials = list(source.data.materials)
    silver = metal('satin base plate', (.48, .49, .50))
    polished = metal('machined cap and latch', (.56, .575, .59), .27)
    interior = metal('thread and recess metal', (.25, .265, .28), .34)
    dark = metal('unlit blind recess', (.018, .021, .024), .67, .25)
    objects, preservation = repair_source(source, scene, silver)

    slot_angle = -.47
    dots = [(CAP[0] + .0538 * cos(slot_angle + k * pi),
             CAP[1] + .0538 * sin(slot_angle + k * pi)) for k in range(2)]
    cap_profile = [(.0680, .005), (.0680, .0009), (.0668, -.00045), (.0640, -.00045)]
    cap_profile.extend((float(radius), -.00035) for radius in np.linspace(.0635, .0500, 20))
    cap_profile.extend([(.0492, .0005), (.0492, .005)])
    objects.append(lathe(scene, 'battery cap concentric rim', CAP, cap_profile, polished, 320,
                         cutouts=[(center, .00165, .0011) for center in dots]))
    objects.append(slotted_disk(scene, 'battery cap recessed screwdriver slot', CAP, .0494, .059, .0092,
                                slot_angle, .0005, .0030, polished, dark, 256))
    for i, center in enumerate(dots, 1):
        objects.append(lathe(scene, f'battery cap spanner dot {i} lip and wall', center,
                             [(.0036, .0038), (.0036, -.00040), (.00165, -.00040),
                              (.00165, .0032)], polished, 64))
        objects.append(disk(scene, f'battery cap spanner dot {i} blind floor', center, .00165, .0032, .0038, dark, 64))

    socket_objects, socket_report = threaded_socket(scene, polished, interior, dark)
    objects.extend(socket_objects)
    objects.append(lathe(scene, 'folding latch recessed circular bezel', LATCH,
                         [(.0690, .010), (.0690, PLATE_Z - .00012), (.0668, PLATE_Z - .00012),
                          (.0628, .0012), (.0615, .0045), (.0615, .010)], polished))
    objects.append(disk(scene, 'folding latch recessed well', LATCH, .0620, .011, .012, dark))
    handle_profile = [(.0598, .0085), (.0598, .0032), (.0587, .0018),
                      (.0400, .0018), (.0384, .0030), (.0384, .0085)]
    split_angle = .030
    for i in range(2):
        objects.append(lathe(scene, f'folding latch closed handle half {i + 1}', LATCH, handle_profile,
                             polished, 128, angles=(-pi / 2 + i * pi + split_angle / 2,
                                                    pi / 2 + i * pi - split_angle / 2)))
    ring_profile = [(.0383, .009), (.0383, .0038), (.0375, .0027)]
    for radius in (.0345, .0300, .0255):
        ring_profile.extend([(radius + .0006, .0027), (radius, .0033),
                             (radius, .0042), (radius - .0008, .0042),
                             (radius - .0008, .0033), (radius - .0014, .0027)])
    ring_profile.extend([(.0225, .0027), (.0225, .009)])
    rings = lathe(scene, 'folding latch three concentric recessed rings', LATCH, ring_profile, polished, 256)
    rings.data.materials.append(interior)
    for face in rings.data.polygons:
        if face.normal.z < -.99 and .0039 < face.center.z < .0045:
            face.material_index = 1
    objects.append(rings)
    objects.append(disk(scene, 'folding latch plain center', LATCH, .0225, .0027, .009, polished))
    for i, center in enumerate(SCREWS, 1):
        objects.append(slotted_disk(scene, f'base plate slotted screw {i}', center, .0087, .0145, .00165,
                                    1.05 if i == 1 else .70, -.0002, .0015, polished, dark, 128))

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rays = []
    for radial in (0, .4, .8):
        for j in range(1 if radial == 0 else 12):
            angle = 2 * pi * j / 12
            x = SOCKET[0] + radial * socket_report['minor_radius'] * cos(angle)
            y = SOCKET[1] + radial * socket_report['minor_radius'] * sin(angle)
            hit, location, normal, face, obj, matrix = scene.ray_cast(depsgraph, Vector((x, y, -.1)), Vector((0, 0, 1)))
            if not hit or obj.original.name != socket_report['blind_end_object'] or abs(location.z - socket_report['blind_end_z']) > 2e-6:
                raise RuntimeError(f'Socket opening is obstructed at {(x, y)} by {obj.name if obj else None}')
            rays.append({'origin_xy': [x, y], 'first_hit_object': obj.original.name, 'first_hit_z': float(location.z)})
    wall_hits = []
    for j in range(8):
        angle = 2 * pi * j / 8
        direction = Vector((cos(angle), sin(angle), 0))
        start = Vector((*SOCKET, socket_report['mouth_z'] + .53 * (socket_report['blind_end_z'] - socket_report['mouth_z'])))
        hit, location, normal, face, obj, matrix = scene.ray_cast(depsgraph, start, direction)
        if not hit or obj.original.name != socket_report['wall_object'] or normal.dot(direction) > -.1:
            raise RuntimeError('Thread wall is missing or faces away from the open bore')
        wall_hits.append({'radius': float((location - start).length), 'inward_normal_dot': float(normal.dot(direction))})
    socket_report.update({'opening_clear_to_blind_end': True, 'clear_aperture_ray_count': len(rays),
                          'opening_rays': rays, 'inward_thread_wall_rays': wall_hits,
                          'through_opening_behavior': 'Open through the original base plate into a recessed threaded cavity; not through the entire camera. All sampled aperture rays first hit the modeled blind end.'})
    if [other_mesh_state(obj) for obj in other_objects] != other_before:
        raise RuntimeError('A separate parent detail object was modified')
    if list(source.data.materials)[:len(source_materials)] != source_materials:
        raise RuntimeError('Existing source materials were replaced')
    bounds = []
    for obj in scene.objects:
        if obj.type == 'MESH':
            coords = values(obj.data.vertices, 'co', 3)
            transform = np.asarray(obj.matrix_world)
            world = coords @ transform[:3, :3].T + transform[:3, 3]
            bounds.extend((world.min(axis=0), world.max(axis=0)))
    bounds = np.asarray(bounds)
    low, high = bounds.min(axis=0), bounds.max(axis=0)
    width = float(high[0] - low[0])
    if width != WIDTH:
        raise RuntimeError(f'Underside work altered the full X width: {width}')
    preservation['separate_parent_mesh_objects_unchanged'] = other_before
    added = [{'name': obj.name, 'vertices': len(obj.data.vertices), 'triangles': len(obj.data.polygons),
              'bounds': [list(v) for v in obj.bound_box]} for obj in objects]
    report = {'status': 'complete', 'parent_master': str(parent), 'parent_sha256': PARENT_SHA,
              'reference_source': str(reference), 'reference_source_sha256': REFERENCE_SHA,
              'reference_preview': str(jpg), 'reference_preview_sha256': jpg_sha,
              'method': 'Photo-aligned lathed and explicitly meshed fittings; local triangle cuts only; original nearly planar base receives satin finish without moving its vertices.',
              'preservation': preservation, 'added_objects': [obj.name for obj in objects], 'added_meshes': added,
              'added_triangles': sum(item['triangles'] for item in added),
              'physical_scale': {'original_width_units': WIDTH, 'final_width_units': width,
                                 'width_unchanged': True, 'requested_width_mm': WIDTH_MM,
                                 'units_per_mm': UNIT_PER_MM, 'mm_per_unit': 1 / UNIT_PER_MM,
                                 'master_was_rescaled': False, 'bounds': [low.tolist(), high.tolist()]},
              'cap': {'center_xy': list(CAP), 'outer_radius': .068, 'slot_length': .059,
                      'slot_width': .0092, 'slot_depth': .0030, 'slot_angle_radians': slot_angle,
                      'spanner_dot_centers': [list(center) for center in dots]},
              'socket': socket_report,
              'latch': {'center_xy': list(LATCH), 'recess_outer_radius': .069,
                        'handle_outer_radius': .0598, 'handle_face_z': .0018,
                        'concentric_groove_radii': [.0345, .0300, .0255],
                        'radial_split_count': 2, 'radial_split_angle': split_angle},
              'screws': [{'center_xy': list(center), 'radius': .0087} for center in SCREWS],
              'reference_interpretation': [
                  'Reference dimensions are 4032x3024; measurements below use its displayed preview coordinates. Front edge is image-up, and positive model X is image-right in the bottom view.',
                  'Photo feature centers (1568x1176 preview) are approximately cap (186,817), socket (1048,815), latch (1314,812), screws (1193,711) and (1211,920). Perspective prevents a single pixel/mm scale; placements use the supplied X estimates and measured parent plate footprint.',
                  'Measured parent flat underside spans approximately y=-.03 to .19. Midline fittings follow y=.088-.091 and screw positions follow the front/rear margins.',
                  'Nominal socket diameter and pitch are specified 1/4-20 dimensions at the requested 138mm full-camera width, not estimated from the photographed ellipse.',
                  'Socket depth 7mm, small slot/dot depths and hidden latch structure cannot be measured from one oblique photo; they are conservative reconstruction estimates, not recovered manufacturing dimensions.',
                  'Latch is represented in its photographed closed position with a recessed well, two split handle halves and three concentric grooves. Hidden hinge and moving mechanics are not invented.',
                  'No lettering, artificial wear, feet or additional controls are added. Source photography and all non-underside details remain unchanged.'
              ]}
    for filename in ('refinement_report.json', 'surface_report.json'):
        shutil.copy2(parent.parent / filename, out / filename)
    for image in bpy.data.images:
        if image.source == 'FILE' and not image.packed_file:
            image.pack()
    source['underside_refinement'] = 'Reference satin plate; slotted cap and spanner dots; open 1/4-20 blind socket; recessed split concentric latch; two slotted screws'
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'canon7s-refined.blend'))
    report['master_sha256'] = sha_file(out / 'canon7s-refined.blend')
    report['packed_file_images'] = all(image.packed_file for image in bpy.data.images if image.source == 'FILE')
    (out / 'bottom_report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'master': str(out / 'canon7s-refined.blend'), 'report': str(out / 'bottom_report.json'),
                      'added_meshes': len(objects), 'removed_faces': preservation['removed_local_faces']}), flush=True)


if __name__ == '__main__':
    main()
