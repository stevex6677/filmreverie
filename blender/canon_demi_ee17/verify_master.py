"""Independent saved-master comparison, executed in Blender through MCP."""
from pathlib import Path
import bpy,numpy as np,json,hashlib
out=Path(bpy.data.filepath).parent
current=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
with bpy.data.libraries.load(str(out/'source.blend'),link=False) as (src,dst):dst.objects=src.objects
source=next(o for o in dst.objects if o and o.type=='MESH')
a=source.data;b=current.data
assert len(a.vertices)==len(b.vertices) and len(a.polygons)==len(b.polygons)
def array(items,name,width,dtype=np.float32):
    data=np.empty(len(items)*width,dtype);items.foreach_get(name,data);return data.reshape(-1,width)
ca=array(a.vertices,'co',3);cb=array(b.vertices,'co',3)
mask=np.load(out/'patch_provenance.npz')['vertex_mask']
assert np.array_equal(ca[~mask],cb[~mask])
assert np.array_equal(array(a.loops,'vertex_index',1,np.int32),array(b.loops,'vertex_index',1,np.int32))
assert np.array_equal(array(a.uv_layers[0].data,'uv',2),array(b.uv_layers[0].data,'uv',2))
face_materials=np.load(out/'patch_provenance.npz')['face_materials']
assert np.all(array(b.polygons,'material_index',1,np.int32).ravel()[face_materials==0]==0)
source_images={node.image.name:hashlib.sha256(node.image.packed_file.data).hexdigest() for m in a.materials for node in m.node_tree.nodes if node.type=='TEX_IMAGE' and node.image and node.image.packed_file}
target_images={node.image.name:hashlib.sha256(node.image.packed_file.data).hexdigest() for node in b.materials[0].node_tree.nodes if node.type=='TEX_IMAGE' and node.image and node.image.packed_file}
# Names may acquire .001 suffixes during library append; compare bytes.
assert sorted(source_images.values())==sorted(target_images.values())
report={'saved_master_verified':True,'source_vertices':len(a.vertices),'unchanged_vertices':int((~mask).sum()),'modified_vertices':int(mask.sum()),'outside_masks_coordinates_exact':True,'source_topology_exact':True,'source_uv0_exact':True,'outside_masks_original_material':True,'original_embedded_texture_bytes_exact':True,'all_images_packed':all(i.packed_file for i in bpy.data.images if i.users and i.type=='IMAGE')}
assert report['all_images_packed']
(out/'master_verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
