"""Export an isolated, mobile-sized derivative via Blender CLI. Never save master."""
from pathlib import Path
import bpy, sys, json, hashlib, struct, time
import numpy as np
REPO=Path(__file__).resolve().parents[4]
sys.path.insert(0,str(REPO/'scripts'))
from shared_assets import output_dir
source=Path(bpy.data.filepath)
out=output_dir('blender/mamiya_universal/hybrid/v2/browser_preview')
progress=out/'export-progress.json'
progress.write_text(json.dumps({'status':'exporting'}))
master=bpy.data.scenes['02 Hybrid v2 | Tripo lens'];bpy.context.window.scene=master
dg=bpy.context.evaluated_depsgraph_get()
scene=bpy.data.scenes.new('Mamiya browser derivative')
root=bpy.data.objects.new('Mamiya Universal | black body',None);scene.collection.objects.link(root)
root.scale=(.24,.24,.24)
objects=[]
for name in ['01 Camera | restored Tripo lens','02 Clean badges and lens text',
             '04 V2.1 | clean rear lettering','06 V2.2 | smooth front assembly','07 V2.2 | clear optical assembly']:
    for ob in bpy.data.collections[name].objects:
        if ob.type not in {'MESH','FONT','CURVE'} or ob.hide_render:continue
        if ob.type in {'FONT','CURVE'}:
            ob.data=ob.data.copy();ob.data.resolution_u=min(ob.data.resolution_u,6)
            ob.data.render_resolution_u=6;ob.data.bevel_resolution=min(ob.data.bevel_resolution,1)
            dg.update()
        me=bpy.data.meshes.new_from_object(ob.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
        copy=bpy.data.objects.new(ob.name,me);scene.collection.objects.link(copy)
        copy.matrix_world=ob.matrix_world.copy();copy.parent=root;objects.append(copy)
bpy.context.window.scene=scene
for ob in objects:
    is_base=ob.name.startswith('Camera v2 | repaired source mesh')
    if is_base or (ob.name.startswith('V2.2 |') and len(ob.data.polygons)>8000):
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        mod=ob.modifiers.new('Browser mesh budget','DECIMATE')
        mod.ratio=.24 if is_base else (.20 if 'clear lens group' in ob.name else .35)
        mod.delimit={'MATERIAL','UV'}
        bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)

# glTF cannot transport Blender color ramps/mixed BSDFs. Use explicit PBR
# derivatives and a compact luminance texture for the black leatherette.
image_cache={};material_cache={}
def small_image(im, leather=False):
    key=(im.name,leather)
    if key in image_cache:return image_cache[key]
    cp=im.copy();cp.name='Web | '+im.name+(' | black leather' if leather else '')
    cp.scale(2048,2048)
    if leather:
        pix=np.empty(2048*2048*4,np.float32);cp.pixels.foreach_get(pix);pix=pix.reshape(-1,4)
        lum=pix[:,:3]@np.array([.2126,.7152,.0722],np.float32)
        pix[:,:3]=lum[:,None]*np.array([.065,.075,.09],np.float32)
        cp.pixels.foreach_set(pix.ravel());cp.update()
    cp.pack();image_cache[key]=cp;return cp

atlas=bpy.data.objects['Camera v2 | repaired source mesh'].data.materials[0]
for ob in objects:
    for slot in ob.material_slots:
        old=slot.material
        if old is None:continue
        if old.name in material_cache:slot.material=material_cache[old.name];continue
        if old.name.startswith('V2.3 | lens-matched') or old.name.startswith('V2.3 | deep black'):
            leather='leatherette' in old.name
            m=bpy.data.materials.new('Web | '+old.name);m.use_nodes=True
            p=m.node_tree.nodes.get('Principled BSDF')
            p.inputs['Base Color'].default_value=(.009,.011,.014,1)
            p.inputs['Metallic'].default_value=0 if leather else .65
            p.inputs['Roughness'].default_value=.56 if leather else .27
            if leather:
                tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=small_image(atlas.node_tree.nodes['Image Texture'].image,True)
                m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
            tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=small_image(atlas.node_tree.nodes['Image Texture.002'].image)
            nm=m.node_tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.8 if leather else .12
            m.node_tree.links.new(tex.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs[0],p.inputs['Normal'])
        else:
            m=old.copy();m.name='Web | '+old.name
            if m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type=='TEX_IMAGE' and n.image:n.image=small_image(n.image)
        material_cache[old.name]=m;slot.material=m
output=out/'mamiya-black-body.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_active_scene=True,
    export_animations=False,export_cameras=False,export_lights=False,export_extras=True,
    export_image_format='JPEG',export_jpeg_quality=88,export_yup=True,export_apply=False)
raw=output.read_bytes();size=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+size])
triangles=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
report={'status':'complete','output':str(output),'bytes':len(raw),'triangles':triangles,
        'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'sha256':hashlib.sha256(raw).hexdigest(),'mesh_objects':len(objects),'texture_size':2048,
        'extensions':gltf.get('extensionsUsed',[]),'note':'Mobile PBR derivative; editable Cycles master unchanged.'}
(out/'browser-export.json').write_text(json.dumps(report,indent=2));progress.write_text(json.dumps(report,indent=2))
result=report
