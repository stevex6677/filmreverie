"""Render one view from v2 in a fresh Blender CLI background process.

Globals: INDEX (1..5; 0 = QA close-up), RESOLUTION (default 1400), SAMPLES (20).
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy
OUT=output_dir('blender/mamiya_universal/hybrid/v2', bpy.data.filepath)
s=bpy.data.scenes['02 Hybrid v2 | Tripo lens'];bpy.context.window.scene=s
index=globals().get('INDEX',1)
names=['V2 QA detail','V2 01 Front three quarter','V2 02 Opposite front','V2 03 Rear three quarter','V2 04 Side profile','V2 05 Elevated front']
files=['qa_detail','01_front_three_quarter','02_opposite_front','03_rear_three_quarter','04_side_profile','05_elevated_front']
s.camera=bpy.data.objects[names[index]]
s.render.resolution_x=s.render.resolution_y=globals().get('RESOLUTION',1400)
s.cycles.samples=globals().get('SAMPLES',20)
s.render.filepath=str(OUT/(files[index]+'.png'))
bpy.ops.render.render(write_still=True)
result={'render':s.render.filepath,'pixels':s.render.resolution_x,'samples':s.cycles.samples}
