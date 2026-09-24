"""Import the read-only source. Execute through local Blender MCP."""
from pathlib import Path
import sys, json, hashlib
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, output_dir
out = output_dir('blender/canon_demi_ee17/refinement')
# Run in an MCP-launched background child, so resetting the scene cannot stop
# the interactive MCP server's add-on.
bpy.ops.wm.read_factory_settings(use_empty=True)
source = asset_path('blender/canon_demi_ee17/tripo/ee17.glb')
bpy.ops.import_scene.gltf(filepath=str(source), import_pack_images=True)
info = {'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'objects':[]}
for ob in list(bpy.context.scene.objects):
    if ob.type != 'MESH': continue
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active=ob
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    info['objects'].append({'name':ob.name,'vertices':len(ob.data.vertices),'faces':len(ob.data.polygons),'bounds':[list(v) for v in ob.bound_box],'materials':[m.name for m in ob.data.materials]})
(out/'source_inspection.json').write_text(json.dumps(info,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'),compress=True)
print('OUTPUT',str(out)); print(json.dumps(info))
