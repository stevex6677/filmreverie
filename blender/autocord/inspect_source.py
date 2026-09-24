"""Inspect the original GLB in an isolated Blender CLI background process; never edit input."""
from pathlib import Path
import sys
import bpy
import json
import hashlib
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, output_dir

out = output_dir('blender/autocord/detail_refinement')
bpy.ops.wm.read_factory_settings(use_empty=True)
source = asset_path('blender/autocord/tripo/tripo_autocord.glb')
bpy.ops.import_scene.gltf(filepath=str(source), import_pack_images=True)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.context.view_layer.update()
info = {'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'objects': []}
for o in meshes:
    info['objects'].append({'name': o.name, 'vertices': len(o.data.vertices), 'faces': len(o.data.polygons),
                            'bounds': [list(o.matrix_world @ Vector(v)) for v in o.bound_box],
                            'matrix': [list(r) for r in o.matrix_world],
                            'materials': [m.name for m in o.data.materials]})
(out / 'source_inspection.json').write_text(json.dumps(info, indent=2))
print(json.dumps(info), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'source.blend'), compress=True)
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.samples = 16
s.cycles.use_denoising = True
s.render.resolution_x = 1000
s.render.resolution_y = 1000
s.render.resolution_percentage = 100
s.world = bpy.data.worlds.new('Inspection studio')
s.world.use_nodes = True
s.world.node_tree.nodes['Background'].inputs[0].default_value = (.3, .3, .3, 1)
s.world.node_tree.nodes['Background'].inputs[1].default_value = .7
s.view_settings.view_transform = 'AgX'
points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
center = sum(points, Vector()) / len(points)
size = max(max(v[i] for v in points)-min(v[i] for v in points) for i in range(3))
for name, direction in [('front', (0,-1,0)), ('back',(0,1,0)), ('right',(1,0,0)), ('left',(-1,0,0))]:
    d = bpy.data.cameras.new(name)
    d.type = 'ORTHO'
    d.ortho_scale = size * 1.15
    c = bpy.data.objects.new(name, d)
    s.collection.objects.link(c)
    c.location = center + Vector(direction) * size * 3
    c.rotation_euler = (center-c.location).to_track_quat('-Z','Y').to_euler()
    s.camera = c
    light = bpy.data.lights.new(name+' light', 'AREA')
    light.energy = 160 * size * size
    light.size = size * 2
    lo = bpy.data.objects.new(light.name, light)
    s.collection.objects.link(lo)
    lo.location = c.location + Vector((0,0,size))
    lo.rotation_euler = (center-lo.location).to_track_quat('-Z','Y').to_euler()
    s.render.filepath = str(out / ('source_'+name+'.png'))
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(lo, do_unlink=True)
(out / 'inspection_complete.json').write_text(json.dumps({'output': str(out)}))
