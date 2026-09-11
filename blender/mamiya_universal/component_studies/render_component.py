"""Render saved cameras from a single component file; no assembly is created.
Optional arguments after --: resolution samples camera_index (0 means all).
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy,os,sys
s=bpy.context.scene
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
resolution=int(args[0]) if args else 1400;samples=int(args[1]) if len(args)>1 else 48;index=int(args[2]) if len(args)>2 else 0
part=os.path.basename(bpy.data.filepath).split('_study.blend')[0]
folder=os.path.join(str(output_dir('blender/mamiya_universal/component_studies', bpy.data.filepath)),'renders' if resolution>=1400 else 'previews');os.makedirs(folder,exist_ok=True)
s.render.resolution_x=s.render.resolution_y=resolution;s.render.resolution_percentage=100;s.cycles.samples=samples;s.render.threads_mode='AUTO'
for cam in sorted((o for o in s.objects if o.type=='CAMERA'),key=lambda o:o.name):
 number=int(cam.name.split()[1])
 if index and number!=index:continue
 s.camera=cam;s.render.filepath=os.path.join(folder,part+'_'+cam.name.replace('CAM ','').replace(' ','_')+'.png');bpy.ops.render.render(write_still=True);print('RENDER_COMPLETE '+s.render.filepath,flush=True)
