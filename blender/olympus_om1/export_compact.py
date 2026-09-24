"""Non-destructive compact GLB export, run on scene.blend with Blender CLI."""
from pathlib import Path
import bpy,json,hashlib,struct,os
master=Path(bpy.data.filepath);out=master.parent;digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();master_sha=digest(master)
retention=float(os.environ.get('OM1_MESH_RETENTION','1.0'));assert 0<retention<=1
source=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();scene=bpy.data.scenes.new('Olympus browser derivative');copies=[]
for old in source.objects:
 if old.type not in {'MESH','FONT','CURVE'} or old.hide_render:continue
 mesh=bpy.data.meshes.new_from_object(old.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
 ob=bpy.data.objects.new(old.name,mesh);ob.matrix_world=old.matrix_world.copy();scene.collection.objects.link(ob);copies.append(ob)
bpy.context.window.scene=scene
for ob in copies:
 if retention<1 and len(ob.data.polygons)>100_000:
  bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('Browser mesh budget','DECIMATE');mod.ratio=retention;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
materials={};images={}
for ob in copies:
 for slot in ob.material_slots:
  old=slot.material
  if not old:continue
  if old not in materials:
   m=old.copy()
   for node in m.node_tree.nodes:
    if node.type!='TEX_IMAGE' or not node.image:continue
    im=node.image
    if im not in images:
     new=im.copy();w,h=im.size;limit=2048 if 'basecolor' in im.name else 1024;scale=min(1,limit/max(w,h))
     if scale<1:new.scale(round(w*scale),round(h*scale))
     new.pack();images[im]=new
    node.image=images[im]
   materials[old]=m
  slot.material=materials[old]
# Merge export copies so text does not require hundreds of separate draw calls.
bpy.ops.object.select_all(action='DESELECT')
for ob in copies:ob.select_set(True)
bpy.context.view_layer.objects.active=max(copies,key=lambda o:len(o.data.polygons));bpy.ops.object.join();combined=bpy.context.object;combined.name='Olympus OM-1 | reference-refined browser model'
path=out/'exports/olympus-om1-compact.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=88,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=10,export_draco_position_quantization=16,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
raw=path.read_bytes();doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
report={'path':str(path),'sha256':digest(path),'bytes':len(raw),'source_blend_sha256':master_sha,'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in doc['meshes']),'compression':'KHR_draco_mesh_compression','source_mesh_retention_ratio':retention,'max_basecolor_size':2048,'max_other_texture_size':1024,'jpeg_quality':88,'embedded_images':len(doc.get('images',[])),'under_10MB':len(raw)<10_000_000}
assert digest(master)==master_sha;assert all('bufferView' in i and 'uri' not in i for i in doc.get('images',[]));assert report['under_10MB'],report
(out/'exports/export_report.json').write_text(json.dumps(report,indent=2));print('EXPORT',json.dumps(report),flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path),import_pack_images=True)
report['reimported_meshes']=len([o for o in bpy.context.scene.objects if o.type=='MESH']);report['packed_images']=all(i.packed_file for i in bpy.data.images if i.users)
assert report['packed_images'];(out/'exports/export_report.json').write_text(json.dumps(report,indent=2))
renderer=Path(__file__).with_name('render_views.py');exec(compile(renderer.read_text(),str(renderer),'exec'),{'__file__':str(renderer),'OUTPUT_DIR':str(out),'PREFIX':'compact_','RESOLUTION':1200})
