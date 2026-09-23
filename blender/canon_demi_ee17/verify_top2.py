"""Verify only the two replaced top surfaces changed, plus Draco round trip."""
from pathlib import Path
import bpy,numpy as np,hashlib,json
master=Path(bpy.data.filepath);out=master.parent
source=out.parent/'20260923T-shoulder-compact-b/canon-demi-ee17-refined.blend'
excluded={'Top inset continuous enamel plate','demi EE17 inlay','Top2 continuous textured black band','Canon Demi EE17 | original Tripo with scoped repairs'}
def array(items,field,width,dtype=np.float32):
    a=np.empty(len(items)*width,dtype);items.foreach_get(field,a);return a
def snapshot():
    result={}
    for o in bpy.context.scene.objects:
        if o.type!='MESH' or o.name in excluded:continue
        me=o.data;h=hashlib.sha256()
        for a in [array(me.vertices,'co',3),array(me.loops,'vertex_index',1,np.int32),array(me.polygons,'material_index',1,np.int32),array(me.corner_normals,'vector',3)]:h.update(a.tobytes())
        for uv in me.uv_layers:h.update(array(uv.data,'uv',2).tobytes())
        h.update(str([list(row) for row in o.matrix_world]).encode())
        result[o.name]=h.hexdigest()
    body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    return {'other':result,'body':array(body.data.vertices,'co',3).reshape(-1,3),
        'indices':array(body.data.loops,'vertex_index',1,np.int32),
        'materials':array(body.data.polygons,'material_index',1,np.int32),
        'uv':[array(uv.data,'uv',2) for uv in body.data.uv_layers]}
bpy.ops.wm.open_mainfile(filepath=str(source));before=snapshot()
bpy.ops.wm.open_mainfile(filepath=str(master));after=snapshot()
assert before['other']==after['other']
mask=np.load(out/'top2_backing_mask.npz')['mask']
assert np.array_equal(before['body'][~mask],after['body'][~mask])
assert np.array_equal(before['body'][:,:2],after['body'][:,:2])
assert np.array_equal(before['indices'],after['indices']) and np.array_equal(before['materials'],after['materials'])
assert all(np.array_equal(a,b) for a,b in zip(before['uv'],after['uv']))
triangles=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
assert all(i.packed_file for i in bpy.data.images if i.users)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(out/'canon-demi-ee17-compact.glb'),import_pack_images=True)
decoded=0
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.data.calc_loop_triangles();decoded+=len(o.data.loop_triangles)
assert decoded==triangles,(decoded,triangles)
report={'saved_master_verified':True,'unchanged_meshes':len(before['other']),
    'other_meshes_geometry_uv_normals_and_transforms_exact':True,
    'source_body_outside_top_band_backing_coordinates_exact':True,
    'body_topology_uv_and_materials_exact':True,'body_vertices_modified':int(mask.sum()),
    'source_master_triangles':triangles,
    'decoded_compact_triangles':decoded,'triangle_count_preserved':True,
    'all_images_packed':all(i.packed_file for i in bpy.data.images if i.users)}
(out/'top2_verification.json').write_text(json.dumps(report,indent=2))
print('VERIFIED',json.dumps(report))
