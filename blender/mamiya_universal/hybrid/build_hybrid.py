"""Create the separate hybrid master from the preserved review import.

Run with Blender MCP CLI, opening tripo_source_review.blend first.
The GLB is read only. Source mesh/UVs stay intact; an object-level Mask hides
the replaced front regions. Donor geometry is copied before fitting.
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy, math, json, hashlib
import numpy as np
from mathutils import Vector, Matrix
from math import sin, cos, pi, sqrt

OUT=output_dir('blender/mamiya_universal/hybrid')
EXPECTED='a6edda4742e79317a226ee5466251469987fa9c8efeacc4271c5dfec08f644d0'
SOURCE=asset_path('blender/mamiya_universal/tripo/mamiya_universal_8k.glb')
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
original=bpy.context.scene; original.name='01 Tripo original | comparison'
src=bpy.data.objects['Tripo source | preserved import']
s=bpy.data.scenes.new('02 Hybrid | refined front')
bpy.context.window.scene=s
s.world=original.world
for o in original.objects:
    if o != src:s.collection.objects.link(o)
g=bpy.data.collections.new('01 Tripo body | masked replacement regions');s.collection.children.link(g)
precision=bpy.data.collections.new('02 Precision front | fitted donor parts');s.collection.children.link(precision)
construction=bpy.data.collections.new('03 Donor construction | hidden');s.collection.children.link(construction)
base=src.copy();base.name='Hybrid body | original UVs and textures';g.objects.link(base)
base['source_sha256']=EXPECTED
base['method']='Original mesh shared with comparison source; reversible Mask only.'
v=np.empty(len(base.data.vertices)*3,dtype=np.float32);base.data.vertices.foreach_get('co',v);v=v.reshape(-1,3)
x,y,z=v.T
bottom=np.maximum(.508, .285+np.sqrt(np.maximum(0,.235**2-(x-.035)**2)))
nameplate=(x>-.231)&(x<.295)&(y<-.045)&(y>-.077)&(z>bottom)&(z<.565)
front=y<-.383
indices=np.flatnonzero(nameplate|front).tolist()
vg=base.vertex_groups.new(name='Replaced front surfaces | reversible');vg.add(indices,1,'REPLACE')
mask=base.modifiers.new('Hide original hood, optics and badge face','MASK');mask.vertex_group=vg.name;mask.invert_vertex_group=True

def mat(n,c,metal=0,rough=.4):
    m=bpy.data.materials.new(n);m.use_nodes=True;m.diffuse_color=(*c,1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
black=mat('Hybrid | black anodized front',(.024,.025,.025),.65,.30)
plate=mat('Hybrid | satin ribbed nameplate',(.022,.023,.024),.5,.40)
ink=mat('Hybrid | warm engraved enamel',(.65,.63,.57),.05,.45)
silver=mat('Hybrid | shallow silver badges',(.62,.63,.61),.75,.32)
dark=mat('Hybrid | optical cavity',(.004,.005,.005),0,.70)
edge=mat('Hybrid | turned black edges',(.035,.036,.038),.75,.25)
glass=mat('Hybrid | coated optical glass',(.83,.89,.85),0,.065)
gp=glass.node_tree.nodes['Principled BSDF'];gp.inputs['Transmission Weight'].default_value=1;gp.inputs['IOR'].default_value=1.5

def finish(o,name,m):
    o.name=name;precision.objects.link(o);o.parent=None;o.hide_render=False;o.hide_set(False)
    o.data.materials.clear();o.data.materials.append(m)
    return o
def mesh(name,verts,faces,m,smooth=True):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);finish(o,name,m)
    for f in me.polygons:f.use_smooth=smooth
    return o
CX=.035;CZ=.280
def lathe(name,profile,m,N=256):
    verts=[(CX+r*sin(i*2*pi/N),h,CZ+r*cos(i*2*pi/N)) for r,h in profile for i in range(N)]
    faces=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(profile)-1) for i in range(N)]
    return mesh(name,verts,faces,m)
def ring(name,r,ri,y,depth,m):
    return lathe(name,[(ri,y+depth/2),(r,y+depth/2),(r,y-depth/2),(ri,y-depth/2),(ri,y+depth/2)],m)

# Replace the plate as a complete surface, including its clearance over the mount.
xs=np.linspace(-.230,.294,193)
lower=[max(.5075,.285+sqrt(max(0,.235**2-(float(x)-.035)**2))) for x in xs]
poly=[(float(x),-.057,float(z)) for x,z in zip(xs,lower)]+[(.294,-.057,.564),(-.230,-.057,.564)]
n=len(poly);verts=poly+[(x,-.048,z) for x,y,z in poly]
faces=[tuple(range(n)),tuple(range(n*2-1,n-1,-1))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
o=mesh('Nameplate | curved mount clearance',verts,faces,plate,False)
be=o.modifiers.new('Tiny rolled perimeter','BEVEL');be.width=.00055;be.segments=3
o.modifiers.new('Plate weighted normals','WEIGHTED_NORMAL')
cu=bpy.data.curves.new('Nameplate | fine horizontal ribs','CURVE');cu.dimensions='3D';cu.bevel_depth=.00018;cu.bevel_resolution=2
for h in np.arange(.509,.563,.0012):
    valid=[float(x) for x,z in zip(xs,lower) if h>=z+.0006]
    runs=[]
    for x in valid:
        if not runs or x-runs[-1][-1]>.004:runs.append([x])
        else:runs[-1].append(x)
    for run in runs:
        if len(run)<2:continue
        sp=cu.splines.new('POLY');sp.points.add(1);sp.points[0].co=(run[0],-.0571,float(h),1);sp.points[1].co=(run[-1],-.0571,float(h),1)
o=bpy.data.objects.new(cu.name,cu);finish(o,cu.name,plate)

# Reuse editable typography from the assembled Blender master.
with bpy.data.libraries.load(str(generated_path('blender/mamiya_universal/preserved_variants/codex-3296/mamiya_universal_refined.blend')),link=False) as (available,loaded):
    loaded.objects=[n for n in available.objects if n in ['UNIVERSAL badge','MAMIYA badge'] or n.startswith('D • Front engraving ')]
donor_labels=list(loaded.objects)
for donor in donor_labels:
    donor.data=donor.data.copy();donor.parent=None
    if donor.name in ['UNIVERSAL badge','MAMIYA badge']:
        is_universal=donor.data.body=='UNIVERSAL'
        finish(donor,'Badge | '+donor.data.body,silver)
        donor.rotation_euler=(pi/2,0,0);donor.scale=(1,1,1);donor.data.size=.02
        donor.data.resolution_u=16;donor.data.extrude=.00016;donor.data.bevel_depth=.000045;donor.data.bevel_resolution=2
        donor.data.align_x='CENTER';donor.data.align_y='CENTER'
        donor.location=(-.142 if is_universal else .207,-.0578,.5315)
        bpy.context.view_layer.update()
        target=.137 if is_universal else .150
        donor.scale.x=target/max(donor.dimensions.x,1e-6)
        donor['donor']='mamiya_universal_refined.blend / editable badge'
    else:
        old=donor.location.copy();a=math.atan2(old.x,old.z-.064);radius=.1425
        finish(donor,'Lens inscription | '+donor.name,ink)
        radial=Vector((sin(a),-.5,cos(a))).normalized();tangent=Vector((cos(a),0,-sin(a)));normal=tangent.cross(radial)
        donor.rotation_euler=Matrix((tangent,radial,normal)).transposed().to_euler()
        donor.location=(CX+radius*sin(a),-.409-(radius-.111)*.5-.00045,CZ+radius*cos(a))
        donor.scale=(4.15,4.15,4.15);donor.data.extrude=.0000015;donor.data.resolution_u=16
        donor['donor']='mamiya_universal_refined.blend / corrected f2.8 engraving'

# Evaluate the existing study's rounded hood slots, then fit independent copies.
with bpy.data.libraries.load(str(generated_path('blender/mamiya_universal/preserved_variants/codex-3296/component_studies/lens_study.blend')),link=False) as (available,loaded):
    loaded.objects=[n for n in available.objects if n in ['Vented tapered hood','Hood leading rolled rim','Front optical element'] or 'construction' in n.lower()]
study=list(loaded.objects)
for o in study:construction.objects.link(o);o.hide_render=True;o.hide_set(False)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
for name in ['Vented tapered hood','Hood leading rolled rim','Front optical element']:
    donor=next(o for o in study if o.name==name)
    me=bpy.data.meshes.new_from_object(donor.evaluated_get(deps),depsgraph=deps)
    o=bpy.data.objects.new('Fitted | '+name,me);finish(o,o.name,glass if name=='Front optical element' else black)
    if name=='Front optical element':
        for v in me.vertices:
            x,y,z=v.co;v.co=(CX+x*3.75,-.409-(z-.0958)*4.5,CZ+y*3.75)
    else:
        for v in me.vertices:
            x,y,z=v.co;v.co=(CX+x*4.35,-.487-(z-.113)*4.5,CZ+y*4.35)
    for p in me.polygons:p.use_smooth=True
    o['donor']='component_studies/lens_study.blend / '+name
for o in study:o.hide_set(True)
construction.hide_render=True;construction.hide_viewport=True

# Bridge the retained Tripo barrel to the fitted hood and replace the whole engraving face.
lathe('Hood | matched rear transition',[(.175,-.381),(.180,-.383),(.1832,-.4231),(.1740,-.4231),(.170,-.382),(.175,-.381)],black)
lathe('Lens | clean conical inscription seat',[(.108,-.407),(.111,-.409),(.174,-.4405),(.177,-.442),(.177,-.432),(.111,-.401),(.108,-.407)],black)
for r in [.1095,.112,.115]:ring('Lens | optical retaining groove',r,r-.0008,-.409-(r-.111)*.5,.00065,edge)
lathe('Lens | black internal tube',[(.109,-.407),(.110,-.407),(.110,-.339),(.108,-.339),(.109,-.407)],dark)
ring('Lens | recessed iris surround',.108,.043,-.365,.002,edge)
lathe('Lens | dark optical cavity backing',[(0,-.337),(.110,-.337),(.110,-.334),(0,-.334)],dark)
for k in range(10):
    a=k*2*pi/10;verts=[]
    for r,theta in [(.044,a),(.105,a+.25),(.105,a+.9),(.044,a+.64)]:verts.append((CX+r*sin(theta),-.366+k*.000012,CZ+r*cos(theta)))
    mesh('Lens | aperture blade %02d'%k,verts,[(0,1,2,3)],edge,False)

# Shared cameras/lights give a fair comparison; physical working scale is approximate.
for scene in [original,s]:
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=1400;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.camera=bpy.data.objects['02 Front three quarter']
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.24
    scene['scale_note']='Tripo normalized coordinates retained. 0.24 m/unit is a visual working scale, not measured CAD.'
s['status']='First hybrid front pass: donor badges, hood and optics; retained Tripo body/texture.'
s['source_sha256']=EXPECTED
s['remaining']='Barrel scales, finder glass, rear labels and other Tripo artifacts are retained for later passes.'
# Additional closeup camera includes plate and entire front assembly.
d=bpy.data.cameras.new('04 Front detail');d.type='ORTHO';d.ortho_scale=.78
c=bpy.data.objects.new(d.name,d);s.collection.objects.link(c);original.collection.objects.link(c)
c.location=(.30,-2.5,.85);c.rotation_euler=(Vector((.032,-.22,.40))-c.location).to_track_quat('-Z','Y').to_euler()
for sc in bpy.data.screens:
    for area in sc.areas:
        if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID'
bpy.context.window.scene=s
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mamiya_universal_hybrid.blend'),compress=True)
report={'source_sha256':EXPECTED,'source_unchanged':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED,
        'source_vertices':len(src.data.vertices),'masked_vertices':len(indices),'precision_objects':len(precision.objects),
        'donor_labels':len(donor_labels),'scenes':[original.name,s.name],
        'deliverable':'mamiya_universal_hybrid.blend','scope':s['status'],'remaining':s['remaining']}
(OUT/'hybrid_validation.json').write_text(json.dumps(report,indent=2))
s.render.resolution_x=1000;s.render.resolution_y=1000;s.cycles.samples=16
s.render.filepath=str(OUT/'hybrid_preview.png');bpy.ops.render.render(write_still=True)
result=report
