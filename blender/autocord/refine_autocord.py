"""Run through Blender CLI with source.blend open.

Retain original geometry/materials outside the strap and five inscription patches.
Small lettering surfaces are locally leveled; replacement UVs avoid scan-atlas seams.
"""
from pathlib import Path
import bpy, bmesh, json, sys
import numpy as np
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import output_dir, generated_path

out=output_dir('blender/autocord/detail_refinement')
reference=out/'references'
o=next(o for o in bpy.context.scene.objects if o.type=='MESH')
o.name='Minolta Autocord | localized reference repairs'
mesh=o.data
co=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get('co',co);co=co.reshape(-1,3)
loops=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',loops)
assert all(p.loop_total==3 for p in mesh.polygons)
faces=loops.reshape(-1,3)
uv=np.empty(len(loops)*2,np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,3,2)
tri=co[faces]; centers=tri.mean(axis=1)
scale=.9793701171875*1.15

def projected(points,view):
    horizontal=points[:,0] if view=='front' else (-points[:,1] if view=='side' else -points[:,0])
    return np.column_stack((500+horizontal*1000/scale,500-(points[:,2]-.9793701171875/2)*1000/scale))

def homography(src,dst):
    a=[];b=[]
    for (x,y),(u,v) in zip(src,dst):
        a.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]])
        b.extend([u,v])
    return np.append(np.linalg.solve(a,b),1).reshape(3,3)

def rect_weight(p,box,feather=2):
    x,y=p.T;l,t,r,b=box
    return np.clip(np.minimum.reduce([x-l,r-x,y-t,b-y])/feather,0,1)

# Reference coordinates are measured on the displayed 1568x1176 / 1176x1568 photographs.
patches=[
 {'name':'AUTOCORD lettering','view':'front','photo':'front_logo','box':[359,216,658,260],
  'src':[(360,217),(657,217),(657,259),(360,259)],
  'dst':[(263,451),(1282,537),(1282,699),(263,589)],'dims':(1568,1176)},
 {'name':'minolta wordmark','view':'front','photo':'front_logo','box':[445,191,572,213],
  'src':[(448,192),(569,192),(569,212),(448,212)],
  'dst':[(574,382),(941,405),(941,486),(574,466)],'dims':(1568,1176)},
 {'name':'pressure plate instructions','view':'side','photo':'right_side_text','box':[426,428,598,508],
  'src':[(444,431),(592,431),(592,504),(444,504)],
  'dst':[(565,536),(975,542),(975,746),(565,738)],'dims':(1176,1568)},
 {'name':'distance and depth of field dial','view':'side','photo':'right_side_text','circle':(444,614,126),
  'src':[(444,488),(570,614),(444,740),(318,614)],
  'dst':[(550,730),(953,1080),(563,1456),(143,1080)],'dims':(1176,1568)},
 {'name':'rear serial 457647','view':'back','photo':'back_numbers','box':[454,282,541,304],
  'src':[(454,282),(541,282),(541,304),(454,304)],
  'dst':[(0,0),(1400,0),(1400,400),(0,400)],'dims':(1400,400)},
]

def weights(p,xyz,patch):
    if 'box' in patch:
        w=rect_weight(p,patch['box'])
    else:
        cx,cy,r=patch['circle'];radius=np.linalg.norm(p-[cx,cy],axis=1)
        # The crank, central hub and their original materials are untouched.
        w=np.clip((r-radius)/3,0,1)*np.clip((radius-54)/3,0,1)
    x,y,z=xyz.T
    if patch['view']=='front':w*=y<-.17
    elif patch['view']=='back':w*=y>.27
    else:
        if 'circle' in patch:w*=(x<-.243)&(x>-.256)
        else:w*=(x<-.250)&(x>-.264)
    return w

records=[]
newco=co.copy()
changed=np.zeros(len(co),bool)
newuv=np.zeros((len(loops),2),np.float32)
normal=np.empty(len(loops)*3,np.float32)
mesh.corner_normals.foreach_get('vector',normal);normal=normal.reshape(-1,3)
for patch in patches:
    p=projected(centers,patch['view']);weight=weights(p,centers,patch)
    candidates=np.flatnonzero(weight>0)
    H=homography(patch['src'],patch['dst'])
    loop_ids=(candidates[:,None]*3+np.arange(3)).ravel()
    screen=projected(co[loops[loop_ids]],patch['view'])
    mapped=np.column_stack((screen,np.ones(len(screen))))@H.T
    mapped=mapped[:,:2]/mapped[:,2,None]
    newuv[loop_ids,0]=mapped[:,0]/patch['dims'][0]
    newuv[loop_ids,1]=1-mapped[:,1]/patch['dims'][1]
    mat=bpy.data.materials.new(patch['name']+' | reference inscription');mat.use_nodes=True
    principled=mat.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Roughness'].default_value=.32
    principled.inputs['Metallic'].default_value=.95
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image=bpy.data.images.load(str(reference/(patch['photo']+'_detail.png')),check_existing=True)
    uvnode=mat.node_tree.nodes.new('ShaderNodeUVMap');uvnode.uv_map='Reference inscriptions'
    mat.node_tree.links.new(uvnode.outputs['UV'],tex.inputs['Vector'])
    mat.node_tree.links.new(tex.outputs['Color'],principled.inputs['Base Color'])
    o.data.materials.append(mat)
    index=len(o.data.materials)-1
    for fi in candidates:mesh.polygons[int(fi)].material_index=index
    vertex_weight=weights(projected(co,patch['view']),co,patch)
    selected=vertex_weight>0
    changed|=selected
    if patch['view']=='front':
        target=-.1885+.05*co[:,0]**2
        if patch['name']=='minolta wordmark':target=np.full(len(co),-.190)
        axis=1;direction=np.array([0,-1,0])
    elif patch['view']=='side':
        target=np.full(len(co),-.2495 if 'circle' in patch else -.258)
        axis=0;direction=np.array([-1,0,0])
    else:
        target=.295-1.38*(co[:,2]-.722824)
        axis=1;direction=np.array([0,1,1.38]);direction=direction/np.linalg.norm(direction)
    newco[:,axis]+=(target-co[:,axis])*vertex_weight
    # Preserve original corner normals away from the inscription region.
    nw=vertex_weight[loops,None]
    normal=normal*(1-nw)+direction*nw
    records.append({'name':patch['name'],'faces':len(candidates),'leveled_vertices':int(selected.sum())})
    print(records[-1],flush=True)
mesh.vertices.foreach_set('co',newco.ravel());mesh.update()
layer=mesh.uv_layers.new(name='Reference inscriptions')
layer.data.foreach_set('uv',newuv.ravel())
mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
mesh.normals_split_custom_set(normal)
assert np.array_equal(newco[~changed],co[~changed])

# Keep the finder lid; the lower cutoff follows only the outboard cord roots.
# Restore from source.blend on every run; never continue from a previous candidate.
strap=(co[:,2]>.878)|((np.abs(co[:,0])>.238)&(co[:,2]>.753))|((np.abs(co[:,0])>.258)&(co[:,2]>.741)&(co[:,1]>-.038)&(co[:,1]<.025))
bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table()
source_index=bm.verts.layers.int.new('source_vertex_index')
for v in bm.verts:v[source_index]=v.index
removed=[bm.verts[int(i)] for i in np.flatnonzero(strap)]
bmesh.ops.delete(bm,geom=removed,context='VERTS')
# UV-separated fragments of the red anchor can survive a geometric cutoff.
# Remove only disconnected, high, red-seeded islands; never broaden the body cut.
base_image=next(n.image for n in o.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and 'basecolor' in n.image.name)
width,height=base_image.size
pixels=np.empty(width*height*4,np.float32);base_image.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)
original_uv=bm.loops.layers.uv[0]
seeds=set()
for f in bm.faces:
    if f.material_index or min(v.co.z for v in f.verts)<.85:continue
    texcoord=sum((loop[original_uv].uv for loop in f.loops),start=Vector((0,0)))/len(f.loops)
    color=pixels[min(height-1,int(texcoord.y*height)),min(width-1,int(texcoord.x*width)),:3]
    if color[0]>.15 and color[0]>color[1]*1.8 and color[0]>color[2]*1.8:seeds.update(f.verts)
fragments=set()
for seed in seeds:
    if seed in fragments:continue
    component={seed};pending=[seed]
    while pending:
        v=pending.pop()
        for edge in v.link_edges:
            other=edge.other_vert(v)
            if other not in component:
                component.add(other);pending.append(other)
        assert len(component)<5000,'Anchor fragment unexpectedly connects to camera body'
    assert min(v.co.z for v in component)>.85
    fragments.update(component)
for v in fragments:strap[v[source_index]]=True
if fragments:bmesh.ops.delete(bm,geom=list(fragments),context='VERTS')
print('Removed residual red-anchor island vertices:',len(fragments),flush=True)
del pixels
# The scanned rear digits contain folded/overlapping triangles. Replace that tiny
# inscription surface instead of collapsing those folds into coplanar artifacts.
rear_faces=[f for f in bm.faces if f.material_index==len(o.data.materials)-1]
bmesh.ops.delete(bm,geom=rear_faces,context='FACES_ONLY')
bm.to_mesh(mesh);bm.free();mesh.update()
remaining=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get('co',remaining)
assert np.array_equal(remaining.reshape(-1,3),newco[~strap])
rear=patches[-1]
vertices=[]
for px,py in rear['src']:
    x=-(px-500)*scale/1000;z=.9793701171875/2+(500-py)*scale/1000
    vertices.append((x,.296-1.38*(z-.722824),z))
detail=bpy.data.meshes.new('Rear serial | clean enamel inscription surface')
detail.from_pydata(vertices,[],[(0,3,2),(0,2,1)]);detail.update()
rear_object=bpy.data.objects.new(detail.name,detail);bpy.context.scene.collection.objects.link(rear_object)
detail.materials.append(o.data.materials[-1])
layer=detail.uv_layers.new(name='Reference inscriptions')
coords=[(0,1),(1,1),(1,0),(0,0)]
for loop in detail.loops:layer.data[loop.index].uv=coords[loop.vertex_index]
report={'removed_strap_vertices':int(strap.sum()),'original_vertices':len(co),'remaining_vertices':len(mesh.vertices),
        'remaining_faces':len(mesh.polygons),'positions_outside_inscription_regions_exactly_preserved':True,
        'original_material_and_textures_preserved':True,
        'max_local_leveling_distance':float(np.max(np.linalg.norm(newco-co,axis=1))),
        'patches':records}
o['refinement_scope']='Strap tails removed; front badge, winding-side inscriptions, rear serial only.'
for image in bpy.data.images:
    if image.users and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'autocord-refined.blend'),compress=True)
(out/'refinement_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
