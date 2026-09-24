"""Blender CLI background export: packed full-detail GLB plus separate browser copy."""
from pathlib import Path
import bpy,hashlib,json,struct
out=Path(bpy.data.filepath).parent;master=Path(bpy.data.filepath)
assert master.name=='canon-demi-ee17-refined.blend'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
master_sha=digest(master)
source=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get()
scene=bpy.data.scenes.new('Export copies');objects=[]
for original in source.objects:
    if original.type not in {'MESH','FONT','CURVE'} or original.hide_render:continue
    mesh=bpy.data.meshes.new_from_object(original.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
    ob=bpy.data.objects.new(original.name,mesh);ob.matrix_world=original.matrix_world.copy();scene.collection.objects.link(ob);objects.append(ob)
bpy.context.window.scene=scene
def export(name,compact):
    p=out/name
    bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_active_scene=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_apply=False,export_image_format='JPEG' if compact else 'AUTO',export_jpeg_quality=95)
    raw=p.read_bytes();length=struct.unpack_from('<I',raw,12)[0];data=json.loads(raw[20:20+length])
    assert all('bufferView' in image and 'uri' not in image for image in data.get('images',[]))
    return {'path':str(p),'sha256':digest(p),'bytes':len(raw),'triangles':sum(data['accessors'][p['indices']]['count']//3 for m in data['meshes'] for p in m['primitives']),'embedded_images':len(data.get('images',[])),'source_blend_sha256':master_sha}
full=export('canon-demi-ee17-refined.glb',False)
# Tripo's split scan mesh did not survive weighted decimation in Blender 5.2.
# Keep every master triangle in the viewer copy; reduce only image resolution.
materials={};images={}
for ob in objects:
    for slot in ob.material_slots:
        old=slot.material
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
browser=export('canon-demi-ee17-viewer.glb',True)
assert browser['triangles']==full['triangles']
assert digest(master)==master_sha
expected={o.name for o in objects}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=browser['path'],import_pack_images=True)
actual={o.name for o in bpy.context.scene.objects if o.type=='MESH'}
assert expected==actual,(expected-actual,actual-expected)
assert all(i.packed_file for i in bpy.data.images if i.users)
report={'source_blend_sha256':master_sha,'master_unchanged':True,'full_detail':full,'browser':browser,'browser_reimport':{'objects':len(actual),'names_retained':True,'all_images_packed':True}}
(out/'export_report_preserved.json').write_text(json.dumps(report,indent=2))
# Set a path for the renderer without saving or replacing the editable master.
renderer=Path(__file__).with_name('render_views.py')
exec(compile(renderer.read_text(),str(renderer),'exec'),{'__file__':str(renderer),'OUTPUT_DIR':str(out),'PREFIX':'viewer_','VIEWS':['front','top','bottom','oblique']})
print(json.dumps(report))
