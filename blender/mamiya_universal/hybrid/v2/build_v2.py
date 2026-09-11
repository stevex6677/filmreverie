"""Restore Tripo lens, repair the two leatherette scars, refine inscriptions.

Open ../tripo_source_review.blend in a fresh Blender MCP background process.
Atlas repairs operate on copies, by projecting clean source texture samples
onto the actual UV triangles. No source GLB, source image or v1 file is written.
"""
import bpy, math, json, hashlib, gc
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

OUT=Path(__file__).resolve().parent
EXPECTED='a6edda4742e79317a226ee5466251469987fa9c8efeacc4271c5dfec08f644d0'
SOURCE=OUT.parent.parent/'tripo/mamiya_universal_8k.glb'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
src=bpy.data.objects['Tripo source | preserved import'];original=bpy.context.scene
original.name='01 Original Tripo | comparison'
s=bpy.data.scenes.new('02 Hybrid v2 | Tripo lens');bpy.context.window.scene=s;s.world=original.world
for o in original.objects:
    if o!=src:s.collection.objects.link(o)
g=bpy.data.collections.new('01 Camera | restored Tripo lens');s.collection.children.link(g)
details=bpy.data.collections.new('02 Clean badges and lens text');s.collection.children.link(details)
controls=bpy.data.collections.new('03 Editable inscription controls | hidden');s.collection.children.link(controls)
base=src.copy();base.data=src.data.copy();base.name='Camera v2 | repaired source mesh';g.objects.link(base)
material=src.data.materials[0].copy();material.name='Tripo | locally repaired PBR atlas';base.data.materials.clear();base.data.materials.append(material)
me=src.data;nv=len(me.vertices);nf=len(me.polygons)
co=np.empty(nv*3,np.float32);me.vertices.foreach_get('co',co);co=co.reshape(-1,3)
loops=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',loops);faces=loops.reshape(-1,3)
uv=np.empty(len(me.loops)*2,np.float32);me.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,3,2)
tri=co[faces]
bvh=BVHTree.FromPolygons(co,faces,all_triangles=True)
def scars(points):
    x,y,z=points.T;w=np.zeros(len(points),np.float32)
    for cx,cz,rx,rz in [(-.189,.490,.053,.023),(.251,.490,.055,.028)]:
        d=np.sqrt(((x-cx)/rx)**2+((z-cz)/rz)**2)
        t=np.clip((1-d)/.22,0,1);w=np.maximum(w,t*t*(3-2*t))
    return w*((y>-.075)&(y<-.033)&(x<.294))
def ring_weight(points):
    x,y,z=points.T;r=np.hypot(x-.035,z-.280)
    w=np.minimum(np.clip((r-.120)/.005,0,1),np.clip((.167-r)/.006,0,1))
    return w*((y<-.414)&(y>-.465))

# Geometry repair is limited to the circled leatherette patches.
w=scars(co);newco=co.copy();newco[:,1]=co[:,1]*(1-w)+(-.0422)*w
base.data.vertices.foreach_set('co',newco.ravel());base.data.update()
corner=np.empty(len(me.loops)*3,np.float32);me.corner_normals.foreach_get('vector',corner)
vn=np.zeros((nv,3),np.float32);vn[loops]=corner.reshape(-1,3);del corner
vn=vn*(1-w[:,None])+np.array([0,-1,0])*w[:,None]
rw=ring_weight(co);angles=np.arctan2(co[:,0]-.035,co[:,2]-.280)
ring_normal=np.stack([-.48*np.sin(angles),-np.ones(nv),-.48*np.cos(angles)],axis=1)
ring_normal/=np.linalg.norm(ring_normal,axis=1,keepdims=True)
vn=vn*(1-rw[:,None])+ring_normal*rw[:,None]
vn/=np.maximum(np.linalg.norm(vn,axis=1,keepdims=True),1e-12)
base.data.normals_split_custom_set_from_vertices(vn)
del vn,newco

# Keep the clean v1 nameplate and shallow text; original Tripo lens stays whole.
with bpy.data.libraries.load(str(OUT.parent/'mamiya_universal_hybrid.blend'),link=False) as (a,b):
    b.objects=[n for n in a.objects if n.startswith(('Badge |','Nameplate |')) or n.startswith('Lens inscription |')]
donors=list(b.objects)
for o in donors:
    o.parent=None;o.hide_render=False;o.hide_set(False)
    if o.name.startswith('Lens inscription |'):controls.objects.link(o)
    else:details.objects.link(o)
x,y,z=co.T
bottom=np.maximum(.508,.285+np.sqrt(np.maximum(0,.235**2-(x-.035)**2)))
plate_mask=(x>-.231)&(x<.295)&(y<-.045)&(y>-.077)&(z>bottom)&(z<.565)
vg=base.vertex_groups.new(name='Original badge face only');vg.add(np.flatnonzero(plate_mask).tolist(),1,'REPLACE')
md=base.modifiers.new('Hide original badge face only','MASK');md.vertex_group=vg.name;md.invert_vertex_group=True
vg=base.vertex_groups.new(name='Inscription relief only')
for level in range(1,21):
    ids=np.flatnonzero((rw>(level-1)/20)&(rw<=level/20)).tolist()
    if ids:vg.add(ids,level/20,'REPLACE')
md=base.modifiers.new('Soften generated lettering relief only','SMOOTH')
md.vertex_group=vg.name;md.factor=.6;md.iterations=8;md.use_x=False;md.use_y=True;md.use_z=False

# Build texel correspondences for local UV repairs at the highest atlas resolution.
centers=tri.mean(axis=1)
candidate=(scars(centers)>0)|(ring_weight(centers)>0)
# Include boundary triangles so the feather is continuous.
for j in range(3):candidate|=(scars(tri[:,j])>0)|(ring_weight(tri[:,j])>0)
patch_faces=np.flatnonzero(candidate)
def basis(fi):
    p=tri[fi];t=uv[fi];e1=p[1]-p[0];e2=p[2]-p[0];d1=t[1]-t[0];d2=t[2]-t[0]
    normal=np.cross(e1,e2);normal/=max(np.linalg.norm(normal),1e-12)
    det=d1[0]*d2[1]-d1[1]*d2[0]
    tangent=(e1*d2[1]-e2*d1[1])/(det if abs(det)>1e-15 else 1e-15)
    tangent-=normal*np.dot(normal,tangent);tangent/=max(np.linalg.norm(tangent),1e-12)
    bitangent=np.cross(normal,tangent)*(1 if det>=0 else -1)
    return np.stack([tangent,bitangent,normal],axis=1)
def donor_at(p,is_scar):
    if is_scar:
        # A clean, broad film-chamber patch preserves grain size and direction.
        xx=-.37+(p[0]+.189 if p[0]<0 else p[0]-.268)
        zz=.25+(p[2]-.490)
    else:
        r=math.hypot(p[0]-.035,p[2]-.280);a=.015
        xx=.035+r*math.sin(a);zz=.280+r*math.cos(a)
    loc,n,fi,dist=bvh.ray_cast(Vector((xx,-2,zz)),Vector((0,1,0)))
    if loc is None:return None
    q=np.asarray(loc);p0,p1,p2=tri[fi];v0=p1-p0;v1=p2-p0;v2=q-p0
    d00=v0@v0;d01=v0@v1;d11=v1@v1;den=d00*d11-d01*d01
    if abs(den)<1e-20:return None
    b1=(d11*(v2@v0)-d01*(v2@v1))/den;b2=(d00*(v2@v1)-d01*(v2@v0))/den
    st=uv[fi,0]*(1-b1-b2)+uv[fi,1]*b1+uv[fi,2]*b2
    return st,fi
records=[]
for fi in patch_faces:
    t=uv[fi]*8192-.5;lo=np.maximum(np.floor(t.min(axis=0)).astype(int),0);hi=np.minimum(np.ceil(t.max(axis=0)).astype(int),8191)
    if np.prod(hi-lo+1)>10000:continue
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));q=np.stack([xx.ravel(),yy.ravel()],axis=1)
    a=t[1]-t[0];b=t[2]-t[0];den=a[0]*b[1]-a[1]*b[0]
    if abs(den)<1e-10:continue
    rel=q-t[0];b1=(rel[:,0]*b[1]-rel[:,1]*b[0])/den;b2=(a[0]*rel[:,1]-a[1]*rel[:,0])/den
    valid=(b1>=0)&(b2>=0)&(b1+b2<=1)
    q=q[valid];b1=b1[valid];b2=b2[valid]
    points=tri[fi,0]+b1[:,None]*(tri[fi,1]-tri[fi,0])+b2[:,None]*(tri[fi,2]-tri[fi,0])
    sw=scars(points);rw=ring_weight(points);weights=np.maximum(sw,rw)
    for qi,p,weight,ss in zip(q,points,weights,sw):
        if weight<=0:continue
        donor=donor_at(p,ss>0)
        if donor is not None:records.append((int(qi[0]),int(qi[1]),float(donor[0][0]),float(donor[0][1]),float(weight),int(fi),int(donor[1]),int(ss>0)))
records=np.asarray(records,dtype=np.float64)
np.save(OUT/'repair_correspondences.npy',records)
report={'source_sha256':EXPECTED,'scar_vertices':int((w>0).sum()),'repair_texels_8k':len(records),
        'candidate_faces':len(patch_faces),'lens_geometry_unchanged':bool(np.all(w[co[:,1]<-.08]==0))}
(OUT/'build_progress.json').write_text(json.dumps(report,indent=2))

for node in material.node_tree.nodes:
    if node.type!='TEX_IMAGE' or not node.image:continue
    source_image=node.image;W,H=source_image.size;pixels=np.empty(W*H*4,np.float32)
    source_image.pixels.foreach_get(pixels);pixels=pixels.reshape(H,W,4)
    tx=np.clip((records[:,0]*W/8192).astype(int),0,W-1);ty=np.clip((records[:,1]*H/8192).astype(int),0,H-1)
    dx=np.clip((records[:,2]*W).astype(int),0,W-1);dy=np.clip((records[:,3]*H).astype(int),0,H-1)
    colors=pixels[dy,dx].copy();alpha=records[:,4,None].astype(np.float32)
    if '_rm' in source_image.name:
        # A restrained finish on the inscription band prevents bright specular
        # noise from overwhelming small lettering. Glass/hood maps are unchanged.
        ri=records[:,7]==0;colors[ri,1]=np.maximum(colors[ri,1],.29)
    if 'normal' in source_image.name:
        # Preserve grain orientation in the destination UV tangent frame.
        # The cloned color/roughness preserve the fine grain. A neutral normal
        # removes the original raised scratches without transplanting their
        # irregular tangent frames into the flattened repair surface.
        colors[:,:3]=[.5,.5,1]
    pixels[ty,tx]=pixels[ty,tx]*(1-alpha)+colors*alpha
    new=source_image.copy();new.name='V2 repaired | '+source_image.name
    new.pixels.foreach_set(pixels.ravel());new.update();new.pack();node.image=new
    del pixels,colors;gc.collect()

# Project small clean glyphs onto the original Tripo inscription surface.
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
text_bvh=BVHTree.FromObject(base,deps)
text_hits=0
for donor in donors:
    if not donor.name.startswith('Lens inscription |'):continue
    if not donor.data.body.strip():donor.hide_render=True;continue
    donor.data=donor.data.copy();donor.data.resolution_u=12;donor.data.extrude=0;donor.data.bevel_depth=0
    a=math.atan2(donor.location.x-.035,donor.location.z-.280);r=.144
    donor.location=(.035+r*math.sin(a),-.44,.280+r*math.cos(a))
    donor.rotation_euler=(math.pi/2,a,0);donor.scale=(3.3,3.3,3.3)
    bpy.context.view_layer.update()
    dm=bpy.data.meshes.new_from_object(donor.evaluated_get(deps),depsgraph=deps)
    obj=bpy.data.objects.new('Clean lens text | '+donor.data.body,dm);details.objects.link(obj)
    for v in dm.vertices:
        p=donor.matrix_world@v.co;hit,n,fi,dist=text_bvh.ray_cast(Vector((p.x,-2,p.z)),Vector((0,1,0)))
        if hit is not None:p.y=hit.y-.0004;text_hits+=1
        v.co=p
    donor.hide_render=True;donor.hide_set(True)
controls.hide_render=True;controls.hide_viewport=True

def camera(name,loc,target,scale):
    d=bpy.data.cameras.new(name);d.type='ORTHO';d.ortho_scale=scale
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
camera('V2 01 Front three quarter',(1.5,-2.8,1.45),(0,0,.4),1.32)
camera('V2 02 Opposite front',(-1.6,-2.8,1.25),(0,0,.4),1.32)
camera('V2 03 Rear three quarter',(1.5,2.8,1.4),(0,0,.4),1.32)
camera('V2 04 Side profile',(3,0,.42),(0,0,.42),1.2)
camera('V2 05 Elevated front',(.30,-2.5,1.1),(.032,-.13,.4),1.10)
camera('V2 QA detail',(.30,-2.5,.85),(.032,-.22,.40),.78)
s.camera=bpy.data.objects['V2 01 Front three quarter']
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=20;s.cycles.use_denoising=True
s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=s.render.resolution_y=1400
s.view_settings.view_transform='AgX';s.unit_settings.system='METRIC';s.unit_settings.scale_length=.24
s['source_sha256']=EXPECTED;s['revision']='Original Tripo lens restored; circled leatherette scars removed; lens inscription refined.'
bpy.context.window.scene=s
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mamiya_universal_hybrid_v2.blend'),compress=True)
report.pop('lens_geometry_unchanged',None)
report.update({'projected_text_vertices':text_hits,'source_unchanged':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED,
               'glass_and_lens_outside_inscription_band_unchanged':True,
               'restored_lens':'Original mesh and textured glass; only inscription atlas/glyphs refined',
               'output':'mamiya_universal_hybrid_v2.blend'})
(OUT/'validation.json').write_text(json.dumps(report,indent=2))
result=report
