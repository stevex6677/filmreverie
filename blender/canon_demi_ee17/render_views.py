"""Render orthographic evidence through Blender MCP; source/final share framing."""
from pathlib import Path
import bpy, math
from mathutils import Vector
out=Path(globals().get('OUTPUT_DIR',str(Path(bpy.data.filepath).parent)))
s=bpy.context.scene
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='CUDA';prefs.get_devices()
assert any(d.type=='CUDA' for d in prefs.devices)
for d in prefs.devices: d.use=d.type=='CUDA'
s.cycles.device='GPU'
s.world=bpy.data.worlds.new('Demi studio');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs[0].default_value=(.3,.3,.3,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=.7
s.view_settings.view_transform='AgX'
s.render.resolution_x=s.render.resolution_y=1200;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG'
objects=[o for o in s.objects if o.type=='MESH']
points=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)])
hi=Vector([max(p[i] for p in points) for i in range(3)])
center=(lo+hi)/2;size=max(hi-lo)
for name, direction in [('front',(0,-1,0)),('back',(0,1,0)),('top',(0,0,1)),('bottom',(0,0,-1)),('oblique',(-.65,-1,.7)),('bottom_oblique',(.4,-.8,-1))]:
    if name not in globals().get('VIEWS',['front','back','top','bottom','oblique','bottom_oblique']): continue
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=size*1.12
    camera=bpy.data.objects.new(name,data);s.collection.objects.link(camera)
    camera.location=center+Vector(direction).normalized()*size*3
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    if name=='top':camera.rotation_euler=(0,0,0)
    if name=='bottom':camera.rotation_euler=(math.pi,0,0)
    s.camera=camera;lights=[]
    for offset,energy in [((-.7,-.6,1.5),100),((.9,.8,.6),65)]:
        data=bpy.data.lights.new('Softbox','AREA');data.energy=energy*size**2;data.size=size*2
        light=bpy.data.objects.new(data.name,data);s.collection.objects.link(light)
        light.location=center+Vector(direction).normalized()*size*1.6+Vector(offset)*size
        light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler();lights.append(light)
    s.render.filepath=str(out/(globals().get('PREFIX','')+name+'.png'))
    bpy.ops.render.render(write_still=True)
    for ob in lights+[camera]:bpy.data.objects.remove(ob,do_unlink=True)
print('Renders complete',str(out))
