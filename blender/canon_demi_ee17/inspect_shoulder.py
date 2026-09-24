"""Read the accepted master's shoulder profile in a local Blender CLI background process."""
import bpy, json
from mathutils import Vector
ob = max((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o:len(o.data.vertices))
pix = .979248046875*1.12/1200
rows = []
for y in [430,470,510,550,590,620,640]:
    samples = []
    for x in [160,240,320,380,420,460,500,540,580,620,660,700,820]:
        hit,p,n,f = ob.ray_cast(Vector(((x-600)*pix, -(y-600)*pix,1)),Vector((0,0,-1)))
        samples.append([x,round(p.z,5) if hit else None])
    rows.append({'y':y,'samples':samples})
print('SHOULDER_GRID',json.dumps(rows))
print('DRACO_PROPERTIES', [p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties if 'draco' in p.identifier])
