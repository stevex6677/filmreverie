"""Render one revised view through Blender CLI. Globals: VIEW, RESOLUTION, SAMPLES."""
from pathlib import Path
import bpy

out=Path(bpy.data.filepath).parent
assert 'ignored_generated' in out.parts and 'refinement' in out.parts
s=bpy.data.scenes['02 Hybrid v2 | Tripo lens'];bpy.context.window.scene=s
views={
    'rear_detail':'V2.1 rear detail',
    'optical_detail':'V2.1 optical detail',
    'optical_axial':'V2.1 optical axial',
    'front_overview':'V2 01 Front three quarter',
    'rear_overview':'V2 03 Rear three quarter',
}
view=globals().get('VIEW','optical_detail')
s.camera=bpy.data.objects[views[view]]
s.render.resolution_x=s.render.resolution_y=globals().get('RESOLUTION',1600)
s.cycles.samples=globals().get('SAMPLES',96)
s.render.filepath=str(out/(view+'.png'))
bpy.ops.render.render(write_still=True)
result={'render':s.render.filepath,'samples':s.cycles.samples,'resolution':s.render.resolution_x}
