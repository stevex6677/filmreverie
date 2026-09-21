"""Render views from an opened source or refined master through Blender MCP."""
from pathlib import Path
import bpy, json, os, sys
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir
out=output_dir('blender/autocord/detail_refinement',bpy.data.filepath)
s=bpy.context.scene
s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    gpu=[d for d in prefs.devices if d.type=='OPTIX']
    if gpu:
        for d in prefs.devices:d.use=d.type=='OPTIX'
        s.cycles.device='GPU'
except Exception:pass
s.world=bpy.data.worlds.new('Autocord evidence studio');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.22,.22,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
s.view_settings.view_transform='AgX'
s.render.resolution_x=1600;s.render.resolution_y=1600;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG'
views=[
 ('front', (0,-3,.46),(0,0,.46),1.05),
 ('right',(-3,0,.46),(0,0,.46),1.05),
 ('rear',(0,3,.46),(0,0,.46),1.05),
 ('front_logo',(0,-3,.804),(0,-.18,.804),.46),
 ('right_details',(-3,.048,.46),(-.25,.048,.46),.57),
 ('rear_serial',(0,2,1.25),(0,.294,.722),.23),
 ('three_quarter',(-1.6,-2.8,1.5),(0,0,.43),1.15),
 ('bottom',(0,.045,-3),(0,.045,0),.68),
 ('bottom_details',(.70,-.62,-1.6),(0,.04,.035),.72),
 ('bottom_socket',(0,.045,-3),(0,.045,0),.29),
 ('upper_lens',(.013,-3,.565),(.013,-.25,.565),.31),
 ('lower_lens',(.013,-3,.313),(.013,-.25,.313),.41),
 ('front_lower_details',(.013,-3,.135),(.013,-.19,.135),.52),
 ('front_oblique',(.8,-3,.85),(0,-.18,.46),.95),
]
priority={'upper_lens':0,'lower_lens':1,'front_lower_details':2,'front_oblique':3}
views.sort(key=lambda view:priority.get(view[0],4))
requested=os.environ.get('AUTOCORD_RENDER_VIEWS')
if requested:
    selected=set(requested.split(','))
    assert selected <= {view[0] for view in views}, 'Unknown render view'
    views=[view for view in views if view[0] in selected]
for name,loc,target,scale in views:
    d=bpy.data.cameras.new(name);d.type='ORTHO';d.ortho_scale=scale
    c=bpy.data.objects.new(name,d);s.collection.objects.link(c);c.location=loc
    c.rotation_euler=(Vector(target)-c.location).to_track_quat('-Z','Y').to_euler();s.camera=c
    lights=[]
    for label,offset,energy,size in [('Key',(-.9,-.6,1.5),85,2),('Fill',(.8,.6,.5),35,1.7)]:
        light=bpy.data.lights.new(label,'AREA');light.energy=energy;light.shape='DISK';light.size=size
        obj=bpy.data.objects.new(label,light);s.collection.objects.link(obj)
        obj.location=Vector(target)+(Vector(loc)-Vector(target)).normalized()*1.6+Vector(offset)
        obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();lights.append(obj)
    s.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
    for obj in lights:bpy.data.objects.remove(obj,do_unlink=True)
    (out/'render_progress.json').write_text(json.dumps({'last_view':name}))
(out/'render_complete.json').write_text(json.dumps({'views':[v[0]+'.png' for v in views],'device':s.cycles.device}))
