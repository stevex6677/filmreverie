"""Seam-coherent metal smoothing of the accepted Canon master; run via Blender MCP.

Keep the original topology, both UV layers, optics, leather, engraved textures,
knurled grips and separately constructed top controls. Flatten only measured
fascia fields; Taubin-filter selected scan metal and regenerate its normals.
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import bpy
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir

parent=Path(bpy.data.filepath)
parent_sha=hashlib.sha256(parent.read_bytes()).hexdigest()
assert parent_sha=='77a966d1a471ff0c779ce5c33ab05fd85256c0ff9767c7adcaccda2870b90017'
out=output_dir('blender/canon7s/surface_smoothing')
assert out!=parent.parent
obj=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
mesh=obj.data
co=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get('co',co);co=co.reshape(-1,3)
original=co.copy()
loops=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',loops)
faces=loops.reshape(-1,3)
mi=np.empty(len(faces),np.int32);mesh.polygons.foreach_get('material_index',mi)
def uv_digest(layer):
    values=np.empty(len(mesh.loops)*2,np.float32)
    layer.data.foreach_get('uv',values)
    return hashlib.sha256(values.tobytes()).hexdigest()
uv_hashes={layer.name:uv_digest(layer) for layer in mesh.uv_layers}
old_normals=np.empty((len(mesh.loops),3),np.float32)
mesh.corner_normals.foreach_get('vector',old_normals.ravel())

pixel=.9791259765625*1.12/1200
x,y,z=co.T
front=np.column_stack((600+x/pixel,600-(z-.5976563096046448/2)/pixel))
rear=np.column_stack((1200-front[:,0],front[:,1]))
def rectangle(p,left,top,right,bottom,feather=8):
    d=np.minimum.reduce((p[:,0]-left,right-p[:,0],p[:,1]-top,bottom-p[:,1]))
    return np.clip(d/feather,0,1)
def outside_circle(p,cx,cy,r,feather=8):
    return np.clip((np.linalg.norm(p-(cx,cy),axis=1)-r)/feather,0,1)

fascia=rectangle(front,94,319,1110,480)*np.clip((y+.05)/.008,0,1)*np.clip((.075-y)/.03,0,1)
for cx,cy,r in [(269,421,56),(269,362,10),(783,447,11)]:
    fascia*=outside_circle(front,cx,cy,r)
# Do not resurface the finder glass, dark surround, or exposure-meter grille.
fascia*=1-rectangle(front,421,337,760,464,3)
fascia*=1-rectangle(front,805,340,986,468,3)
rear_plate=rectangle(rear,105,321,1104,480)*(y>.175)
for cx,cy,r in [(310,409,82),(648,413,77),(768,414,24)]:
    rear_plate*=outside_circle(rear,cx,cy,r)
trim=np.clip((.039-z)/.009,0,1)*np.clip((z-.002)/.005,0,1)
# End caps belong to the housing; the raised top controls are not selected.
side_metal=np.clip((np.abs(x)-.425)/.025,0,1)*np.clip((z-.405)/.015,0,1)*np.clip((.558-z)/.005,0,1)
body_metal=np.maximum.reduce((fascia,rear_plate,trim,side_metal))
radial=np.sqrt((x-.0722)**2+(z-.23)**2)
# Front rim and recessed optical bezel, not the front glass or barrel knurling.
lens_front=np.clip((radial-.066)/.009,0,1)*np.clip((.166-radial)/.010,0,1)*np.clip((-.205-y)/.007,0,1)
optical_bezel=np.clip((radial-.064)/.007,0,1)*np.clip((.111-radial)/.004,0,1)*np.clip((-.165-y)/.012,0,1)
for sx,sz in [(-.064,.045),(.063,.045),(-.063,-.051),(.063,-.051)]:
    distance=np.sqrt((x-.0722-sx)**2+(z-.23-sz)**2)
    optical_bezel*=np.clip((distance-.003)/.004,0,1)
lens_front=np.maximum(lens_front,optical_bezel)
lens_barrel=np.clip((radial-.142)/.008,0,1)*np.clip((.185-radial)/.009,0,1)*np.clip((y+.133)/.01,0,1)*np.clip((-.063-y)/.009,0,1)
weight=np.maximum(body_metal,np.maximum(lens_front,lens_barrel*.55))
# Every vertex touching a restored material is pinned, including material seams.
protected=np.zeros(len(co),bool)
protected[faces[mi!=0].ravel()]=True
weight[protected]=0

# Virtual welding avoids splitting UV seams without changing mesh topology or UVs.
_,representative,weld=np.unique(np.round(co,6),axis=0,return_index=True,return_inverse=True)
pos=co[representative].astype(np.float64)
start=pos.copy()
w=np.ones(len(pos));np.minimum.at(w,weld,weight)
edge_vertices=np.empty(len(mesh.edges)*2,np.int32);mesh.edges.foreach_get('vertices',edge_vertices)
edges=weld[edge_vertices.reshape(-1,2)]
edges=np.unique(np.sort(edges,axis=1),axis=0)
edges=edges[edges[:,0]!=edges[:,1]]
a,b=edges.T
src=np.concatenate((a,b));dst=np.concatenate((b,a))
degree=np.maximum(np.bincount(src,minlength=len(pos)),1)
def average(values):
    return np.column_stack([np.bincount(src,weights=values[dst,k],minlength=len(pos))/degree for k in range(3)])
for _ in range(35):
    for strength in (.55,-.53):
        pos+=strength*w[:,None]*(average(pos)-pos)
# Keep movement local: smoothing must not change the recognizable silhouette.
delta=pos-start
length=np.linalg.norm(delta,axis=1)
delta*=np.minimum(1,.004/np.maximum(length,1e-12))[:,None]
co=original+delta[weld].astype(np.float32)

# Planar fields are measured from the accepted mesh, not inferred from a texture.
plane_reports=[]
for name,field,depth in [('front fascia',fascia,-.036),('rear fascia',rear_plate,.2208)]:
    flat=field*np.clip((.35-np.abs(x))/.025,0,1)
    flat*=np.clip((.009-np.abs(y-depth))/.004,0,1)
    flat*=w[weld]
    # Use an interior planar subset to retain the original camera's slight tilt.
    sample=(flat>.99)&(np.abs(y-depth)<.002)
    design=np.column_stack((x[sample],z[sample],np.ones(sample.sum())))
    fitted=np.linalg.lstsq(design,y[sample],rcond=None)[0]
    target=fitted[0]*x+fitted[1]*z+fitted[2]
    before=float(np.std(y[sample]-target[sample]))
    co[:,1]+=(target-co[:,1])*(flat*.94)
    after=float(np.std(co[sample,1]-target[sample]))
    plane_reports.append({'region':name,'vertices':int(sample.sum()),'rms_before':before,'rms_after':after})

mesh.vertices.foreach_set('co',co.ravel());mesh.update()
# Angle-preserving area normals from the smoothed surface, diffused only locally.
fc=np.cross(co[faces[:,1]]-co[faces[:,0]],co[faces[:,2]]-co[faces[:,0]])
face_weld=weld[faces]
normal=np.column_stack([np.bincount(face_weld.ravel(),weights=np.repeat(fc[:,k],3),minlength=len(pos)) for k in range(3)])
normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-12)
for _ in range(4):
    normal+=.45*w[:,None]*(average(normal)-normal)
    normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-12)
blend=w[weld[loops]]
new_normals=old_normals*(1-blend[:,None])+normal[weld[loops]]*blend[:,None]
new_normals/=np.maximum(np.linalg.norm(new_normals,axis=1)[:,None],1e-12)
mesh.normals_split_custom_set(new_normals)

def plain_material(name,color,metallic,roughness):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=metallic
    shader.inputs['Roughness'].default_value=roughness
    mesh.materials.append(mat)
    return len(mesh.materials)-1
silver=plain_material('Canon satin metal | scan noise removed',(.48,.49,.50),.88,.31)
black=plain_material('Lens recessed anodized metal | smooth optical bezel',(.009,.011,.012),.55,.28)
# Retain the barrel's printed markings but suppress its scan normal-map noise.
barrel=mesh.materials[0].copy();barrel.name='Lens barrel | preserved markings and reduced scan normals'
for node in barrel.node_tree.nodes:
    if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.12
mesh.materials.append(barrel);barrel_slot=len(mesh.materials)-1
new_mi=mi.copy()
body_faces=(body_metal[faces].mean(axis=1)>.02)&(mi==0)
lens_faces=(lens_front[faces].mean(axis=1)>.02)&(mi==0)
barrel_faces=(lens_barrel[faces].mean(axis=1)>.65)&(mi==0)
new_mi[body_faces]=silver
new_mi[barrel_faces]=barrel_slot
new_mi[lens_faces & (radial[faces].mean(axis=1)<.110)]=black
new_mi[lens_faces & (radial[faces].mean(axis=1)>.133)]=silver
# Feather the finish into the captured color instead of leaving jagged material
# islands around finder rims and screws. glTF carries this as byte COLOR_0.
colors=np.ones((len(loops),4),np.float32)
source_image=next(n.image for n in mesh.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and 'basecolor' in n.image.name)
pixels=np.empty(len(source_image.pixels),np.float32);source_image.pixels.foreach_get(pixels)
pixels=pixels.reshape(source_image.size[1],source_image.size[0],4)
uv=np.empty((len(loops),2),np.float32);mesh.uv_layers[0].data.foreach_get('uv',uv.ravel())
for slot,target in [(silver,(.48,.49,.50)),(black,(.009,.011,.012))]:
    selected=np.repeat(new_mi==slot,3)
    texel=np.floor(uv[selected]*source_image.size[:]).astype(np.int32)
    captured=pixels[texel[:,1]%source_image.size[1],texel[:,0]%source_image.size[0],:3]
    captured=np.where(captured<=.04045,captured/12.92,((captured+.055)/1.055)**2.4)
    amount=np.maximum(body_metal,lens_front)[loops[selected]][:,None]
    colors[selected,:3]=captured*(1-amount)+np.asarray(target)*amount
    nodes=mesh.materials[slot].node_tree.nodes
    color_node=nodes.new('ShaderNodeVertexColor');color_node.layer_name='Surface finish'
    mesh.materials[slot].node_tree.links.new(color_node.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
color_layer=mesh.color_attributes.new(name='Surface finish',type='BYTE_COLOR',domain='CORNER')
color_layer.data.foreach_set('color',colors.ravel())
mesh.color_attributes.active_color_index=len(mesh.color_attributes)-1
mesh.color_attributes.render_color_index=len(mesh.color_attributes)-1
del pixels,colors,uv
mesh.polygons.foreach_set('material_index',new_mi)
mesh.update()

assert np.array_equal(co[weight==0],original[weight==0]),'Protected geometry moved'
assert len(mesh.vertices)==len(original) and len(mesh.polygons)==len(faces)
assert np.array_equal(new_mi[mi!=0],mi[mi!=0]),'Restored materials changed'
for layer in mesh.uv_layers:
    actual=uv_digest(layer)
    assert actual==uv_hashes[layer.name],f'UV layer changed: {layer.name}'
movement=np.linalg.norm(co-original,axis=1)
report={'parent_master':str(parent),'parent_sha256':parent_sha,'method':'35 Taubin passes on virtually welded metal vertices; fitted fascia planes; locally regenerated normals; region-specific PBR finish',
        'vertices':len(co),'triangles':len(faces),'moved_vertices':int((movement>0).sum()),'maximum_displacement':float(movement.max()),
        'protected_vertices':int((weight==0).sum()),'protected_coordinates_unchanged':True,'topology_unchanged':True,'uv_layers_unchanged':True,'restored_materials_unchanged':True,
        'separate_detail_objects_unchanged':True,'satin_metal_faces':int((new_mi==silver).sum()),'lens_bezel_faces':int((new_mi==black).sum()),'preserved_barrel_faces':int((new_mi==barrel_slot).sum()),
        'fascia_planes':plane_reports,'uv_sha256':uv_hashes}
(out/'surface_report.json').write_text(json.dumps(report,indent=2))
shutil.copy2(parent.parent/'refinement_report.json',out/'refinement_report.json')
for image in bpy.data.images:
    if image.source=='FILE' and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'canon7s-refined.blend'))
print(json.dumps(report),flush=True)
renderer=Path(__file__).with_name('render_views.py')
exec(compile(renderer.read_text(),str(renderer),'exec'),{'__file__':str(renderer)})
