"""Blender CLI: replace a candidate shelf mesh with a baked, single-material LOD.
Args: model-folder run-name. Candidate detail and accepted masters are untouched.
"""
from pathlib import Path
import bpy,bmesh,json,sys,hashlib,struct,shutil
from mathutils import Vector
repo=Path(__file__).resolve().parents[1];sys.path.insert(0,str(repo/'scripts'))
from shared_assets import generated_path
folder,run=sys.argv[sys.argv.index('--')+1:];out=generated_path(f'blender/{folder}/runs/{run}')
report=json.loads((out/'exports/report.json').read_text());source=generated_path(report['parent_browser_glb']['path'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(source)==report['parent_browser_glb']['sha256']
shutil.copyfile(__file__,out/'intermediates'/Path(__file__).name)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source),import_pack_images=True)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=max(objects,key=lambda o:len(o.data.polygons));bpy.ops.object.join();high=bpy.context.object;high.name='Bake source'
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
low=high.copy();low.data=high.data.copy();bpy.context.collection.objects.link(low);low.name=report['model_id']+'-shelf'
bpy.context.view_layer.objects.active=low
# Older Mamiya/Autocord exports have open scan sheets; close those first.
if folder in {'mamiya_universal','autocord'}:
 bm=bmesh.new();bm.from_mesh(low.data)
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=max(low.dimensions)*1e-5)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(low.data);bm.free()
 solid=low.modifiers.new('Close thin scan sheets','SOLIDIFY');solid.thickness=max(low.dimensions)/90;solid.offset=-1
 bpy.ops.object.modifier_apply(modifier=solid.name)
print('STAGE voxel surface',flush=True)
remesh=low.modifiers.new('Closed cabinet surface','REMESH');remesh.mode='VOXEL';remesh.voxel_size=max(low.dimensions)/(120 if folder=='mamiya_universal' else 180);remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
print('STAGE simplify',flush=True)
tris=sum(len(p.vertices)-2 for p in low.data.polygons)
mod=low.modifiers.new('Cabinet geometry budget','DECIMATE');mod.ratio=min(1,18000/tris);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
if low.data.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
for p in low.data.polygons:p.use_smooth=True
bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
while low.data.uv_layers:low.data.uv_layers.remove(low.data.uv_layers[0])
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.1519,island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
# Diffuse-color baking must see metallic and transparent surfaces as opaque paint.
for mat in high.data.materials:
 if not mat or not mat.use_nodes:continue
 for node in mat.node_tree.nodes:
  if node.type!='BSDF_PRINCIPLED':continue
  if node.inputs['Transmission Weight'].default_value>.1 or 'clear coated glass' in mat.name:
   for link in list(node.inputs['Base Color'].links):mat.node_tree.links.remove(link)
   node.inputs['Base Color'].default_value=(.025,.035,.045,1)
  for name,value in [('Metallic',0),('Transmission Weight',0),('Alpha',1)]:
   for link in list(node.inputs[name].links):mat.node_tree.links.remove(link)
   node.inputs[name].default_value=value
mat=bpy.data.materials.new('Baked cabinet finish');mat.use_nodes=True
low.data.materials.clear();low.data.materials.append(mat)
for poly in low.data.polygons:poly.material_index=0
bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Metallic'].default_value=.35;bsdf.inputs['Roughness'].default_value=.5
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=max(low.dimensions)*.012;scene.render.bake.max_ray_distance=max(low.dimensions)*.04;scene.render.bake.margin=8
bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
for kind,size in [('DIFFUSE',1024),('NORMAL',1024)]:
 image=bpy.data.images.new(report['model_id']+'-cabinet-'+kind,width=size,height=size,alpha=False)
 if kind=='NORMAL':image.colorspace_settings.name='Non-Color'
 node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node
 if kind=='DIFFUSE':scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
 bpy.ops.object.bake(type=kind)
 image.pack()
 if kind=='DIFFUSE':mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
 else:
  normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');mat.node_tree.links.new(node.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
bpy.data.objects.remove(high,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
bpy.ops.wm.save_as_mainfile(filepath=str(out/'intermediates/shelf-baked-final.blend'))
path=out/'exports'/f'{report["model_id"]}-shelf-baked-final.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=85,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=10,export_draco_position_quantization=14,export_draco_normal_quantization=12,export_draco_texcoord_quantization=14)
raw=path.read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
old=report['variants']['shelf'];report.setdefault('previous_shelf_candidates',[]).append(old)
pts=[low.matrix_world@Vector(v) for v in low.bound_box]
item={**old,'path':str(path.relative_to(generated_path(''))),'sha256':sha(path),'bytes':len(raw),'triangles':sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in g['meshes']),'embedded_images':len(g.get('images',[])),'texture_size':1024,'jpeg_quality':85,'baked':True,'voxel_remeshed':True,'export_bounds':[[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]]}
assert item['triangles']<25000 and item['bytes']<1000000,item
report['variants']['shelf']=item;(out/'exports/report.json').write_text(json.dumps(report,indent=2)+'\n')
print('BAKED',json.dumps(item),flush=True)
