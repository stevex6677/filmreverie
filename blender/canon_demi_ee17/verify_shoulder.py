"""Verify saved master scope and actual decoded compact geometry via Blender MCP."""
from pathlib import Path
import bpy,numpy as np,hashlib,json,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import generated_path
master=Path(bpy.data.filepath);out=master.parent
correction=json.loads((out/'shoulder_report.json').read_text())
recorded=Path(correction['source_blend'])
source=generated_path(Path(*recorded.parts[recorded.parts.index('blender'):]))
assert hashlib.sha256(source.read_bytes()).hexdigest()==correction['source_sha256']
changed_names={'Top inset continuous enamel plate','demi EE17 inlay','Canon Demi EE17 | original Tripo with scoped repairs'}
def array(items,field,width,dtype=np.float32):
    a=np.empty(len(items)*width,dtype);items.foreach_get(field,a);return a
def mesh_hash(me):
    h=hashlib.sha256()
    for a in [array(me.vertices,'co',3),array(me.loops,'vertex_index',1,np.int32),array(me.polygons,'material_index',1,np.int32)]:h.update(a.tobytes())
    for uv in me.uv_layers:h.update(array(uv.data,'uv',2).tobytes())
    return h.hexdigest()
def snapshot():
    body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    return {'body':array(body.data.vertices,'co',3).reshape(-1,3),
        'indices':array(body.data.loops,'vertex_index',1,np.int32),
        'uv':[array(uv.data,'uv',2) for uv in body.data.uv_layers],
        'other':{o.name:mesh_hash(o.data) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in changed_names},
        'images':{i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.users and i.packed_file}}
bpy.ops.wm.open_mainfile(filepath=str(source));before=snapshot()
bpy.ops.wm.open_mainfile(filepath=str(master));after=snapshot()
assert before['other']==after['other']
assert before['images']==after['images']
assert np.array_equal(before['indices'],after['indices'])
assert all(np.array_equal(a,b) for a,b in zip(before['uv'],after['uv']))
mask=np.load(out/'shoulder_vertex_mask.npz')['mask']
assert np.array_equal(before['body'][~mask],after['body'][~mask])
assert np.array_equal(before['body'][:,:2],after['body'][:,:2])
assert int(mask.sum())==26194
triangles=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
report={'saved_master_verified':True,'outside_top_backing_coordinates_exact':True,
    'source_body_topology_and_uv_exact':True,'all_packed_texture_bytes_exact':True,
    'unchanged_other_meshes':len(before['other']),'changed_body_vertices':int(mask.sum()),
    'source_master_triangles':triangles}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(out/'canon-demi-ee17-compact.glb'),import_pack_images=True)
decoded=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.data.calc_loop_triangles();decoded+=len(o.data.loop_triangles)
assert decoded==triangles,(decoded,triangles)
report.update(decoded_compact_triangles=decoded,triangle_count_preserved=True,all_images_packed=all(i.packed_file for i in bpy.data.images if i.users))
(out/'shoulder_verification.json').write_text(json.dumps(report,indent=2))
print('VERIFIED',json.dumps(report))
