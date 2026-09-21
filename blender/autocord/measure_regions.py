"""Report surface depths and material inputs before local texture repairs."""
from pathlib import Path
import bpy, json
from mathutils import Vector
out=Path(bpy.data.filepath).parent
o=next(o for o in bpy.context.scene.objects if o.type=='MESH')
s=0.9793701171875*1.15
z0=0.9793701171875/2
info={'materials': [], 'samples': {}}
for m in o.data.materials:
    info['materials'].append({'name':m.name,'nodes':[{'name':n.name,'type':n.type,'image':n.image.name if n.type=='TEX_IMAGE' else None,'size':list(n.image.size) if n.type=='TEX_IMAGE' else None,'inputs':{i.name:str(i.default_value) for i in n.inputs if hasattr(i,'default_value') and not i.is_linked}} for n in m.node_tree.nodes], 'links':[(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name) for l in m.node_tree.links]})
for view,points in {'front':[(350,240),(500,240),(660,240),(500,200),(440,210)],'side':[(450,450),(500,475),(560,475),(600,500),(450,520),(450,700),(350,610),(550,610),(510,390),(450,610)],'back':[(465,293),(500,293),(535,293)]}.items():
    rows=[]
    for px,py in points:
        u=(px-500)*s/1000; z=z0+(500-py)*s/1000
        origin,direction= ((u,-2,z),(0,1,0)) if view=='front' else (((-2,-u,z),(1,0,0)) if view=='side' else ((-u,2,z),(0,-1,0)))
        hit,loc,normal,face=o.ray_cast(Vector(origin),Vector(direction))
        rows.append({'pixel':[px,py],'hit':hit,'location':list(loc),'normal':list(normal)})
    info['samples'][view]=rows
(out/'region_measurements.json').write_text(json.dumps(info,indent=2))
print(json.dumps(info),flush=True)
