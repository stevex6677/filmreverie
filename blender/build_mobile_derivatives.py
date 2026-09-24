"""Blender CLI: derive detail (<5 MB) and cabinet (<25k triangles) from CURRENT.
Run with --factory-startup --python-exit-code 1 --python this.py -- <model-folder> <run>.
Never modifies accepted masters or source GLBs. Packaging is a separate step.
"""
from pathlib import Path
import bpy, bmesh, json, hashlib, struct, sys, math, shutil
from mathutils import Vector
repo=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(repo/'scripts'))
from shared_assets import generated_path
folder,run=sys.argv[sys.argv.index('--')+1:]
current=json.loads((repo/'blender'/folder/'CURRENT.json').read_text())
source=generated_path(current['browser_glb']['path']); master=generated_path(current['editable_blend']['path'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(source)==current['browser_glb']['sha256']
assert sha(master)==current['editable_blend']['sha256']
out=generated_path(f'blender/{folder}/runs/{run}');out.mkdir(parents=True,exist_ok=False)
for name in ['exports','intermediates','previews']:(out/name).mkdir()
(out/'intermediates/parent-current.json').write_text(json.dumps(current,indent=2)+'\n')
shutil.copyfile(__file__,out/'intermediates/build_mobile_derivatives.py')
report={'model_id':current['model_id'],'parent_browser_glb':current['browser_glb'],'editable_blend':current['editable_blend'],'script_sha256':sha(Path(__file__)),'variants':{}}
def triangles(objects):
 return sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
def bounds(objects):
 pts=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
 return [[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]]
for variant,target,texture,quality in [('detail',600000,1536,82),('shelf',18000,512,72)]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(source),import_pack_images=True)
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 original_bounds=bounds(meshes);original_triangles=triangles(meshes)
 # Keep material islands separate so small detail geometry survives the detail export.
 for ob in list(meshes):
  if len(ob.data.materials)>1:
   bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
   bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 heavy=[o for o in meshes if variant=='shelf' or triangles([o])>50000]
 protected=triangles([o for o in meshes if o not in heavy]);dense=triangles(heavy)
 ratio=min(1,max(1000,target-protected)/max(1,dense))
 for ob in heavy:
  if ratio>=1:continue
  bpy.context.view_layer.objects.active=ob
  # Weld identical scan vertices while retaining per-corner UVs and material seams.
  bm=bmesh.new();bm.from_mesh(ob.data)
  epsilon=max(ob.dimensions)*1e-7
  bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=max(epsilon,1e-9))
  bm.to_mesh(ob.data);bm.free();ob.data.update()
  mod=ob.modifiers.new('Mobile triangle budget','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=mod.name)
 for im in list(bpy.data.images):
  if not im.users or not im.size[0]:continue
  w,h=im.size;scale=min(1,texture/max(w,h))
  if scale<1:im.scale(max(1,round(w*scale)),max(1,round(h*scale)))
  im.pack()
 if variant=='shelf':
  # Tiny cabinet lenses use opaque reflections, eliminating transmission passes.
  for mat in bpy.data.materials:
   if not mat.use_nodes:continue
   for node in mat.node_tree.nodes:
    if node.type=='BSDF_PRINCIPLED' and 'Transmission Weight' in node.inputs:
     node.inputs['Transmission Weight'].default_value=0
 # One object, shared material batches. Retain vertex normals and UV islands.
 bpy.ops.object.select_all(action='DESELECT')
 for ob in meshes:ob.select_set(True)
 bpy.context.view_layer.objects.active=max(meshes,key=lambda o:len(o.data.polygons))
 if variant=='shelf':
  bpy.ops.object.join();bpy.context.object.name=f'{current["model_id"]}-{variant}'
 meshes=[o for o in bpy.context.selected_objects if o.type=='MESH']
 bpy.ops.wm.save_as_mainfile(filepath=str(out/('scene.blend' if variant=='detail' else 'intermediates/shelf.blend')))
 path=out/'exports'/f'{current["model_id"]}-{variant}.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=quality,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=10,export_draco_position_quantization=16 if variant=='detail' else 14,export_draco_normal_quantization=12 if variant=='detail' else 10,export_draco_texcoord_quantization=14 if variant=='detail' else 12)
 raw=path.read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
 item={'path':str(path.relative_to(generated_path(''))),'sha256':sha(path),'bytes':len(raw),'triangles':sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in g['meshes']),'embedded_images':len(g.get('images',[])),'source_blend_sha256':current['editable_blend']['sha256'],'source_glb_sha256':current['browser_glb']['sha256'],'compression':'KHR_draco_mesh_compression','texture_size':texture,'jpeg_quality':quality,'source_triangles':original_triangles,'source_bounds':original_bounds,'export_bounds':bounds(meshes)}
 assert all('bufferView' in im for im in g.get('images',[]))
 assert len(raw)<(5000000 if variant=='detail' else 1000000),item
 assert variant!='shelf' or item['triangles']<25000,item
 report['variants'][variant]=item
 (out/'exports/report.json').write_text(json.dumps(report,indent=2)+'\n')
 print('DERIVATIVE',json.dumps(item),flush=True)
assert sha(source)==current['browser_glb']['sha256'] and sha(master)==current['editable_blend']['sha256']
print('COMPLETE',str(out),flush=True)
