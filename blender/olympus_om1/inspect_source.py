"""Read-only source import and inspection, run with local Blender CLI."""
from pathlib import Path
import sys,json,hashlib
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import asset_path,output_dir
out=output_dir('blender/olympus_om1')
for sub in ['intermediates','exports','previews']:(out/sub).mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
source=asset_path('blender/olympus_om1/tripo/om1.glb')
bpy.ops.import_scene.gltf(filepath=str(source),import_pack_images=True)
info={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'objects':[]}
for ob in list(bpy.context.scene.objects):
 if ob.type!='MESH':continue
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 info['objects'].append({'name':ob.name,'vertices':len(ob.data.vertices),'triangles':len(ob.data.polygons),'bounds':[list(v) for v in ob.bound_box],'materials':[m.name for m in ob.data.materials]})
info['images']=[{'name':i.name,'size':list(i.size)} for i in bpy.data.images]
(out/'intermediates/source_inspection.json').write_text(json.dumps(info,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'intermediates/source.blend'),compress=True)
print(json.dumps(info),flush=True)
renderer=Path(__file__).with_name('render_views.py')
exec(compile(renderer.read_text(),str(renderer),'exec'),{'__file__':str(renderer),'OUTPUT_DIR':str(out),'PREFIX':'source_','RESOLUTION':900})
