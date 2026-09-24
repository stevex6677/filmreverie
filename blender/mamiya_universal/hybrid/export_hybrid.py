"""Export only the hybrid camera to a new GLB, without changing the master.

Run via Blender CLI with mamiya_universal_hybrid.blend open. Conversion
and physical scale are applied to temporary export copies in this process.
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy, json, hashlib
OUT=output_dir('blender/mamiya_universal/hybrid', bpy.data.filepath)
source=asset_path('blender/mamiya_universal/tripo/mamiya_universal_8k.glb')
expected='a6edda4742e79317a226ee5466251469987fa9c8efeacc4271c5dfec08f644d0'
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
master=bpy.data.scenes['02 Hybrid | refined front'];bpy.context.window.scene=master
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
export_scene=bpy.data.scenes.new('Temporary export only')
root=bpy.data.objects.new('Mamiya Universal | hybrid front revision',None);export_scene.collection.objects.link(root)
root.scale=(.24,.24,.24)
root['source_sha256']=expected
root['revision']='Hybrid front: editable donor badges, rounded vented hood, optical assembly and lens inscription'
root['scale']='Approximate visual scale, not measured CAD'
count=0
for colname in ['01 Tripo body | masked replacement regions','02 Precision front | fitted donor parts']:
    for o in bpy.data.collections[colname].objects:
        if o.type not in {'MESH','FONT','CURVE'}:continue
        if o.type=='FONT' and not o.data.body.strip():continue
        me=bpy.data.meshes.new_from_object(o.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
        copy=bpy.data.objects.new(o.name,me);export_scene.collection.objects.link(copy)
        copy.matrix_world=o.matrix_world.copy();copy.parent=root;count+=1
bpy.context.window.scene=export_scene
output=OUT/'mamiya_universal_hybrid.glb'
assert output.resolve()!=source.resolve()
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_active_scene=True,
                         export_animations=False,export_cameras=False,export_lights=False,
                         export_extras=True,export_image_format='AUTO',export_jpeg_quality=95,
                         export_yup=True,export_apply=False)
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
report={'file':output.name,'bytes':output.stat().st_size,'mesh_objects':count,
        'source_unchanged':True,'source_sha256':expected,'export_scale':.24}
(OUT/'export_validation.json').write_text(json.dumps(report,indent=2))
result=report
