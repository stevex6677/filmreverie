"""Render-reviewed finish calibration and recessed finder optics."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy,math
from mathutils import Vector
s=bpy.context.scene
for name,base,metal,limits in [('Black enamel | satin edge highlights',(.004,.0048,.006),.28,(.24,.27)),('Black anodized machined aluminum',(.006,.007,.009),.65,(.22,.26))]:
    m=bpy.data.materials[name];p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*base,1);p.inputs['Metallic'].default_value=metal
    for n in m.node_tree.nodes:
        if n.type=='VALTORGB':
            for e,v in zip(n.color_ramp.elements,limits):e.color=(v,v,v,1)
m=bpy.data.materials['Pebbled black leatherette']
for n in m.node_tree.nodes:
    if n.type=='TEX_VORONOI':n.inputs['Scale'].default_value=850
    if n.type=='BUMP' and n.inputs['Distance'].default_value>.0001:n.inputs['Distance'].default_value=.00042
    if n.type=='VALTORGB':
        for e in n.color_ramp.elements:
            if max(e.color[:3])<.05:
                e.color=(*(v*.70 for v in e.color[:3]),1)
for name in ['Key softbox','Fill softbox','Top rim','Front strip']:
    d=bpy.data.objects[name].data;d.shape='RECTANGLE';d.size_y=d.size*1.45
bpy.data.objects['Front strip'].data.size=.035
bpy.data.objects['Front strip'].data.size_y=.17
bpy.data.materials['Finder glass | smoked violet'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.53,.57,.62,1)

group=bpy.data.collections['07 Photo details'];root=next(o for o in s.objects if o.type=='EMPTY' and o.name.startswith('MAMIYA'))
def cube(name,loc,dim,mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(loc)*.001);o=bpy.context.object;o.name=name;o.dimensions=Vector(dim)*.001
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for c in list(o.users_collection):c.objects.unlink(o)
    group.objects.link(o);o.parent=root
    if mat:o.data.materials.append(mat)
    return o
for x,z,w,h,title in [(-44,158,39,36,'Main finder'),(55,156,12,13,'Rangefinder patch')]:
    old=bpy.data.objects[title+' recess'];old.hide_render=True;old.hide_set(True)
    cutter=cube('D • '+title+' cavity cutter',(x,-5,z),(w,55,h))
    for name in ['Rangefinder top housing','Front bezel edge','Finder face plate']:
        o=bpy.data.objects[name];b=o.modifiers.new(title+' optical recess','BOOLEAN');b.operation='DIFFERENCE';b.solver='EXACT';b.object=cutter
    cutter.hide_render=True;cutter.hide_set(True)
    cube('D • '+title+' rear optical baffle',(x,23,z),(w,1,h),bpy.data.materials['Optical black'])
    cube('D • '+title+' lower optical ledge',(x,9,z-h/2+3),(w-2,24,1),bpy.data.materials['Black anodized machined aluminum'])
    cube('D • '+title+' prism',(x,20,z),(w*.62,.5,h*.64),bpy.data.materials['Finder glass | smoked violet'])
# Physical nameplate ribs visible at close range, matching IMG_1972.
me=bpy.data.curves.new('D • Nameplate horizontal ribs','CURVE');me.dimensions='3D';me.bevel_depth=.000023;me.bevel_resolution=2
for i in range(43):
    z=.1177+i*.00025;sp=me.splines.new('POLY');sp.points.add(1)
    sp.points[0].co=(-.066,-.028125,z,1);sp.points[1].co=(.066,-.028125,z,1)
o=bpy.data.objects.new(me.name,me);group.objects.link(o);o.parent=root;me.materials.append(bpy.data.materials['Black anodized machined aluminum'])
s.camera=bpy.data.objects['CAM • Material and lens closeup'];s.render.filepath=str(output_dir('blender/mamiya_universal', bpy.data.filepath)/'mamiya_universal_detail.png')
s.render.resolution_percentage=100;s.cycles.samples=48
smoked=bpy.data.materials['Finder glass | smoked violet'].copy();smoked.name='Recessed finder smoked optical glass'
p=smoked.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value=(.025,.035,.05,1)
p.inputs['Transmission Weight'].default_value=.96
p.inputs['Specular IOR Level'].default_value=.18
for name in ['Main finder glass','Rangefinder patch glass','D • Main finder prism','D • Rangefinder patch prism']:
    bpy.data.objects[name].data.materials.clear();bpy.data.objects[name].data.materials.append(smoked)
s.render.resolution_x=1200;s.render.resolution_y=1200;s.cycles.samples=32
s.render.use_persistent_data=False
nylon=bpy.data.materials['Woven black nylon'];p=nylon.node_tree.nodes.get('Principled BSDF')
p.inputs['Sheen Weight'].default_value=.045;p.inputs['Specular IOR Level'].default_value=.20;p.inputs['Roughness'].default_value=.73
for n in nylon.node_tree.nodes:
    if n.type=='VALTORGB':
        for e in n.color_ramp.elements:e.color=(*(v*.5 for v in e.color[:3]),1)
rubber=bpy.data.materials['Rubber | hood and eyecup'];p=rubber.node_tree.nodes.get('Principled BSDF');p.inputs['Specular IOR Level'].default_value=.3
for n in rubber.node_tree.nodes:
    if n.type=='VALTORGB':
        for e,v in zip(n.color_ramp.elements,[.44,.49]):e.color=(v,v,v,1)
p=bpy.data.materials['Finder glass | smoked violet'].node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value=(.018,.025,.04,1);p.inputs['Transmission Weight'].default_value=.95;p.inputs['Specular IOR Level'].default_value=.22
for name in ['Rear maker','Rear country']:
    bpy.data.objects[name].location.x=.043;bpy.data.objects[name].data.size*=.9
bpy.data.objects['D • Eyecup outer rolled lip'].hide_render=True
bpy.data.objects['D • Eyecup outer rolled lip'].hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID'
result={'finish_calibrated':True,'recessed_finder_windows':2}
