"""Render one or all five saved refined cameras. Optional: -- INDEX RESOLUTION SAMPLES."""
import bpy, os, sys
OUT=os.path.dirname(os.path.abspath(__file__))
s=bpy.data.scenes['Mamiya Universal | Studio'];bpy.context.window.scene=s
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
index=int(args[0]) if args else 0
resolution=int(args[1]) if len(args)>1 else 1600
samples=int(args[2]) if len(args)>2 else 64
names=['01_front_three_quarter','02_opposite_front','03_rear_three_quarter','04_side_profile','05_elevated_rear']
folder=os.path.join(OUT,'renders_refined' if resolution>=1600 else 'previews_refined');os.makedirs(folder,exist_ok=True)
s.render.resolution_x=s.render.resolution_y=resolution;s.render.resolution_percentage=100;s.cycles.samples=samples;s.cycles.use_denoising=True;s.render.threads_mode='AUTO'
for i,name in enumerate(names,1):
 if index and i!=index:continue
 s.camera=next(o for o in s.objects if o.type=='CAMERA' and o.name.startswith('CAM • Refined %02d'%i))
 s.render.filepath=os.path.join(folder,name+'.png');bpy.ops.render.render(write_still=True)
 print('RENDER_COMPLETE '+s.render.filepath,flush=True)
