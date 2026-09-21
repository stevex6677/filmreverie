"""Localized Autocord underside reconstruction; called by the delivery builder."""
from pathlib import Path
from math import cos, sin, pi

import bpy
import bmesh
import numpy as np
from mathutils import Vector


_PREFIX = 'Autocord underside | '
_CENTER = (0.0, 0.070)
_OUTER_RADIUS = 0.095
# Existing rectangular scan feet, measured in the orthographic before/bottom view.
_FOOT_SITES = (
    {'old': (-0.189, 0.203), 'new': (-0.192, 0.215)},
    {'old': (0.203, 0.203), 'new': (0.200, 0.215)},
)


def _metal(name, color, roughness, metallic=1.0):
    material = bpy.data.materials.new(_PREFIX + name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    material.diffuse_color = (*color, 1)
    return material


def _mesh_object(scene, name, vertices, faces, material, smooth=True):
    mesh = bpy.data.meshes.new(_PREFIX + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    obj = bpy.data.objects.new(mesh.name, mesh)
    scene.collection.objects.link(obj)
    obj['refinement_area'] = 'underside only'
    return obj


def _lathe(scene, name, center, profile, material, segments=160, slope=0.0):
    """Closed clockwise r/z profile; its exposed bottom has outward -Z normals."""
    vertices = []
    for radius, z in profile:
        for j in range(segments):
            angle = 2 * pi * j / segments
            x, y = radius * cos(angle), radius * sin(angle)
            vertices.append((center[0] + x, center[1] + y, z + slope * y))
    faces = []
    for row in range(len(profile)):
        following = (row + 1) % len(profile)
        for j in range(segments):
            k = (j + 1) % segments
            a, b = row * segments + j, row * segments + k
            c, d = following * segments + k, following * segments + j
            faces.extend(((a, c, b), (a, d, c)))
    obj=_mesh_object(scene, name, vertices, faces, material)
    # Keep the machined annular faces planar; smooth only the turned bevels.
    for polygon in obj.data.polygons:
        if abs(polygon.normal.z)>.999:polygon.use_smooth=False
    return obj


def _threaded_bore(scene, material, dark_material):
    """An open mouth, continuous female helical wall, and a deep blind end."""
    count, rows = 160, 120
    mouth, end, pitch = 0.0115, 0.0475, 0.0065
    vertices = []
    for row in range(rows + 1):
        z = mouth + (end - mouth) * row / rows
        fade = min(1.0, (z - mouth) / 0.003, (end - z) / 0.003)
        for j in range(count):
            angle = 2 * pi * j / count
            phase = ((z - mouth) / pitch - j / count) % 1.0
            ridge = max(0.0, min(1.0, 1.8 - 4.0 * abs(phase - 0.5)))
            radius = 0.0190 - 0.00155 * ridge * fade
            vertices.append((_CENTER[0] + radius * cos(angle),
                             _CENTER[1] + radius * sin(angle), z))
    faces = []
    for row in range(rows):
        for j in range(count):
            k = (j + 1) % count
            a, b = row * count + j, row * count + k
            c, d = (row + 1) * count + k, (row + 1) * count + j
            faces.extend(((a, c, b), (a, d, c)))
    wall = _mesh_object(scene, 'recessed female tripod thread', vertices, faces, material)
    vertices = [(_CENTER[0], _CENTER[1], end)]
    vertices.extend((_CENTER[0] + 0.0190 * cos(2 * pi * j / count),
                     _CENTER[1] + 0.0190 * sin(2 * pi * j / count), end)
                    for j in range(count))
    faces = [(0, 1 + (j + 1) % count, 1 + j) for j in range(count)]
    cap = _mesh_object(scene, 'deep socket blind end', vertices, faces, dark_material, False)
    return [wall, cap], {'mouth_z': mouth, 'thread_end_z': end, 'blind_end_z': end,
                         'major_radius': 0.019, 'minor_radius': 0.01745,
                         'pitch': pitch, 'turns': (end - mouth) / pitch}


def _intersects_disk(triangles, center, radius):
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


def _leather_material(reference_dir):
    """Photographed grain, with illumination removed, shared across the bottom."""
    image=bpy.data.images.load(str(reference_dir/'bottom_close.jpg'),check_existing=False)
    image.colorspace_settings.name='Non-Color'
    width,height=image.size
    pixels=np.empty(width*height*4,np.float32)
    image.pixels.foreach_get(pixels)
    pixels=pixels.reshape(height,width,4)
    crop=pixels[int((1-435/1176)*height):int((1-330/1176)*height),
                int(525/1568*width):int(638/1568*width),:3].copy()
    bpy.data.images.remove(image)
    del pixels
    luminance=crop@np.array([.2126,.7152,.0722],np.float32)
    # Mirror both axes for a continuous repeat, not an exposed rectangular decal.
    grain=np.concatenate((luminance,luminance[:,::-1]),axis=1)
    grain=np.concatenate((grain,grain[::-1]),axis=0)
    grain=np.clip((grain-grain.mean())/max(float(grain.std()),1e-6),-2,2)
    h,w=grain.shape
    albedo=np.ones((h,w,4),np.float32)
    albedo[:,:,:3]=np.clip(.035+.018*grain[:,:,None],.008,.10)
    gx=(np.roll(grain,-1,axis=1)-np.roll(grain,1,axis=1))*.25
    gy=(np.roll(grain,-1,axis=0)-np.roll(grain,1,axis=0))*.25
    normals=np.stack((-gx,-gy,np.ones_like(grain)),axis=-1)
    normals/=np.linalg.norm(normals,axis=-1,keepdims=True)
    normal_map=np.ones((h,w,4),np.float32)
    normal_map[:,:,:3]=normals*.5+.5
    maps=[]
    for label,data,space in [('color',albedo,'sRGB'),('normal',normal_map,'Non-Color')]:
        texture=bpy.data.images.new('Underside leather | '+label,width=w,height=h,alpha=False)
        texture.colorspace_settings.name=space
        texture.pixels.foreach_set(data.ravel())
        texture.filepath_raw=str(reference_dir/('underside_leather_'+label+'.png'))
        texture.file_format='PNG';texture.save();texture.pack()
        maps.append(texture)
    material=_metal('reference leather grain',(.003,.003,.003),.55,0.)
    nodes=material.node_tree.nodes;links=material.node_tree.links
    shader=nodes.get('Principled BSDF')
    shader.inputs['Specular IOR Level'].default_value=.25
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    color=nodes.new('ShaderNodeTexImage');color.image=maps[0]
    normal=nodes.new('ShaderNodeTexImage');normal.image=maps[1]
    bump=nodes.new('ShaderNodeNormalMap')
    links.new(uv.outputs['UV'],color.inputs['Vector'])
    links.new(uv.outputs['UV'],normal.inputs['Vector'])
    links.new(color.outputs['Color'],shader.inputs['Base Color'])
    links.new(normal.outputs['Color'],bump.inputs['Color'])
    links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    return material,[texture.filepath_raw for texture in maps]


def refine_bottom(scene, reference_dir):
    """Rebuild only the bottom mount and feet, leaving all other surfaces intact."""
    reference_dir = Path(reference_dir)
    source = max((o for o in scene.objects if o.type == 'MESH'),
                 key=lambda o: len(o.data.vertices))
    if any(o.name.startswith(_PREFIX) for o in scene.objects):
        raise RuntimeError('Bottom refinement requires the unmodified pre-bottom scene')
    mesh = source.data
    if any(p.loop_total != 3 for p in mesh.polygons):
        raise RuntimeError('The reference source mesh must be triangulated')
    vertex_count, polygon_count = len(mesh.vertices), len(mesh.polygons)
    coordinates = np.empty(vertex_count * 3, np.float32)
    mesh.vertices.foreach_get('co', coordinates)
    coordinates = coordinates.reshape(-1, 3)
    transform = np.asarray(source.matrix_world, dtype=np.float64)
    world = coordinates @ transform[:3, :3].T + transform[:3, 3]
    loop_vertices = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', loop_vertices)
    triangles = loop_vertices.reshape(-1, 3)
    corner_normals = np.empty(len(mesh.loops) * 3, np.float32)
    mesh.corner_normals.foreach_get('vector', corner_normals)
    corner_normals = corner_normals.reshape(-1, 3)
    active_uv = mesh.uv_layers.active_index
    uv_arrays = []
    uv_names = []
    for layer in mesh.uv_layers:
        values = np.empty(len(mesh.loops) * 2, np.float32)
        layer.data.foreach_get('uv', values)
        uv_arrays.append(values.reshape(-1, 2))
        uv_names.append(layer.name)
    if not uv_arrays:
        raise RuntimeError('Original leather UVs are required for underside repair')
    materials = np.empty(polygon_count, np.int32)
    mesh.polygons.foreach_get('material_index', materials)
    original_materials = materials.copy()
    inverse = source.matrix_world.inverted()
    ray_direction = (inverse.to_3x3() @ Vector((0, 0, 1))).normalized()

    def sample_z(x, y):
        origin = inverse @ Vector((float(x), float(y), -0.3))
        hit, location, _, _ = source.ray_cast(origin, ray_direction)
        if not hit or (source.matrix_world @ location).z > 0.070:
            raise RuntimeError(f'No underside height donor at {(x, y)}')
        return (source.matrix_world @ location).z

    updated = world.copy()
    radius = np.linalg.norm(world[:, :2] - _CENTER, axis=1)
    mount_vertices = (radius < _OUTER_RADIUS) & (world[:, 2] < 0.045)
    # Keep the original leather topology in the visible annulus. The blended
    # outer edge lies entirely under the silver ring, not on exposed leather.
    weight = np.clip((_OUTER_RADIUS - radius) / 0.019, 0, 1)
    updated[mount_vertices, 2] += ((0.0098 - updated[mount_vertices, 2]) *
                                  weight[mount_vertices])
    changed = mount_vertices.copy()
    foot_reports = []
    foot_face_mask = np.zeros(polygon_count, bool)
    changed_corner_mask = mount_vertices[loop_vertices]
    target_normals = np.zeros_like(corner_normals)
    target_normals[:, 2] = -1
    centers = world[triangles].mean(axis=1)
    for site in _FOOT_SITES:
        cx, cy = site['old']
        dx, dy = np.abs(world[:, 0] - cx), np.abs(world[:, 1] - cy)
        region = (dx < 0.026) & (dy < 0.041) & (world[:, 2] < 0.045)
        region &= np.abs(world[:, 0]) < 0.232
        local_weight = np.clip(np.minimum((0.026 - dx) / 0.004,
                                          (0.041 - dy) / 0.004), 0, 1)
        donor_x = -0.130 if cx < 0 else 0.130
        y_samples = np.linspace(cy - 0.044, cy + 0.044, 25)
        z_samples = np.array([sample_z(donor_x, y) for y in y_samples])
        target_z = np.interp(world[region, 1], y_samples, z_samples)
        updated[region, 2] += (target_z - updated[region, 2]) * local_weight[region]
        changed |= region
        # Retire the rectangular chrome texture together with its protrusion.
        # A single reference-derived underside material below avoids atlas seams.
        faces = region[triangles].any(axis=1)
        faces &= (np.max(world[triangles, 2], axis=1) < 0.045)
        faces &= (np.max(np.abs(world[triangles, 0]), axis=1) < 0.232)
        foot_face_mask |= faces
        changed_corner_mask |= region[loop_vertices]
        selected_corners = region[loop_vertices]
        target_normals[selected_corners] = (0, 0.16, -1)
        foot_reports.append({'scan_foot_center_xy': list(site['old']),
                             'replacement_center_xy': list(site['new']),
                             'leveled_vertices': int(region.sum()),
                             'retextured_faces': int(faces.sum()),
                             'donor_x': donor_x,
                             'leveling_bounds_xy': [[cx - 0.026, cy - 0.041],
                                                    [cx + 0.026, cy + 0.041]],
                             'base_z': float(np.interp(site['new'][1], y_samples, z_samples))})
    bottom_faces=(np.max(world[triangles,2],axis=1)<.082)
    bottom_faces&=(np.abs(centers[:,0])<.229)&(centers[:,1]>-.080)&(centers[:,1]<.303)
    bottom_faces|=foot_face_mask
    leather,leather_maps=_leather_material(reference_dir)
    mesh.materials.append(leather)
    materials[bottom_faces]=len(mesh.materials)-1
    bottom_loops=(np.flatnonzero(bottom_faces)[:,None]*3+np.arange(3)).ravel()
    uv_arrays[0][bottom_loops]=world[loop_vertices[bottom_loops],:2]/.12

    # Cut all intersecting scan faces, not merely faces whose center is in the
    # hole. The irregular cut edge is hidden under the solid inner socket ring.
    candidate = np.flatnonzero((np.max(world[triangles, 2], axis=1) < 0.065) &
                               (np.linalg.norm(centers[:, :2] - _CENTER, axis=1) < 0.060))
    removed = np.zeros(polygon_count, bool)
    removed[candidate] = _intersects_disk(world[triangles[candidate]], _CENTER, 0.027)
    if not removed.any():
        raise RuntimeError('Socket cut did not find the original underside faces')
    inverse_array = np.asarray(inverse, dtype=np.float64)
    local_updated = coordinates.copy()
    local_updated[changed] = (updated[changed] @ inverse_array[:3, :3].T +
                              inverse_array[:3, 3]).astype(np.float32)
    mesh.vertices.foreach_set('co', local_updated.ravel())
    mesh.polygons.foreach_set('material_index', materials)
    for layer, values in zip(mesh.uv_layers, uv_arrays):
        layer.data.foreach_set('uv', values.ravel())
    normal_matrix = transform[:3, :3].T
    local_normals = target_normals[changed_corner_mask] @ normal_matrix.T
    local_normals /= np.linalg.norm(local_normals, axis=1)[:, None]
    corner_normals[changed_corner_mask] = local_normals
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[int(i)] for i in np.flatnonzero(removed)],
                     context='FACES_ONLY')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    surviving_loops = loop_vertices.reshape(-1, 3)[~removed].ravel()
    actual_loops = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', actual_loops)
    if not np.array_equal(surviving_loops, actual_loops):
        raise RuntimeError('Unexpected loop reordering while cutting the socket')
    mesh.normals_split_custom_set(corner_normals.reshape(-1, 3, 3)[~removed].reshape(-1, 3))
    mesh.uv_layers.active_index = active_uv
    retained = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get('co', retained)
    retained = retained.reshape(-1, 3)
    if not np.array_equal(retained[~changed], coordinates[~changed]):
        raise RuntimeError('Underside operation moved a vertex outside its local regions')

    chrome = _metal('satin silver fittings', (0.63, 0.65, 0.64), 0.235)
    thread_metal = _metal('socket interior silver', (0.42, 0.44, 0.43), 0.29)
    dark = _metal('unlit socket depth', (0.008, 0.009, 0.008), 0.83, 0.0)
    objects = []
    objects.append(_lathe(scene, 'tripod mount outer silver rim', _CENTER,
        [(0.095, 0.0165), (0.095, 0.0084), (0.0945, 0.0071),
         (0.0933, 0.0063), (0.0920, 0.0060), (0.0775, 0.0060),
         (0.0760, 0.0066), (0.0748, 0.0080), (0.0748, 0.0120),
         (0.0758, 0.0165)], chrome))
    objects.append(_lathe(scene, 'silver inner socket ring', _CENTER,
        [(0.04275, 0.017), (0.04275, 0.0096), (0.0421, 0.0081),
         (0.0408, 0.0076), (0.0245, 0.0076), (0.0227, 0.0080),
         (0.0202, 0.0100), (0.0190, 0.0115), (0.0230, 0.0135),
         (0.0265, 0.017)], chrome))
    thread_objects, thread_report = _threaded_bore(scene, thread_metal, dark)
    objects.extend(thread_objects)
    for i, report in enumerate(foot_reports, 1):
        base = report['base_z'] + 0.001
        # The reference has a thin flanged base and a rounded button, not a ball
        # or the long rectangular block in the scan. Profile stays above z=0.
        profile = [(0.0178, base), (0.0180, base - 0.0030),
                   (0.0172, base - 0.0044), (0.0145, base - 0.0050),
                   (0.0140, base - 0.0080), (0.0135, base - 0.0105),
                   (0.0120, base - 0.0130), (0.0095, base - 0.0153),
                   (0.0062, base - 0.0170), (0.0025, base - 0.0180),
                   (0.0001, base - 0.0182), (0.0001, base)]
        objects.append(_lathe(scene, f'rounded rear foot {i}', report['replacement_center_xy'],
                              profile, chrome, 96, slope=0.16))
        report.update({'flange_radius': 0.018, 'dome_radius': 0.014,
                       'projection': 0.0182, 'tip_z': base - 0.0182})

    changed_faces = changed[triangles].any(axis=1) | removed | bottom_faces
    counts = [{'name': obj.name, 'vertices': len(obj.data.vertices),
               'triangles': len(obj.data.polygons)} for obj in objects]
    report = {
        'source_object': source.name,
        'reference_images': [str(reference_dir / 'bottom_preview.jpg'),
                             str(reference_dir / 'bottom_close_preview.jpg')],
        'source_vertices_before': vertex_count, 'source_faces_before': polygon_count,
        'source_vertices_after': len(mesh.vertices), 'source_faces_after': len(mesh.polygons),
        'removed_local_faces': int(removed.sum()),
        'leveled_local_vertices': int(changed.sum()),
        'source_material_changed_faces': int((materials != original_materials).sum()),
        'source_foot_leather_retextured_faces': int(foot_face_mask.sum()),
        'preserved_outside_vertices': int((~changed).sum()),
        'outside_vertex_coordinates_exactly_preserved': True,
        'unaffected_faces': int((~changed_faces).sum()),
        'preserved_uv_layers': uv_names,
        'source_bounds_before': [world.min(axis=0).tolist(), world.max(axis=0).tolist()],
        'source_bounds_after': [updated.min(axis=0).tolist(), updated.max(axis=0).tolist()],
        'changed_vertex_bounds': [world[changed].min(axis=0).tolist(),
                                  world[changed].max(axis=0).tolist()],
        'mount': {'center_xy': list(_CENTER), 'outer_radius': _OUTER_RADIUS,
                  'outer_ring_inner_radius': 0.0748, 'inner_ring_radius': 0.04275,
                  'leather_annulus_z': 0.0098, 'outer_ring_face_z': 0.0060,
                  'inner_ring_face_z': 0.0076, 'scan_cut_radius': 0.027,
                  'outer_diameter_over_panel_width': 0.190 / 0.460,
                  'inner_ring_over_outer_diameter': 0.45,
                  'hole_over_outer_diameter': 0.2},
        'thread': thread_report, 'feet': foot_reports, 'added_meshes': counts,
        'added_mesh_count': len(objects),
        'added_triangles': sum(item['triangles'] for item in counts),
        'new_textures': leather_maps,
        'reference_leather_faces': int(bottom_faces.sum()),
        'preserved_regions': ['front hinge and barrel', 'body perimeter', 'all side controls',
                              'front inscriptions', 'side panel', 'rear markings'],
        'calibration_notes': [
            'Outer diameter is 41.3% of the 0.46 underside panel width, from the two photos.',
            'Existing scan feet were leveled before the round feet were added.',
            'One de-lit reference-leather material covers the underside and annulus, avoiding atlas-transfer patches around the feet.',
            'Bore is an actual cut in the scan, with a helical inner wall and a deep blind end.',
            'Perspective references do not determine exact socket depth or thread pitch; those are geometric estimates.',
            'Foot locations follow the slightly asymmetric scan footprints to preserve its existing perimeter.',
        ],
    }
    source['underside_refinement'] = 'Concentric silver/leather mount, recessed thread, rounded feet; local scan cuts only'
    return report
