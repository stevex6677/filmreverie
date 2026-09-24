"""Orthographic reference and oblique evidence views, executed through Blender CLI."""
from pathlib import Path
import bpy
import json
import sys
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import output_dir
out = output_dir('blender/canon7s/refinement', bpy.data.filepath)
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.samples = globals().get('RENDER_SAMPLES',24)
s.cycles.use_denoising = True
# CUDA bypasses the installed driver's failing OptiX compiler.
backend=globals().get('RENDER_DEVICE','CUDA')
if backend=='CUDA':
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='CUDA'
    prefs.get_devices()
    devices=[d for d in prefs.devices if d.type=='CUDA']
    assert devices, 'No CUDA GPU is available'
    for device in prefs.devices:
        device.use=device.type=='CUDA'
    s.cycles.device='GPU'
else:
    assert backend=='CPU', backend
    s.cycles.device='CPU'
s.world = bpy.data.worlds.new('Canon reference studio')
s.world.use_nodes = True
s.world.node_tree.nodes['Background'].inputs[0].default_value = (.24, .24, .24, 1)
s.world.node_tree.nodes['Background'].inputs[1].default_value = .7
s.view_settings.view_transform = 'AgX'
s.render.resolution_x = s.render.resolution_y = globals().get('RENDER_RESOLUTION',1200)
s.render.resolution_percentage = 100
s.render.image_settings.file_format = 'PNG'
meshes = [o for o in s.objects if o.type == 'MESH' and not o.hide_render]
points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = (lo + hi) * .5
size = max(hi - lo)
views = [('bottom',(0,0,-1)),('bottom_oblique',(0,-.75,-1.5)),
         ('front',(0,-1,0)),('rear',(0,1,0)),('top',(0,0,1)),('oblique',(-.7,-1,.65)),
         ('lens_detail',(0,-1,0)),('rear_detail',(0,1,0)),('top_oblique',(.25,1,1.8))]
closeups={'lens_detail':((.0722,-.23,.23),.36),'rear_detail':((-.254,.19,.473),.255),
          'bottom':((0,.09,.02),1.08)}
requested=globals().get('RENDER_VIEWS')
if requested:
    assert set(requested)<={name for name,_ in views}
    views=[view for view in views if view[0] in requested]
for name, direction in views:
    d = bpy.data.cameras.new(name)
    d.type = 'ORTHO'
    target,framing=closeups.get(name,(center,size*1.12))
    target=Vector(target)
    d.ortho_scale = framing
    c = bpy.data.objects.new(name,d)
    s.collection.objects.link(c)
    c.location = target + Vector(direction).normalized() * size * 3
    c.rotation_euler = (target-c.location).to_track_quat('-Z','Y').to_euler()
    if name == 'top':
        c.rotation_euler = (0,0,3.141592653589793)
    elif name == 'bottom':
        c.rotation_euler = (3.141592653589793,0,0)
    s.camera = c
    lights=[]
    for offset, energy in [((-.7,-.6,1.5),100),((.9,.8,.6),65)]:
        light=bpy.data.lights.new('Studio softbox','AREA')
        light.energy=energy*size*size
        light.size=size*2
        obj=bpy.data.objects.new(light.name,light)
        s.collection.objects.link(obj)
        obj.location=center+Vector(direction).normalized()*size*1.6+Vector(offset)*size
        obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
        lights.append(obj)
    s.render.filepath=str(out/ (('source_' if globals().get('INSPECTION') else '')+name+'.png'))
    bpy.ops.render.render(write_still=True)
    for obj in lights+[c]:
        bpy.data.objects.remove(obj,do_unlink=True)
(out / ('inspection_complete.json' if globals().get('INSPECTION') else 'render_complete.json')).write_text(json.dumps({'views':[v[0] for v in views], 'device':s.cycles.device,'backend':backend}))
