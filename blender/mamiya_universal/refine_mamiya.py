
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir
import bpy, bmesh, math
from math import pi, sin, cos
from mathutils import Vector
scene=bpy.context.scene
# Repair closed procedural surfaces, preserving editable components.
for o in scene.objects:
    if o.type=='MESH' and o.parent:
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(o.data);bm.free()
for o in scene.objects:
    if o.type=='FONT' and o.name.startswith(('DOF ','Focus distance ','Shutter speed ','Aperture ')):
        a=math.atan2(o.location.x,o.location.z-.064)
        o.rotation_euler=(0,a,0)
for name in ['Black enamel | satin edge highlights','Black anodized machined aluminum']:
    m=bpy.data.materials[name];p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(.006,.007,.009,1)
    p.inputs['Metallic'].default_value=.48
    p.inputs['Roughness'].default_value=.31
for name in ['Pebbled black leatherette','Rubber | hood and eyecup','Woven black nylon']:
    m=bpy.data.materials[name];p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(.003,.0035,.004,1)
    p.inputs['Specular IOR Level'].default_value=.22
for n in bpy.data.materials['Pebbled black leatherette'].node_tree.nodes:
    if n.type=='BUMP':n.inputs['Distance'].default_value=.00022
for o in scene.objects:
    if o.type=='LIGHT':o.data.energy*=.25
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.18
scene.view_settings.exposure=-.25
gp=bpy.data.materials['Coated optical glass | blue amber'].node_tree.nodes.get('Principled BSDF')
gp.inputs['Metallic'].default_value=0
gp.inputs['Transmission Weight'].default_value=.97
gp.inputs['Base Color'].default_value=(.35,.28,.17,1)
gp.inputs['Roughness'].default_value=.10
fp=bpy.data.materials['Finder glass | smoked violet'].node_tree.nodes.get('Principled BSDF')
fp.inputs['Base Color'].default_value=(.012,.016,.025,1)
fp.inputs['Metallic'].default_value=.25
fp.inputs['Roughness'].default_value=.2
for name in ['Internal finder prism','Finder reflected highlight']:
    bpy.data.objects[name].hide_render=True
# Add the hood wall around narrower open vent slots.
group=bpy.data.collections['03 Sekor 100mm']
root=next(o for o in scene.objects if o.type=='EMPTY')
def hood_lathe(name,profile):
    seg=128;v=[(r*.001*cos(2*pi*i/seg),y*.001,.064+r*.001*sin(2*pi*i/seg)) for r,y in profile for i in range(seg)]
    f=[]
    for j in range(len(profile)-1):
        for i in range(seg):
            a=j*seg+i;b=j*seg+(i+1)%seg;f.append((a,b,b+seg,a+seg))
    m=bpy.data.meshes.new(name);m.from_pydata(v,[],f);m.update()
    bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free()
    o=bpy.data.objects.new(name,m);group.objects.link(o);o.parent=root;m.materials.append(bpy.data.materials['Black anodized machined aluminum'])
    for p in m.polygons:p.use_smooth=True
hood_lathe('Hood rear tapered wall',[(39.7,-112),(41.4,-112),(43.6,-117),(42.2,-117),(39.7,-112)])
hood_lathe('Hood front vent surround',[(44,-122),(45.6,-122),(46,-125),(44,-125),(44,-122)])
scene.camera=bpy.data.objects['CAM • Front three-quarter']
scene.cycles.samples=64
for name in ['Rear maker','Rear country']:
    bpy.data.objects[name].location.x=.035
    bpy.data.objects[name].data.size*=.86
bpy.data.objects['Film advance lever'].location.x=-.068
bpy.data.objects['Film advance thumb pad'].location.x=-.053
bpy.ops.wm.save_as_mainfile(filepath=str(output_dir('blender/mamiya_universal', bpy.data.filepath)/'mamiya_universal.blend'))
result={'refined':True,'objects':len(scene.objects)}
