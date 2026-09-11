"""Import a read-only GLB source into a separate review file. Run via Blender MCP CLI."""
import bpy, json, hashlib
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
SOURCE = OUT.parent / 'tripo/mamiya_universal_8k.glb'
SOURCE_SHA = 'a6edda4742e79317a226ee5466251469987fa9c8efeacc4271c5dfec08f644d0'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA
bpy.ops.wm.read_factory_settings(use_empty=True)
s = bpy.context.scene
s.name = 'Tripo source | inspection'
bpy.ops.import_scene.gltf(filepath=str(SOURCE), import_pack_images=True)
o = next(o for o in s.objects if o.type == 'MESH')
o.name = 'Tripo source | preserved import'
bpy.context.view_layer.update()
info = {'source_sha256': SOURCE_SHA, 'dimensions': list(o.dimensions),
        'matrix': [list(r) for r in o.matrix_world], 'vertices': len(o.data.vertices),
        'faces': len(o.data.polygons), 'bounds': [list(o.matrix_world @ Vector(v)) for v in o.bound_box]}
studio = bpy.data.collections.new('Review studio'); s.collection.children.link(studio)
def aim(o, target): o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def camera(name, loc, target, scale):
    d=bpy.data.cameras.new(name); d.type='ORTHO'; d.ortho_scale=scale
    c=bpy.data.objects.new(name,d); studio.objects.link(c); c.location=loc; aim(c,target); return c
camera('01 Front', (0,-3,.42), (0,0,.42), 1.16)
camera('02 Front three quarter', (1.5,-2.8,1.45), (0,0,.40), 1.32)
camera('03 Rear', (1.5,2.8,1.35), (0,0,.40), 1.32)
for name,loc,power,size in [('Key',(-1.4,-1.8,2.2),180,1.5),('Fill',(1.5,-.8,1),90,1.2),('Rim',(0,1.5,2),220,1)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    a=bpy.data.objects.new(name,d);studio.objects.link(a);a.location=loc;aim(a,(0,0,.4))
s.world=bpy.data.worlds.new('Neutral studio');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.19,.19,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008))
floor=bpy.context.object;floor.name='Studio floor'
m=bpy.data.materials.new('Matte gray floor');m.diffuse_color=(.17,.17,.17,1);m.use_nodes=True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.17,.17,.17,1)
m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;floor.data.materials.append(m)
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.cycles.use_denoising=True
s.render.threads_mode='FIXED';s.render.threads=4
s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX'
s.camera=bpy.data.objects['01 Front']
OUT.mkdir(exist_ok=True)
(OUT/'source_inspection.json').write_text(json.dumps(info,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'tripo_source_review.blend'),compress=True)
s.render.filepath=str(OUT/'source_front.png');bpy.ops.render.render(write_still=True)
result=info
