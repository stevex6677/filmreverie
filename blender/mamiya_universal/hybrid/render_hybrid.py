"""Render one original/hybrid view in a fresh Blender MCP background process.

Set globals VARIANT='hybrid'|'source', VIEW='three_quarter'|'detail'|'front'|'side',
RESOLUTION=1400, SAMPLES=16 before executing this file.
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy
from mathutils import Vector
OUT=output_dir('blender/mamiya_universal/hybrid', bpy.data.filepath)
variant=globals().get('VARIANT','hybrid');view=globals().get('VIEW','three_quarter')
s=bpy.data.scenes['02 Hybrid | refined front' if variant=='hybrid' else '01 Tripo original | comparison']
bpy.context.window.scene=s
s.camera=bpy.data.objects[{'three_quarter':'02 Front three quarter','detail':'04 Front detail','front':'01 Front','side':'01 Front'}[view]]
if view=='side':
    s.camera.location=(3,0,.42);s.camera.rotation_euler=(Vector((0,0,.42))-s.camera.location).to_track_quat('-Z','Y').to_euler()
s.render.resolution_x=s.render.resolution_y=globals().get('RESOLUTION',1400)
s.cycles.samples=globals().get('SAMPLES',16)
s.render.filepath=str(OUT/(variant+'_'+view+'.png'))
bpy.ops.render.render(write_still=True)
result={'render':s.render.filepath,'samples':s.cycles.samples,'resolution':s.render.resolution_x}
