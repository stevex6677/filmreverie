"""Camera-only v2 export. Run in a fresh MCP process; master stays editable."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy,json,hashlib
OUT=output_dir('blender/mamiya_universal/hybrid/v2', bpy.data.filepath)
source=asset_path('blender/mamiya_universal/tripo/mamiya_universal_8k.glb')
expected='a6edda4742e79317a226ee5466251469987fa9c8efeacc4271c5dfec08f644d0'
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
master=bpy.data.scenes['02 Hybrid v2 | Tripo lens'];bpy.context.window.scene=master
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
export_scene=bpy.data.scenes.new('Mamiya Universal hybrid v2')
root=bpy.data.objects.new('Mamiya Universal | Tripo lens and repaired leatherette',None)
export_scene.collection.objects.link(root);root.scale=(.24,.24,.24)
root['source_sha256']=expected;root['scale_note']='Approximate visual working scale, not measured CAD'
count=0
for name in ['01 Camera | restored Tripo lens','02 Clean badges and lens text']:
    for o in bpy.data.collections[name].objects:
        if o.type not in {'MESH','FONT','CURVE'} or o.hide_render:continue
        if o.type=='FONT' and not o.data.body.strip():continue
        me=bpy.data.meshes.new_from_object(o.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
        copy=bpy.data.objects.new(o.name,me);export_scene.collection.objects.link(copy)
        copy.matrix_world=o.matrix_world.copy();copy.parent=root;count+=1
bpy.context.window.scene=export_scene
output=OUT/'mamiya_universal_hybrid_v2.glb';assert output.resolve()!=source.resolve()
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_active_scene=True,
                         export_animations=False,export_cameras=False,export_lights=False,
                         export_extras=True,export_image_format='AUTO',export_jpeg_quality=95,
                         export_yup=True,export_apply=False)
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
report={'output':output.name,'bytes':output.stat().st_size,'mesh_objects':count,
        'source_sha256':expected,'source_unchanged':True,'scale':.24}
(OUT/'export_validation.json').write_text(json.dumps(report,indent=2))
result=report
