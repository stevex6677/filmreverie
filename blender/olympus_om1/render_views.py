"""Render saved masters or decoded GLBs via the local Blender CLI."""
from pathlib import Path
import os,math,json
import bpy
from mathutils import Vector
out=Path(globals().get('OUTPUT_DIR',os.environ['FILM_PHOTO_OUTPUT_DIR']))
prefix=globals().get('PREFIX',os.environ.get('OM1_RENDER_PREFIX','final_'))
res=globals().get('RESOLUTION',int(os.environ.get('OM1_RENDER_SIZE','1200')))
scene=bpy.context.scene
models=[o for o in scene.objects if o.type in {'MESH','FONT','CURVE'} and not o.hide_render]
points=[o.matrix_world@Vector(v) for o in models for v in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
center=(lo+hi)/2;width=max(hi-lo)
for ob in list(scene.objects):
 if ob.type in {'CAMERA','LIGHT'}:bpy.data.objects.remove(ob,do_unlink=True)
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=res;scene.render.resolution_y=res;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Inspection world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.35,.35,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
scene.view_settings.view_transform='AgX'
for name,pos,power,size in [('Key',(1,-2,3),160,2),('Fill',(-2,-1,1),100,2),('Rear',(0,2,3),200,2),('Under',(0,-1,-2),90,2)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power*width**2;data.shape='DISK';data.size=size*width
 ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=center+Vector(pos)*width;ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Evidence camera');cam=bpy.data.objects.new('Evidence camera',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=width*1.18
views={'front':(0,-3,0),'back':(0,3,0),'top':(0,0,3),'bottom':(0,0,-3),'oblique':(1.6,-2.8,1.65)}
for name in globals().get('VIEWS',list(views)):
 cam.location=center+Vector(views[name])*width;direction=center-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
 if name=='bottom':cam.rotation_euler=(math.pi,0,0)
 scene.render.filepath=str(out/'previews'/f'{prefix}{name}.png');bpy.ops.render.render(write_still=True)
print('RENDERS',str(out/'previews'),flush=True)
