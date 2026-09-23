"""Export all triangles with embedded JPEG textures and Draco compression.

Run in a Blender MCP child on the corrected packed master. Never save the
temporary export scene over that master. Decimal 10 MB is a hard delivery gate.
"""
from pathlib import Path
import bpy, json, hashlib, struct
out=Path(bpy.data.filepath).parent
master=Path(bpy.data.filepath)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
master_sha=digest(master)
source=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get()
scene=bpy.data.scenes.new('Compact export copies');objects=[]
for original in source.objects:
    if original.type not in {'MESH','FONT','CURVE'} or original.hide_render:continue
    mesh=bpy.data.meshes.new_from_object(original.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
    ob=bpy.data.objects.new(original.name,mesh);ob.matrix_world=original.matrix_world.copy()
    scene.collection.objects.link(ob);objects.append(ob)
bpy.context.window.scene=scene
materials={};images={}
for ob in objects:
    for slot in ob.material_slots:
        old=slot.material
        if old is None:continue
        if old not in materials:
            new=old.copy()
            for node in new.node_tree.nodes:
                if node.type!='TEX_IMAGE' or not node.image:continue
                image=node.image
                if image not in images:
                    small=image.copy();w,h=image.size;ratio=min(1,2048/max(w,h))
                    if ratio<1:small.scale(round(w*ratio),round(h*ratio))
                    small.pack();images[image]=small
                node.image=images[image]
            materials[old]=new
        slot.material=materials[old]
path=out/'canon-demi-ee17-compact.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,
    export_animations=False,export_cameras=False,export_lights=False,export_yup=True,
    export_apply=False,export_image_format='JPEG',export_jpeg_quality=90,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=10,
    export_draco_position_quantization=16,export_draco_normal_quantization=12,
    export_draco_texcoord_quantization=14,export_draco_generic_quantization=14)
raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
assert 'KHR_draco_mesh_compression' in doc['extensionsRequired']
assert all('bufferView' in i and 'uri' not in i for i in doc['images'])
report={'path':str(path),'sha256':digest(path),'bytes':len(raw),'triangles':triangles,
    'embedded_images':len(doc['images']),'source_blend_sha256':master_sha,
    'compression':'KHR_draco_mesh_compression','position_bits':16,'normal_bits':12,'uv_bits':14,
    'max_texture_dimension':2048,'jpeg_quality':90,'decimated':False,
    'image_bytes':sum(doc['bufferViews'][i['bufferView']]['byteLength'] for i in doc['images']),
    'extensionsRequired':doc['extensionsRequired'],'under_10MB':len(raw)<10_000_000}
(out/'compact_export_report.json').write_text(json.dumps(report,indent=2))
assert digest(master)==master_sha
print('COMPACT_EXPORT',json.dumps(report))
assert len(raw)<10_000_000, 'Candidate exceeds the hard 10 MB delivery limit'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path),import_pack_images=True)
assert all(i.packed_file for i in bpy.data.images if i.users)
renderer=Path(__file__).with_name('render_views.py')
exec(compile(renderer.read_text(),str(renderer),'exec'),{'__file__':str(renderer),
    'OUTPUT_DIR':str(out),'PREFIX':'compact_','VIEWS':['front','oblique','top','bottom','back']})
