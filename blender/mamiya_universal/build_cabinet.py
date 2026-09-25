"""Preserve the Mamiya's separate lettering, optics and materials in a shelf LOD.

Blender CLI --factory-startup --python-exit-code 1 --python this.py -- <new-run>
Read-only source: retained high-quality browser export of the accepted master.
"""
from pathlib import Path
import bpy, bmesh, hashlib, json, shutil, struct, sys

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'scripts'))
from shared_assets import generated_path

run = sys.argv[sys.argv.index('--') + 1]
current = json.loads((REPO / 'blender/mamiya_universal/CURRENT.json').read_text())
source_record = next(item for item in current['browser_history']
                     if item['sha256'] == current['browser_glb']['source_glb_sha256'])
source = generated_path(source_record['path'])
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
assert sha(source) == source_record['sha256']
assert sha(generated_path(current['editable_blend']['path'])) == current['editable_blend']['sha256']
out = generated_path('blender/mamiya_universal/runs/' + run)
out.mkdir(parents=True, exist_ok=False)
for folder in ['intermediates', 'exports', 'previews']:
    (out / folder).mkdir()
(out / 'intermediates/parent-current.json').write_text(json.dumps(current, indent=2) + '\n')
shutil.copyfile(__file__, out / 'intermediates/build_cabinet.py')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source), import_pack_images=True)
objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
report = {'model_id': current['model_id'], 'source': source_record,
          'editable_blend': current['editable_blend'], 'objects': []}
triangles = lambda obj: sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
for obj in objects:
    before = triangles(obj)
    lettering = any(word in obj.name for word in ['Badge |', 'Clean lens text |', 'barrel scale',
                                                 'Rear maker |', 'Film back |', 'Memo |'])
    target = before if lettering else (84000 if obj.name.startswith('Camera v2') else
                                      1200 if 'clear lens group' in obj.name else 1600)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if before > target:
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=max(obj.dimensions) * 1e-7)
        bm.to_mesh(obj.data); bm.free(); obj.data.update()
        modifier = obj.modifiers.new('Cabinet detail budget', 'DECIMATE')
        modifier.ratio = target / triangles(obj)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if (obj.name.startswith('V2.2') or obj.name.startswith('Camera v2')) and not lettering:
        if obj.data.has_custom_normals:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        for poly in obj.data.polygons:
            poly.use_smooth = True
    after = triangles(obj)
    if lettering:
        assert after == before
    report['objects'].append({'name': obj.name, 'before': before, 'after': after,
                              'lettering_preserved': lettering})

# Keep native texture coordinates and dedicated ink/metal/leather materials.
# Cabinet optics use the same inexpensive transparent reflection as roomCameraModel.
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED' and 'clear coated glass' in material.name:
            node.inputs['Transmission Weight'].default_value = 0
            node.inputs['Base Color'].default_value = (.018, .05, .08, 1)
            node.inputs['Metallic'].default_value = 1
            node.inputs['Roughness'].default_value = .12
            node.inputs['Alpha'].default_value = .28
            material.surface_render_method = 'DITHERED'
for image in bpy.data.images:
    if not image.users or not image.size[0]:
        continue
    width, height = image.size
    scale = min(1, 1024 / max(width, height))
    if scale < 1:
        image.scale(round(width * scale), round(height * scale))
    image.pack()

# Join transforms, but keep material primitives: relief text must remain geometry.
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = max(objects, key=triangles)
bpy.ops.object.join()
bpy.context.object.name = 'Mamiya cabinet | preserved lettering and optics'
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'scene.blend'))
export = out / 'exports/mamiya-universal-shelf.glb'
bpy.ops.export_scene.gltf(filepath=str(export), export_format='GLB', use_selection=True,
    export_animations=False, export_cameras=False, export_lights=False,
    export_image_format='JPEG', export_jpeg_quality=88,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10,
    export_draco_position_quantization=16, export_draco_normal_quantization=12,
    export_draco_texcoord_quantization=14)
raw = export.read_bytes()
gltf = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
item = {'path': str(export.relative_to(generated_path(''))), 'sha256': sha(export),
        'bytes': len(raw), 'triangles': sum(gltf['accessors'][p['indices']]['count'] // 3
            for mesh in gltf['meshes'] for p in mesh['primitives']),
        'primitives': sum(len(mesh['primitives']) for mesh in gltf['meshes']),
        'embedded_images': len(gltf.get('images', [])), 'texture_size': 1024, 'jpeg_quality': 88,
        'source_blend_sha256': current['editable_blend']['sha256'],
        'source_glb_sha256': source_record['sha256'], 'compression': 'KHR_draco_mesh_compression',
        'export_blend': {'path': str((out / 'scene.blend').relative_to(generated_path(''))),
                         'sha256': sha(out / 'scene.blend')},
        'method': 'Per-component simplification; original UVs, lettering geometry and material separation retained.'}
report['shelf_glb'] = item
(out / 'exports/report.json').write_text(json.dumps(report, indent=2) + '\n')
assert item['bytes'] < 1500000 and item['triangles'] < 190000 and item['primitives'] <= 20, item
assert sha(source) == source_record['sha256']
print('CABINET_EXPORT', json.dumps(item), flush=True)
