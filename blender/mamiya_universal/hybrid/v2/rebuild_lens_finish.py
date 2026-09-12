"""Replace the noisy front lens assembly and revise optical presentation.

Run via Blender MCP with the approved-lettering refinement open. All earlier
objects remain recoverable; output goes into a fresh shared run directory.
"""
from pathlib import Path
import os, sys, math, json, hashlib
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

REPO=Path(__file__).resolve().parents[4]
os.chdir(REPO);sys.path.insert(0,str(REPO/'scripts'))
from shared_assets import output_dir, asset_path
SOURCE=Path(bpy.data.filepath)
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
OUT=output_dir('blender/mamiya_universal/hybrid/v2/lens_finish')
s=bpy.data.scenes['02 Hybrid v2 | Tripo lens'];bpy.context.window.scene=s
# Keep the shadow-catching floor out of specular rays: its infinite plane would
# otherwise create an artificial horizon bisecting the axial optical preview.
floor=bpy.data.objects.get('Studio floor')
if floor:
    floor.visible_glossy=False
    floor.visible_transmission=False
old=bpy.data.collections['05 V2.1 | real coated optics'];old.hide_render=True;old.hide_viewport=True
for ob in s.objects:
    if ob.name.startswith('Optics softbox |'):
        ob.hide_render=True;ob.hide_set(True)
coll=bpy.data.collections.new('06 V2.2 | smooth front assembly');s.collection.children.link(coll)
glasscoll=bpy.data.collections.new('07 V2.2 | clear optical assembly');s.collection.children.link(glasscoll)
studio=bpy.data.collections.new('08 V2.2 | feathered reflection studio');s.collection.children.link(studio)
base=bpy.data.objects['Camera v2 | repaired source mesh']
co=np.empty(len(base.data.vertices)*3,np.float32);base.data.vertices.foreach_get('co',co);co=co.reshape(-1,3)
r=np.hypot(co[:,0]-.035,co[:,2]-.28)
mask=(co[:,1]<-.075)&(r<.242)
# Keep the discrete mechanical levers/knobs outside the small shutter barrel.
controls=(co[:,1]>-.325)&(co[:,1]<-.246)&(r>.154)
mask &= ~controls
vg=base.vertex_groups.new(name='V2.2 replaced front shell');vg.add(np.flatnonzero(mask).tolist(),1,'REPLACE')
md=base.modifiers.new('V2.2 hide reconstructed front shell','MASK');md.vertex_group=vg.name;md.invert_vertex_group=True

def material(name,color,roughness,metallic=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metallic
    mat.diffuse_color=(*color,1);return mat
black=material('V2.2 | smooth black anodized aluminum',(.009,.011,.014),.23,.72)
bezelmat=material('V2.2 | satin inscription bezel',(.010,.012,.016),.27,.62)
edge=material('V2.2 | machined rim',(.014,.017,.022),.18,.8)
opticalblack=material('V2.2 | internal flocking',(.0025,.003,.004),.8)
iris_mat=material('V2.2 | recessed iris graphite',(.006,.007,.009),.34,.35)
scale_ink=material('V2.2 | ivory scale ink',(.62,.65,.65),.5)

def mesh(name,verts,faces,mat,collection=coll,smooth=True):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);collection.objects.link(ob);me.materials.append(mat)
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8)
    zero=[f for f in bm.faces if f.calc_area()<1e-13]
    if zero:bmesh.ops.delete(bm,geom=zero,context='FACES_ONLY')
    wire=[e for e in bm.edges if e.is_wire]
    if wire:bmesh.ops.delete(bm,geom=wire,context='EDGES')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    for p in me.polygons:p.use_smooth=smooth
    return ob
def lathe(name,profile,mat,collection=coll,N=512):
    verts=[];faces=[]
    for radius,depth in profile:
        for i in range(N):
            a=2*math.pi*i/N;verts.append((.035+radius*math.cos(a),depth,.28+radius*math.sin(a)))
    for j in range(len(profile)):
        k=(j+1)%len(profile)
        for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,k*N+(i+1)%N,k*N+i))
    return mesh(name,verts,faces,mat,collection)
def bevel(ob,width):
    mod=ob.modifiers.new('Continuous machined edge radius','BEVEL');mod.width=width;mod.segments=5
    mod.limit_method='ANGLE';mod.angle_limit=.25
    mod=ob.modifiers.new('Stable surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=50

# Smooth barrel shoulders and controlled, regular grip fluting.
barrel=lathe('V2.2 | smooth shutter and focus chassis',[
    (.134,-.326),(.134,-.306),(.146,-.303),(.146,-.275),(.151,-.272),
    (.151,-.248),(.197,-.245),(.198,-.237),(.198,-.176),
    (.190,-.172),(.190,-.133),(.201,-.127),(.202,-.109),
    (.224,-.104),(.225,-.078),(.214,-.074),(.105,-.074),(.105,-.326)],black)
bevel(barrel,.0007)
for i,(rr,yy,width) in enumerate([(.147,-.303,.0018),(.151,-.272,.0018),(.199,-.242,.002),(.199,-.175,.0018),(.191,-.161,.0012),(.192,-.133,.0018),(.203,-.111,.002)]):
    ob=lathe('V2.2 | clean barrel separation %d'%i,[(rr,yy),(rr+.001,yy),(rr+.001,yy+width),(rr,yy+width)],edge)
    bevel(ob,.0003)

def fluted_ring(name,rr,y0,y1,count,depth):
    N=count*8;verts=[]
    for yy in [y0,y0+.001,y1-.001,y1]:
        for i in range(N):
            a=2*math.pi*i/N
            # Shallow machined scallops; broad smooth lands between groove groups.
            groove=.5+.5*math.cos(count*a)
            radius=rr-depth*groove
            if yy in [y0,y1]:radius-=.0005
            verts.append((.035+radius*math.cos(a),yy,.28+radius*math.sin(a)))
    faces=[]
    for j in range(3):
        for i in range(N):faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    return mesh(name,verts,faces,black)
fluted_ring('V2.2 | precision focus grip',.200,-.235,-.179,180,.0012)
fluted_ring('V2.2 | fine shutter grip',.153,-.270,-.252,160,.0007)
fluted_ring('V2.2 | rear scalloped mount ring',.226,-.101,-.078,72,.002)

def barrel_scale(body,a,rr,yy,size):
    cu=bpy.data.curves.new('Scale '+body,'FONT');cu.body=body;cu.align_x='CENTER';cu.align_y='CENTER';cu.size=size;cu.resolution_u=16
    ob=bpy.data.objects.new('V2.2 | barrel scale '+body,cu);coll.objects.link(ob);cu.materials.append(scale_ink)
    ob.location=(.035+rr*math.cos(a),yy,.28+rr*math.sin(a))
    right=Vector((-math.sin(a),0,math.cos(a)));up=Vector((0,-1,0));normal=Vector((math.cos(a),0,math.sin(a)))
    ob.rotation_euler=Matrix((right,up,normal)).transposed().to_euler()
for items,yy,rr,size in [
    (['1','2','4','8','15','30','60','125','250','500'], -.286,.1464,.006),
    (['2.8','4','5.6','8','11','16','22','32'], -.316,.1344,.005),
    (['1','1.1','1.2','1.3','1.5','1.7','2','3','5','10','∞'], -.150,.1904,.006)]:
    for i,body in enumerate(items):barrel_scale(body,math.pi/2+(i-(len(items)-1)/2)*.205,rr,yy,size)

# A clean rotational housing follows the original measured working envelope.
housing=lathe('V2.2 | smooth stepped front housing',[
    (.136,-.320),(.141,-.329),(.143,-.340),(.176,-.375),
    (.179,-.382),(.179,-.429),(.176,-.438),(.166,-.443),
    (.108,-.409),(.106,-.405),(.107,-.387),(.122,-.347),(.130,-.320)],black)
bevel(housing,.0008)
# The lettering lies on a clean conical inner face, with no atlas or bump input.
bezel=lathe('V2.2 | smooth conical inscription ring',[
    (.112,-.414),(.119,-.419),(.163,-.445),(.169,-.447),
    (.171,-.443),(.162,-.439),(.119,-.413),(.112,-.409)],bezelmat)
bevel(bezel,.00055)
for i,(rr,yy) in enumerate([(.108,-.408),(.112,-.413),(.116,-.418),(.167,-.448)]):
    profile=[(rr+.00055*math.cos(a),yy+.00055*math.sin(a)) for a in np.linspace(0,2*math.pi,16,endpoint=False)]
    lathe('V2.2 | fine circular retainer %d'%i,profile,edge)

# Vented hood: exact cutouts with rounded ends, then a small edge bevel.
hood=lathe('V2.2 | smooth vented hood',[
    (.172,-.432),(.179,-.432),(.207,-.464),(.211,-.478),
    (.210,-.481),(.206,-.481),(.204,-.475),(.200,-.463),(.174,-.438)],black)
for k in range(4):
    center=k*math.pi/2+.12;half=.52;cap=.032;yc=-.467;hh=.0064
    outline=[]
    for j in range(25):
        a=-math.pi/2+j*math.pi/24
        outline.append((center+half+cap*math.cos(a),yc+hh*math.sin(a)))
    for j in range(25):
        a=math.pi/2+j*math.pi/24
        outline.append((center-half+cap*math.cos(a),yc+hh*math.sin(a)))
    verts=[]
    for rr in [.14,.30]:
        for a,yy in outline:verts.append((.035+rr*math.cos(a),yy,.28+rr*math.sin(a)))
    n=len(outline);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    cutter=mesh('V2.2 | hood vent construction %d'%k,verts,faces,black,smooth=False)
    mod=hood.modifiers.new('Rounded vent %d'%k,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    cutter.hide_render=True;cutter.hide_set(True)
bevel(hood,.00065)
lathe('V2.2 | rolled hood leading edge',[(.208+.0013*math.cos(a),-.480+.0013*math.sin(a)) for a in np.linspace(0,2*math.pi,20,endpoint=False)],edge)

# Re-project already-clean front glyphs, keeping the approved rear lettering intact.
bpy.context.view_layer.update()
from mathutils.bvhtree import BVHTree
bvh=BVHTree.FromObject(bezel,bpy.context.evaluated_depsgraph_get())
letters=[]
for ob in list(s.objects):
    if not ob.name.startswith('Clean lens text |'):continue
    ob.data=ob.data.copy()
    for v in ob.data.vertices:
        pt=ob.matrix_world@v.co
        h,n,fi,d=bvh.ray_cast(Vector((pt.x,-2,pt.z)),Vector((0,1,0)))
        if h is not None:pt.y=h.y-.00025
        v.co=ob.matrix_world.inverted()@pt
    letters.append(ob.name)

# New optics: broad clear entrance pupil, separated menisci and deep barrel.
elements=[]
settings=[(.106,-.411,-.393,.010,.006,1.52,135),
          (.100,-.369,-.356,.005,.009,1.60,230),
          (.091,-.257,-.244,.006,.004,1.52,330)]
for i,(radius,front,back,sag1,sag2,ior,film) in enumerate(settings):
    mat=material('V2.2 | clear coated glass %d'%(i+1),(1,1,1),.006)
    p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=1
    p.inputs['IOR'].default_value=ior;p.inputs['Thin Film Thickness'].default_value=film;p.inputs['Thin Film IOR'].default_value=1.38
    profile=[(radius*j/48,front+sag1*(j/48)**2) for j in range(49)]
    profile += [(radius*j/48,back+sag2*(j/48)**2) for j in range(48,-1,-1)]
    ob=lathe('V2.2 | clear lens group %d'%(i+1),profile,mat,glasscoll,N=384)
    elements.append(ob)
lathe('V2.2 | recessed optical barrel',[(.107,-.403),(.110,-.403),(.110,-.118),(.058,-.118),(.065,-.19),(.084,-.26),(.098,-.36)],opticalblack,glasscoll)
for i,(rr,yy) in enumerate([(.107,-.402),(.102,-.363),(.094,-.269),(.080,-.205),(.067,-.160)]):
    ob=lathe('V2.2 | internal seating ring %d'%i,[(rr,yy),(rr+.002,yy),(rr+.002,yy+.005),(rr,yy+.005)],black,glasscoll)
    bevel(ob,.00035)
# The entrance pupil is nearly open, so metal leaves do not fill the glass face.
iris_inner=.079
for k in range(12):
    a=2*math.pi*k/12;verts=[]
    for j in range(13):
        aa=a+j*2*math.pi/12/12;verts.append((.035+iris_inner*math.cos(aa),-.290+k*.000008,.28+iris_inner*math.sin(aa)))
    for j in range(12,-1,-1):
        aa=a+j*2*math.pi/12/12+.09;verts.append((.035+.099*math.cos(aa),-.290+k*.000008,.28+.099*math.sin(aa)))
    ob=mesh('V2.2 | wide open iris leaf %02d'%k,verts,[tuple(range(len(verts)))],iris_mat,glasscoll,smooth=False)
    mod=ob.modifiers.new('Thin aperture blade','SOLIDIFY');mod.thickness=.00008
lathe('V2.2 | deep closed film chamber',[(0,-.119),(.061,-.119),(.061,-.115),(0,-.115)],opticalblack,glasscoll)

# Soft reflection cards have a continuous radial falloff, not hard rectangular edges.
# They represent diffusers; the lens remains physically transmissive and non-emissive.
def reflection_card(name,loc,radius,strength,stretch):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
    tex=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');l.new(tex.outputs['UV'],sep.inputs[0])
    xx=n.new('ShaderNodeMath');xx.operation='SUBTRACT';xx.inputs[1].default_value=.5;l.new(sep.outputs['X'],xx.inputs[0])
    yy=n.new('ShaderNodeMath');yy.operation='SUBTRACT';yy.inputs[1].default_value=.5;l.new(sep.outputs['Y'],yy.inputs[0])
    xs=n.new('ShaderNodeMath');xs.operation='MULTIPLY';l.new(xx.outputs[0],xs.inputs[0]);l.new(xx.outputs[0],xs.inputs[1])
    ys=n.new('ShaderNodeMath');ys.operation='MULTIPLY';l.new(yy.outputs[0],ys.inputs[0]);l.new(yy.outputs[0],ys.inputs[1])
    add=n.new('ShaderNodeMath');add.operation='ADD';l.new(xs.outputs[0],add.inputs[0]);l.new(ys.outputs[0],add.inputs[1])
    ramp=n.new('ShaderNodeMapRange');ramp.interpolation_type='SMOOTHERSTEP';ramp.inputs['From Min'].default_value=.01;ramp.inputs['From Max'].default_value=.23
    ramp.inputs['To Min'].default_value=1;ramp.inputs['To Max'].default_value=0;l.new(add.outputs[0],ramp.inputs[0])
    em=n.new('ShaderNodeEmission');em.inputs['Color'].default_value=(1,1,1,1);em.inputs['Strength'].default_value=strength
    tr=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');l.new(ramp.outputs[0],mix.inputs[0]);l.new(tr.outputs[0],mix.inputs[1]);l.new(em.outputs[0],mix.inputs[2])
    out=n.new('ShaderNodeOutputMaterial');l.new(mix.outputs[0],out.inputs[0])
    ob=mesh(name,[(-radius*stretch,-radius,0),(radius*stretch,-radius,0),(radius*stretch,radius,0),(-radius*stretch,radius,0)],[(0,1,2,3)],mat,studio,smooth=False)
    uv=ob.data.uv_layers.new(name='Diffuser UV')
    for i,coord in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=coord
    ob.location=loc;ob.rotation_euler=(Vector((.035,-.395,.28))-ob.location).to_track_quat('Z','Y').to_euler()
    ob.visible_camera=False;ob.visible_shadow=False;ob.visible_diffuse=False;ob.visible_transmission=False
    return ob
reflection_card('V2.2 | broad feathered key',(-.29,-1.15,.76),.58,1.1,1.2)
reflection_card('V2.2 | subtle lower bounce',(.10,-1.2,.18),.65,1.2,1.5)
reflection_card('V2.2 | soft vertical glazing reflection',(-.10,-1.0,.50),.32,8.0,.30)

s.camera=bpy.data.objects['V2.1 optical detail']
s.cycles.samples=64;s.cycles.max_bounces=24;s.cycles.transmission_bounces=16;s.cycles.glossy_bounces=10
s.render.resolution_x=s.render.resolution_y=1400;s.render.resolution_percentage=100
s.render.threads_mode='FIXED';s.render.threads=4
s['revision']='V2.2: smooth machined front assembly; wide pupil; clear meniscus groups; feathered studio reflections.'
bpy.context.view_layer.update()
# Geometry checks inspect actual glass topology and confirm there is no bump shader.
checks=[]
for ob in elements:
    bm=bmesh.new();bm.from_mesh(ob.data);bad=sum(not e.is_manifold for e in bm.edges);vol=bm.calc_volume(signed=True);bm.free()
    assert bad==0 and vol>0,(ob.name,bad,vol)
    checks.append({'name':ob.name,'nonmanifold_edges':bad,'volume':vol})
assert all(not any(n.type in {'BUMP','NORMAL_MAP','TEX_IMAGE'} for n in mat.node_tree.nodes) for mat in [black,bezelmat,edge])
report={'input':str(SOURCE),'source_sha256':source_hash,'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'masked_original_front_vertices':int(mask.sum()),'glass_checks':checks,'iris_radius':iris_inner,
        'rear_lettering_preserved':True,'hard_rectangular_optics_lights_disabled':True,
        'new_front_materials_have_no_bump_or_texture':True,'output_dir':str(OUT),
        'references':['IMG_1978.jpg','IMG_1980.jpg','IMG_1982.jpg'],
        'note':'Visual optical reconstruction, not the measured optical prescription.'}
target=OUT/'mamiya_universal_hybrid_v2_lens_finish.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
report['blend_sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
(OUT/'lens-finish-manifest.json').write_text(json.dumps(report,indent=2))
result=report
