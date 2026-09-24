"""Refine the accepted v2 through Blender CLI; never overwrite the donor.

Execute in a fresh background Blender with the accepted v2 open and __file__ set.
Source and texture editing is limited to a copied v2 object/material. The original
comparison scene, hood, barrel, leatherette and front inscriptions are retained.
"""
from pathlib import Path
import sys, math, json, hashlib, gc
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / 'scripts'))
from shared_assets import output_dir

OUT = output_dir('blender/mamiya_universal/hybrid/v2/refinement')
SOURCE = Path(bpy.data.filepath)
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
s = bpy.data.scenes['02 Hybrid v2 | Tripo lens']
bpy.context.window.scene = s
base = bpy.data.objects['Camera v2 | repaired source mesh']
base.data = base.data.copy()
mat = base.data.materials[0].copy()
mat.name = 'V2.1 | locally cleaned rear atlas'
base.data.materials[0] = mat
details = bpy.data.collections.new('04 V2.1 | clean rear lettering')
optics = bpy.data.collections.new('05 V2.1 | real coated optics')
s.collection.children.link(details)
s.collection.children.link(optics)

me = base.data
co = np.empty(len(me.vertices)*3, np.float32)
me.vertices.foreach_get('co', co)
co = co.reshape(-1,3)
indices = np.empty(len(me.loops),np.int32)
me.loops.foreach_get('vertex_index',indices)
faces = indices.reshape(-1,3)
tri = co[faces]
uv = np.empty(len(me.loops)*2,np.float32)
me.uv_layers.active.data.foreach_get('uv',uv)
uv = uv.reshape(-1,3,2)
bvh = BVHTree.FromPolygons(co, faces, all_triangles=True)
# x/z rectangles in the original mesh coordinate system, plus depth limits.
regions = [(.063,.288,.606,.667,.19,.23),
           (-.073,.145,.470,.515,.30,.34),
           (-.244,-.120,.475,.501,.30,.34)]
def region_weight(points, region):
    x0,x1,z0,z1,y0,y1 = region
    x,y,z = points.T
    w = np.minimum.reduce([(x-x0)/.005,(x1-x)/.005,
                           (z-z0)/.004,(z1-z)/.004])
    w = np.clip(w,0,1);w=w*w*(3-2*w)
    return w*((y>y0)&(y<y1))

# Flatten only the reconstructed relief; keep all original vertices elsewhere.
newco = co.copy()
fits=[]
def basis2(points):
    xx=points[:,0];zz=points[:,2]
    return np.stack([np.ones(len(points)),xx,zz,xx*xx,xx*zz,zz*zz],1)
for ri,region in enumerate(regions):
    w=region_weight(co,region)
    boundary=(w>0)&(w<.6)
    fit=np.linalg.lstsq(basis2(co[boundary]),co[boundary,1],rcond=None)[0]
    fits.append(fit)
    target=basis2(co)@fit
    newco[:,1] = newco[:,1]*(1-w)+target*w
me.vertices.foreach_set('co',newco.ravel());me.update()
normal = np.empty(len(me.loops)*3,np.float32)
me.corner_normals.foreach_get('vector',normal)
normal=normal.reshape(-1,3)
for ri,region in enumerate(regions):
    w=region_weight(co,region)[indices,None]
    f=fits[ri];xx=co[indices,0];zz=co[indices,2]
    nn=np.stack([-(f[1]+2*f[3]*xx+f[4]*zz),np.ones(len(xx)),-(f[2]+f[4]*xx+2*f[5]*zz)],1)
    nn/=np.linalg.norm(nn,axis=1,keepdims=True)
    normal=normal*(1-w)+nn*w
normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-12)
me.normals_split_custom_set(normal.tolist())
del normal

# Clone nearby clean painted metal in UV space. All original PBR images stay intact.
records=[]
for ri,region in enumerate(regions):
    candidate=np.zeros(len(faces),bool)
    for j in range(3):candidate |= region_weight(tri[:,j],region)>0
    for fi in np.flatnonzero(candidate):
        t=uv[fi]*8192-.5
        lo=np.maximum(np.floor(t.min(0)).astype(int),0)
        hi=np.minimum(np.ceil(t.max(0)).astype(int),8191)
        if np.prod(hi-lo+1)>20000:continue
        xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
        q=np.stack([xx.ravel(),yy.ravel()],1)
        a=t[1]-t[0];b=t[2]-t[0];den=a[0]*b[1]-a[1]*b[0]
        if abs(den)<1e-10:continue
        rel=q-t[0];b1=(rel[:,0]*b[1]-rel[:,1]*b[0])/den;b2=(a[0]*rel[:,1]-a[1]*rel[:,0])/den
        valid=(b1>=0)&(b2>=0)&(b1+b2<=1)
        q=q[valid];b1=b1[valid];b2=b2[valid]
        pts=tri[fi,0]+b1[:,None]*(tri[fi,1]-tri[fi,0])+b2[:,None]*(tri[fi,2]-tri[fi,0])
        weights=region_weight(pts,region)
        # Sample every texel, not one flat sample per triangle: no faceted patches.
        for qi,p,w in zip(q,pts,weights):
            if w<=0:continue
            dx=p[0] if ri==0 else -.098+(p[0]-(region[0]+region[1])/2)*.12
            dz=p[2]+.075 if ri==0 else .492+(p[2]-.492)*.35
            h,n,df,dist=bvh.ray_cast(Vector((dx,2,dz)),Vector((0,-1,0)))
            if h is None:continue
            v0=tri[df,1]-tri[df,0];v1=tri[df,2]-tri[df,0];v2=np.array(h)-tri[df,0]
            d00=v0@v0;d01=v0@v1;d11=v1@v1;dd=d00*d11-d01*d01
            if abs(dd)<1e-20:continue
            u=(d11*(v2@v0)-d01*(v2@v1))/dd;v=(d00*(v2@v1)-d01*(v2@v0))/dd
            st=uv[df,0]*(1-u-v)+uv[df,1]*u+uv[df,2]*v
            records.append((qi[0],qi[1],st[0],st[1],w))
records=np.asarray(records,np.float64)
for node in mat.node_tree.nodes:
    if node.type!='TEX_IMAGE' or not node.image:continue
    old=node.image;W,H=old.size
    pix=np.empty(W*H*4,np.float32);old.pixels.foreach_get(pix);pix=pix.reshape(H,W,4)
    tx=np.clip((records[:,0]*W/8192).astype(int),0,W-1);ty=np.clip((records[:,1]*H/8192).astype(int),0,H-1)
    dx=np.clip((records[:,2]*W).astype(int),0,W-1);dy=np.clip((records[:,3]*H).astype(int),0,H-1)
    colors=pix[dy,dx].copy();w=records[:,4,None].astype(np.float32)
    if 'normal' in old.name.lower():colors[:,:3]=[.5,.5,1]
    if '_rm' in old.name.lower():colors[:,1]=np.maximum(colors[:,1],.38)
    pix[ty,tx]=pix[ty,tx]*(1-w)+colors*w
    im=old.copy();im.name='V2.1 rear repair | '+old.name
    im.pixels.foreach_set(pix.ravel());im.update();im.pack();node.image=im
    del pix,colors;gc.collect()

# Non-destructive mask removes the fake glass disk and old memo frame only.
x,y,z=co.T;r=np.hypot(x-.035,z-.280)
fake_glass=(r<.1075)&(y<-.09)
memo=(x>-.058)&(x<.108)&(z>.193)&(z<.360)&(y>.329)&(y<.39)
vg=base.vertex_groups.new(name='V2.1 | replaced glass and memo surfaces')
vg.add(np.flatnonzero(fake_glass|memo).tolist(),1,'REPLACE')
md=base.modifiers.new('V2.1 | expose optical cavity and clean memo','MASK')
md.vertex_group=vg.name;md.invert_vertex_group=True

def material(name,color,rough=.4,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
ink=material('V2.1 | ivory pad print',(.72,.73,.69),.46)
dark=material('V2.1 | matte optical black',(.006,.007,.009),.39)
paint=material('V2.1 | memo satin enamel',(.026,.029,.030),.32,.25)
paper=material('V2.1 | warm memo paper',(.68,.64,.51),.88)

def mesh(name,verts,polys,mat,coll):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],polys);me.update()
    ob=bpy.data.objects.new(name,me);coll.objects.link(ob);me.materials.append(mat)
    return ob
def box(name,loc,dims,mat,bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object;ob.name=name;ob.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for c in list(ob.users_collection):c.objects.unlink(ob)
    details.objects.link(ob);ob.data.materials.append(mat)
    mod=ob.modifiers.new('Soft machined edge','BEVEL');mod.width=bevel;mod.segments=5
    ob.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
    return ob
def text(name,body,cx,depth,cz,width,height=None,mat=ink):
    cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.align_x='CENTER';cu.align_y='CENTER'
    cu.size=.02;cu.resolution_u=24;cu.render_resolution_u=32
    cu.extrude=.00007;cu.bevel_depth=.000025;cu.bevel_resolution=3
    ob=bpy.data.objects.new(name,cu);details.objects.link(ob)
    ob.location=(cx,depth,cz);ob.rotation_euler=(math.pi/2,0,math.pi)
    cu.materials.append(mat);bpy.context.view_layer.update()
    # Font dimensions can lag rotation evaluation: size in the local glyph plane.
    bounds=np.asarray(ob.bound_box)
    sx=width/max(float(np.ptp(bounds[:,0])),1e-9)
    sy=height/max(float(np.ptp(bounds[:,1])),1e-9) if height else sx
    ob.scale=(sx,sy,1)
    return ob
text('Rear maker | clean outline','MAMIYA CAMERA CO.,LTD.',.174,.2094,.635,.208,.013)
text('Rear maker | origin','MADE IN JAPAN',.174,.2093,.615,.120,.009)
text('Film back | MAMIYA','M A M I Y A',.071,.3168,.499,.129,.018)
text('Film back | caption','ROLL FILM ADAPTER',.071,.3208,.480,.125,.0058)
text('Film back | format','6×9',-.039,.3178,.492,.046,.020)
text('Film back | origin','MADE IN JAPAN',-.182,.3240,.485,.106,.008)
def fitted_depth(cx,cz,ri):
    return float(basis2(np.array([[cx,0,cz]]))[0]@fits[ri])
for ob in details.objects:
    if ob.type!='FONT':continue
    ri=0 if ob.name.startswith('Rear maker') else (2 if ob.name=='Film back | origin' else 1)
    cx,_,cz=ob.location;f=fits[ri]
    dx=f[1]+2*f[3]*cx+f[4]*cz;dz=f[2]+f[4]*cx+2*f[5]*cz
    right=Vector((-1,-dx,0)).normalized();normal=Vector((-dx,1,-dz)).normalized();up=normal.cross(right)
    ob.rotation_euler=Matrix((right,up,normal)).transposed().to_euler()
    ob.location.y=fitted_depth(cx,cz,ri)+.0011
# Rounded outline around the format badge, facing the rear camera.
cu=bpy.data.curves.new('6x9 fine border','CURVE');cu.dimensions='3D';cu.bevel_depth=.0011;cu.bevel_resolution=4
sp=cu.splines.new('POLY');pts=[]
for cx,cz,a0 in [(-.062,.480,math.pi),(-.016,.480,1.5*math.pi),(-.016,.504,0),(-.062,.504,.5*math.pi)]:
    for j in range(9):
        a=a0+j*math.pi/16;pts.append((cx+.003*math.cos(a),.323,cz+.003*math.sin(a),1))
sp.points.add(len(pts)-1)
for p,v in zip(sp.points,pts):
    p.co=(v[0],fitted_depth(v[0],v[2],1)+.0015,v[2],1)
sp.use_cyclic_u=True;ob=bpy.data.objects.new('Film back | rounded 6x9 border',cu);details.objects.link(ob);cu.materials.append(ink)
box('Memo | smooth frame',(.025,.335,.276),(.160,.025,.162),paint,.005)
box('Memo | paper insert',(.025,.349,.276),(.134,.002,.112),paper,.0013)
for zz in [.211,.341]:box('Memo | retaining lip',(.025,.351,zz),(.150,.008,.012),paint,.002)
text('Memo | title','MEMO CLIP',.025,.3507,.302,.113,.013, dark)
text('Memo | subtitle','for loaded film type',.025,.3507,.283,.111,.007,dark)
text('Memo | footer','INSERT FILM LABEL',.025,.3507,.244,.105,.0065,dark)
box('Memo | writing rule',(.025,.3505,.261),(.104,.0003,.0006),dark,.0001)

# Closed, smoothly curved refractive elements, with clean normals and air gaps.
def lathe(name,profile,mat,closed=True):
    N=192;verts=[];polys=[]
    for radius,depth in profile:
        for i in range(N):
            a=2*math.pi*i/N;verts.append((.035+radius*math.cos(a),depth,.280+radius*math.sin(a)))
    for j in range(len(profile) if closed else len(profile)-1):
        k=(j+1)%len(profile)
        for i in range(N):polys.append((j*N+i,j*N+(i+1)%N,k*N+(i+1)%N,k*N+i))
    ob=mesh(name,verts,polys,mat,optics)
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    zero=[f for f in bm.faces if f.calc_area()<1e-12]
    if zero:bmesh.ops.delete(bm,geom=zero,context='FACES_ONLY')
    wire=[e for e in bm.edges if e.is_wire]
    if wire:bmesh.ops.delete(bm,geom=wire,context='EDGES')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
    for p in ob.data.polygons:p.use_smooth=True
    return ob
elements=[]
for i,(radius,front,back,sag,ior,film) in enumerate([
    (.106,-.409,-.381,.015,1.52,390),
    (.098,-.362,-.344,.007,1.62,270),
    (.087,-.292,-.275,.006,1.52,470)]):
    m=material('Optics | coated element %d'%(i+1),(.985,.994,1),.009)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=1
    p.inputs['IOR'].default_value=ior;p.inputs['Thin Film Thickness'].default_value=film
    p.inputs['Thin Film IOR'].default_value=1.38
    # Different film thicknesses on the elements produce real angle-dependent interference.
    profile=[(radius*j/40,front+sag*(j/40)**2) for j in range(41)]
    profile += [(radius*j/40,back-.003*(j/40)**2) for j in range(40,-1,-1)]
    ob=lathe('Optics | glass element %d'%(i+1),profile,m)
    ob['ior']=ior;ob['film_thickness_nm']=film;ob['transmission']=1.0;elements.append(ob)
lathe('Optics | black internal tube',[(.106,-.391),(.108,-.391),(.108,-.12),(.077,-.12),(.077,-.27)],dark)
for i,(depth,radius) in enumerate([(-.383,.106),(-.344,.099),(-.278,.089),(-.245,.083)]):
    lathe('Optics | retaining ring %d'%i,[(radius,depth),(radius+.003,depth),(radius+.003,depth+.006),(radius,depth+.006)],paint)
blade_mat=material('Optics | graphite iris leaves',(.012,.014,.017),.31,.55)
for i in range(10):
    a=2*math.pi*i/10
    verts=[]
    for radius,angle in [(.036,a),(.036,a+2*math.pi/10),(.084,a+.91),(.092,a+.37)]:
        verts.append((.035+radius*math.cos(angle),-.317+i*.00004,.28+radius*math.sin(angle)))
    ob=mesh('Optics | aperture blade %02d'%i,verts,[(0,1,2,3)],blade_mat,optics)
    mod=ob.modifiers.new('Blade thickness','SOLIDIFY');mod.thickness=.00018

# A recessed light trap hides the source body's baked rear texture inside the iris.
lathe('Optics | recessed film chamber',[(0,-.112),(.079,-.112),(.079,-.108),(0,-.108)],dark)
for name,loc,power,size,size_y in [
    ('Optics softbox | tall highlight',(-.34,-1.25,.88),18,.15,.65),
    ('Optics softbox | small highlight',(.40,-1.10,.52),7,.11,.30)]:
    ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.shape='RECTANGLE';ld.size=size;ld.size_y=size_y
    ob=bpy.data.objects.new(name,ld);s.collection.objects.link(ob);ob.location=loc
    ob.rotation_euler=(Vector((.035,-.38,.28))-ob.location).to_track_quat('-Z','Y').to_euler()
    ob.light_linking.receiver_collection=optics

def camera(name,loc,target,scale):
    cu=bpy.data.cameras.new(name);cu.type='ORTHO';cu.ortho_scale=scale
    ob=bpy.data.objects.new(name,cu);s.collection.objects.link(ob);ob.location=loc
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    return ob
camera('V2.1 rear detail',(.66,2.8,.98),(.05,.26,.48),.84)
camera('V2.1 optical detail',(.13,-2.8,.64),(.035,-.35,.28),.48)
camera('V2.1 optical axial',(.035,-3,.28),(.035,-.35,.28),.40)
s.cycles.max_bounces=24;s.cycles.transmission_bounces=16;s.cycles.glossy_bounces=10
s.cycles.transparent_max_bounces=16;s.cycles.samples=96;s.cycles.use_denoising=True
s.render.resolution_x=s.render.resolution_y=1600;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.threads_mode='FIXED';s.render.threads=4
s.camera=bpy.data.objects['V2.1 optical detail']
s['revision']='V2.1: clean editable rear labels, smooth memo frame, three coated refractive elements and open iris.'
report={'input':str(SOURCE),'input_sha256':source_hash,'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'source_revision':'e5850e011207e86d4508b9986f17e725d091cb2a','repaired_texels':len(records),
        'masked_fake_glass_vertices':int(fake_glass.sum()),'masked_memo_vertices':int(memo.sum()),
        'glass_elements':[{'name':o.name,'ior':o['ior'],'film_nm':o['film_thickness_nm']} for o in elements],
        'output_dir':str(OUT),'render_samples':96,'transmission_bounces':16,
        'note':'Visual optical reconstruction; not a measured lens prescription. Thin-film interference is a Cycles effect.'}
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mamiya_universal_hybrid_v2_refined.blend'),compress=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
report['blend_sha256']=hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()
(OUT/'refinement-manifest.json').write_text(json.dumps(report,indent=2))
result=report
