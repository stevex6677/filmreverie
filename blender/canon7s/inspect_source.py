"""Inspect read-only Tripo geometry through Blender CLI before localized editing."""
from pathlib import Path
import hashlib
import json
import sys
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, output_dir

out = output_dir('blender/canon7s/refinement')
bpy.ops.wm.read_factory_settings(use_empty=True)
source = asset_path('blender/canon7s/tripo/tripo_canon7s.glb')
bpy.ops.import_scene.gltf(filepath=str(source), import_pack_images=True)
bpy.context.view_layer.update()
info = {'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'objects': []}
for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)
    info['objects'].append({'name': obj.name, 'vertices': len(obj.data.vertices), 'faces': len(obj.data.polygons),
                            'bounds': [list(Vector(v)) for v in obj.bound_box],
                            'materials': [m.name for m in obj.data.materials]})
(out / 'source_inspection.json').write_text(json.dumps(info, indent=2))
print(json.dumps(info), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'source.blend'), compress=True)
exec(compile((Path(__file__).with_name('render_views.py')).read_text(), str(Path(__file__).with_name('render_views.py')), 'exec'), {'__file__': str(Path(__file__).with_name('render_views.py')), 'INSPECTION': True})
