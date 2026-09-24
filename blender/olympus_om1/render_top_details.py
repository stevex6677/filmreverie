"""Close-up evidence for the top3 revision, on a master or imported GLB."""
from pathlib import Path
import os,bpy
from mathutils import Vector
renderer=Path(__file__).with_name('render_views.py')
ns={'__file__':str(renderer),'VIEWS':[],'RESOLUTION':1400}
exec(compile(renderer.read_text(),str(renderer),'exec'),ns)
cam=ns['cam'];scene=bpy.context.scene;out=Path(os.environ['FILM_PHOTO_OUTPUT_DIR'])
for name,target,offset,scale in [('dial',(-.154,.159,.535),(0,0,2),.18),('top_detail',(.02,.14,.52),(.5,-.9,1.3),.63),('top_rear',(.02,.14,.52),(.5,.9,1.3),.63)]:
 center=Vector(target);cam.location=center+Vector(offset);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
 scene.render.filepath=str(out/'previews'/(os.environ.get('OM1_RENDER_PREFIX','final_')+name+'.png'));bpy.ops.render.render(write_still=True)
