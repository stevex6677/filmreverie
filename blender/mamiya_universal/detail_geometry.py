"""Photo-backed geometry refinements, after detail_materials.py. Execute with Blender MCP."""
import bpy,bmesh,math,random
from math import sin,cos,pi
from mathutils import Vector
S=.001;OUT='/root/projects/film_photo/blender/mamiya_universal';scene=bpy.context.scene
root=next(o for o in scene.objects if o.type=='EMPTY' and o.name.startswith('MAMIYA'))
assert '07 Photo details' not in bpy.data.collections, 'Detail pass already applied'
group=bpy.data.collections.new('07 Photo details');scene.collection.children.link(group)
black=bpy.data.materials['Black anodized machined aluminum'];chrome=bpy.data.materials['Brushed chrome fittings'];ink=bpy.data.materials['Warm white engraved markings'];red=bpy.data.materials['Red index enamel'];rubber=bpy.data.materials['Rubber | hood and eyecup'];glass=bpy.data.materials['Coated optical glass | blue amber']
def finish(o,name,mat,bev=0):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    group.objects.link(o);o.parent=root
    if mat:o.data.materials.append(mat)
    if bev:
        m=o.modifiers.new('Precision edge radius','BEVEL');m.width=bev*S;m.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o
def mesh(name,verts,faces,mat,smooth=False):
    me=bpy.data.meshes.new(name);me.from_pydata([Vector(v)*S for v in verts],[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);group.objects.link(o);o.parent=root;me.materials.append(mat)
    for p in me.polygons:p.use_smooth=smooth
    return o
def box(name,loc,dim,mat,bev=.2):
    bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(loc)*S);o=bpy.context.object;o.dimensions=Vector(dim)*S
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,bev)
def cyl(name,loc,r,d,mat,axis='Y',verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r*S,depth=d*S,location=Vector(loc)*S,rotation={'Y':(pi/2,0,0),'Z':(0,0,0)}[axis])
    o=finish(bpy.context.object,name,mat,.12)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o
def curve(name,pts,r,mat,closed=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=r*S;c.bevel_resolution=3;c.use_fill_caps=True
    sp=c.splines.new('POLY');sp.points.add(len(pts)-1)
    for p,co in zip(sp.points,pts):p.co=(*[v*S for v in co],1)
    sp.use_cyclic_u=closed;o=bpy.data.objects.new(name,c);group.objects.link(o);o.parent=root;c.materials.append(mat);return o
def lathe(name,profile,mat,x=0,z=64,seg=192):
    v=[(x+r*cos(i*2*pi/seg),y,z+r*sin(i*2*pi/seg)) for r,y in profile for i in range(seg)]
    f=[(j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i) for j in range(len(profile)-1) for i in range(seg)]
    return mesh(name,v,f,mat,True)
def ring(name,y,r,ri,d,mat,x=0,z=64):return lathe(name,[(ri,y-d/2),(r,y-d/2),(r,y+d/2),(ri,y+d/2),(ri,y-d/2)],mat,x,z)
def text(name,body,loc,size,mat=ink,rot=(pi/2,0,0)):
    c=bpy.data.curves.new(name,'FONT');c.body=body;c.size=size*S;c.align_x='CENTER';c.align_y='CENTER';c.extrude=.004*S;c.resolution_u=4
    o=bpy.data.objects.new(name,c);group.objects.link(o);o.parent=root;o.location=Vector(loc)*S;o.rotation_euler=rot;c.materials.append(mat);return o
def hide_prefix(prefixes):
    for o in list(scene.objects):
        if o.name.startswith(tuple(prefixes)):o.hide_render=True;o.hide_set(True)

# Accurate f/2.8 front engraving, spaced around the front ring like IMG_1975.
hide_prefix(['Lens engraving ','DOF ','Focus distance ','Shutter speed ','Aperture 3.5','Aperture 4','Aperture 5.6','Aperture 8','Aperture 11','Aperture 16','Aperture 22','Aperture 32'])
def arc_text(body,r,y,center,size,step=None):
    step=step or size*.73/r
    for i,ch in enumerate(body):
        a=center+(i-(len(body)-1)/2)*step
        text('D • Front engraving '+ch,ch,(r*sin(a),y,64+r*cos(a)),size,ink,(pi/2,a,0))
arc_text('MAMIYA-SEKOR',33.5,-113.38,-1.05,2.9,.086)
arc_text('1:2.8  f=100mm',33.5,-113.38,.85,2.7,.078)
arc_text('No.126613',33.5,-113.38,pi,2.45,.078)
root['reference']='IMG_1964–1977; black Universal; Mamiya-Sekor 100mm f/2.8; 6x9 roll-film back'
def barrel_label(name,body,a,y,r,size=2):
    return text(name,body,(r*sin(a),y,64+r*cos(a)),size,ink,(0,a,0))
for i,val in enumerate(['32','22','16','11','8','5.6','4','4','5.6','8','11','16','22','32']):
    a=(i-6.5)*.11;barrel_label('D • Depth scale '+val,val,a,-41.6,44.2,1.9)
    length=1.6+abs(i-6.5)*.32
    curve('D • DOF bracket',[(44.25*sin(a),-43,64+44.25*cos(a)),(44.25*sin(a),-44.3,64+44.25*cos(a)),(44.25*sin(a*.55),-44.3,64+44.25*cos(a*.55)),(44.25*sin(a*.55),-45,64+44.25*cos(a*.55))],.055,ink)
for i,(m,ft) in enumerate([('1.2','4'),('1.5','5'),('2','7'),('3','10'),('5','15'),('10','30'),('∞','')]):
    a=(i-4.5)*.22;barrel_label('D • Distance metres',m,a,-47.3,43.25,2.05);barrel_label('D • Distance feet',ft,a,-49.2,43.25,1.6)
barrel_label('D • Distance unit','m',.49,-47.3,43.25,1.4)
barrel_label('D • Distance unit feet','ft',.49,-49.2,43.25,1.4)
for i,val in enumerate(['B','1','2','4','8','15','30','60','125','250','500']):
    a=(i-6)*.20;barrel_label('D • Speed '+val,val,a,-75.9,34.2,2.35)
for i,val in enumerate(['2.8','4','5.6','8','11','16','22','32']):
    a=(i-2)*.23;barrel_label('D • Aperture '+val,val,a,-85.5,32.2,2.15)
    curve('D • Aperture tick',[(32.25*sin(a),-83.8,64+32.25*cos(a)),(32.25*sin(a),-84.5,64+32.25*cos(a))],.07,ink)
mesh('D • Red triangle index',[(-1.5,-43.5,108.4),(1.5,-43.5,108.4),(0,-46,108.4)],[(0,1,2)],red)
for x,z in [(0,112),(32,100)]:cyl('D • Bayonet red index dot',(x,-32,z),.65,.22,red)

# Rear scalloped bayonet ring, absent from the first simplified model.
seg=320;v=[]
for y,inner in [(-34,True),(-34,False),(-40,False),(-40,True)]:
    for i in range(seg):
        a=2*pi*i/seg;r=40.9 if inner else 45.8-1.0*(.5+.5*cos(a*32))
        v.append((r*cos(a),y,64+r*sin(a)))
faces=[(j*seg+i,j*seg+(i+1)%seg,((j+1)%4)*seg+(i+1)%seg,((j+1)%4)*seg+i) for j in range(4) for i in range(seg)]
mesh('D • Scalloped bayonet locking ring',v,faces,black,True)
# Ribbed shutter grip and metal release face.
for i in range(12):
    x=-2.1+i*.38
    box('D • Selector knob knurl',(x,-83,100),( .13,.28,4.6),chrome,.04)
barrel_label('D • Flash sync X','X',-.67,-71,35,2.5)
cyl('D • Flash sync switch',(-20,-73,93),1.7,1.6,chrome)
curve('D • Shutter curved linkage',[(27,-80,88),(30,-79,83),(29,-79,71),(26,-78,59)],.65,chrome)

# Proper vented hood wall with rounded arc slots. Hide the earlier frame construction.
hide_prefix(['Hood rear collar','Hood leading rim','Hood vent bridge','Hood rear tapered wall','Hood front vent surround'])
hood=lathe('D • Vented metal hood',[(39.6,-112),(41,-112),(46,-123),(46,-126),(44.4,-126),(39.6,-113),(39.6,-112)],black)
# Boolean cutters stay editable and are hidden in a separate collection.
cutters=bpy.data.collections.new('Hood slot construction');group.children.link(cutters)
for k in range(4):
    center=k*pi/2+.22;pts=[]
    for i in range(41):
        a=center-.52+1.04*i/40;pts.append((44.0*cos(a),-120.2,64+44.0*sin(a)))
    c=curve('D • Hood slot cutter',pts,2.6,black)
    bpy.ops.object.select_all(action='DESELECT');c.select_set(True);bpy.context.view_layer.objects.active=c;bpy.ops.object.convert(target='MESH')
    c=bpy.context.object
    # Rounded endcaps of the cutting volume.
    for co in [pts[0],pts[-1]]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=2.6*S,location=Vector(co)*S)
        cap=bpy.context.object;finish(cap,'D • Slot end cutter',black)
        mod=hood.modifiers.new('Rounded vent end','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cap
        for col in list(cap.users_collection):col.objects.unlink(cap)
        cutters.objects.link(cap);cap.hide_render=True;cap.hide_set(True)
    mod=hood.modifiers.new('Open hood vent','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=c
    for col in list(c.users_collection):col.objects.unlink(c)
    cutters.objects.link(c);c.hide_render=True;c.hide_set(True)
be=hood.modifiers.new('Machined slot edges','BEVEL');be.width=.10*S;be.segments=2
for y,r in [(-113,39.5),(-113.5,39.6),(-114,39.8),(-124.7,45.7)]:ring('D • Hood machined thread',y,r,r-.17,.17,black)

# Deep optical stack instead of a single opaque-looking front disc.
hide_prefix(['Iris blade'])
for idx,(cy,r) in enumerate([(-105,24),(-99,20.3)]):
    profile=[(r*i/28,cy-1.3*(1-(i/28)**2)) for i in range(29)]+[(r,cy+.7),(0,cy+.7)]
    lathe('D • Internal optical element '+str(idx),profile,glass)
ring('D • Iris pupil surround',-97,24,17.8,.5,bpy.data.materials['Optical black'])
for i in range(8):
    a=i*pi/4;points=[(r*cos(t),-97.2,64+r*sin(t)) for r,t in [(17.8,a),(24,a+.1),(24,a+.9),(17.8,a+.76)]]
    mesh('D • Aperture blade',points,[(0,1,2,3)],black)

# Asymmetric flared eye shade and visible inner eyepiece, IMG_1977.
o=bpy.data.objects['Flared rubber eyecup']
for vv in o.data.vertices:
    x=(vv.co.x/S+39)/1.22;z=vv.co.z/S-155;a=math.atan2(z,x);r=math.hypot(x,z)
    f=max(0,min(1,(r-17)/13))
    wing=(max(0,cos(a))**8)*10+(max(0,-cos(a))**8)*7
    vv.co.x=(-39+x*1.10+cos(a)*wing*f)*S
    vv.co.z=(155+z+2.2*sin(3*a)*f)*S
    vv.co.y+=(.5*sin(a*2)*f)*S
ring('D • Eyecup outer rolled lip',55.5,28.6,27.9,1.0,rubber,-39,155)
ring('D • Eyepiece optical inner bezel',48.8,15.3,11.8,1.1,black,-39,155)
box('D • Eyepiece rectangular field',(-39,48.6,155),(17,.15,19),bpy.data.materials['Finder glass | smoked violet'],.7)

# Authentic photographed memo insert. UVs select only the paper, not the surrounding scene.
hide_prefix(['Memo title','Memo subtitle','Memo footer','Memo paper insert'])
im=bpy.data.images.load(OUT+'/reference_previews/IMG_1976.jpg',check_existing=True);im.pack();im.filepath='//reference_previews/IMG_1976.jpg'
mat=bpy.data.materials.new('Photographed aged memo label | IMG_1976');mat.use_nodes=True
n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.86
tex=n.new('ShaderNodeTexImage');tex.image=im;l.new(tex.outputs['Color'],p.inputs['Base Color'])
o=mesh('D • Original photographed memo paper',[(13,71.58,47),(-13,71.58,47),(-13,71.58,73),(13,71.58,73)],[(0,1,2,3)],mat)
uv=o.data.uv_layers.new(name='Memo photo crop')
corners=[(.253,1-.593),(.428,1-.618),(.421,1-.402),(.248,1-.422)]
for li in range(4):uv.data[li].uv=corners[o.data.loops[li].vertex_index]
# Small film-back release slider, frame and arrow in the reference.
box('D • Film back release recess',(-72,68.45,114),(17,1,3.2),bpy.data.materials['Optical black'],.3)
box('D • Film back release tab',(-72,69.2,114),(5,1.6,2.7),chrome,.5)
curve('D • Film advance arrow shaft',[(-80,68.6,120),(-87,68.6,120)],.14,ink)
mesh('D • Film advance arrowhead',[(-88,68.6,120),(-85,68.6,121),(-85,68.6,119)],[(0,1,2)],ink)
curve('D • 6x9 badge border',[(-54,68.35,114),(-55,68.35,115),(-55,68.35,121),(-54,68.35,122),(-40,68.35,122),(-39,68.35,121),(-39,68.35,115),(-40,68.35,114)],.16,ink,True)
for z in [125.5,126.5]:cyl('D • ASA dial edge rim',(88,49,z),9.2,.25,chrome,'Z')
# Strap edge stitching follows the existing ribbon geometry.
strap=bpy.data.objects['Continuous woven shoulder strap'];me=strap.data
thread=bpy.data.materials.new('Dark nylon stitch thread');thread.diffuse_color=(.045,.041,.034,1);thread.use_nodes=True
thread.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.035,.032,.027,1)
thread.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.7
for side in [0,1]:
    edgepts=[]
    for i in range(len(me.vertices)//2):
        a=me.vertices[2*i+side].co.copy();b=me.vertices[2*i+1-side].co.copy();a+=(b-a)*.08;a.z+=.00055;edgepts.append(a/S)
    curve('D • Woven strap selvedge',edgepts,.16,thread)
    for i in range(0,len(edgepts)-1,2):
        p0=edgepts[i];p1=p0+(edgepts[i+1]-p0)*.46
        curve('D • Strap edge stitch',[p0,p1],.065,thread)

# Deliberately sparse wear, localized to touched/machined edges, not sprayed everywhere.
random.seed(1977)
wear=bpy.data.materials.new('Subtle worn graphite edge');wear.use_nodes=True
pp=wear.node_tree.nodes.get('Principled BSDF');pp.inputs['Base Color'].default_value=(.11,.105,.09,1);pp.inputs['Metallic'].default_value=.8;pp.inputs['Roughness'].default_value=.42
for i in range(54):
    a=random.uniform(0,2*pi);r=random.choice([43.1,46.1,38.7]);y={43.1:-66.95,46.1:-125.98,38.7:-113.2}[r]
    span=random.uniform(.009,.034)
    pts=[(r*cos(a+t),y,64+r*sin(a+t)) for t in [0,span*.5,span]]
    curve('D • Lens rim use mark',pts,random.uniform(.015,.035),wear)
for i in range(16):
    x=random.choice([-1,1])*random.uniform(65,68);z=random.uniform(7,115)
    curve('D • Body edge wear',[(x,-27.12,z),(x+.2,-27.13,z+random.uniform(.4,1.7))],.025,wear)
for i in range(10):
    x=random.uniform(-97,-90);z=random.uniform(32,95)
    curve('D • Latch fine abrasion',[(x,74.35,z),(x+random.uniform(.2,.6),74.35,z+random.uniform(.3,1.2))],.018,wear)

# Reflection-friendly lighting with a grazing softbox to reveal the leather grain.
for name,power,size in [('Key softbox',6.5,.24),('Fill softbox',3.3,.24),('Top rim',6,.25),('Front strip',1.2,.09)]:
    o=bpy.data.objects[name];o.data.energy=power;o.data.size=size
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.20;scene.view_settings.exposure=.15
d=bpy.data.lights.new('Leather grazing strip','AREA');d.energy=3;d.shape='RECTANGLE';d.size=.045;d.size_y=.26
o=bpy.data.objects.new('Leather grazing strip',d);bpy.data.collections['06 Studio'].objects.link(o);o.location=(.25,-.17,.16);o.rotation_euler=(Vector((0,-.025,.085))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('CAM • Material and lens closeup');o=bpy.data.objects.new(d.name,d);bpy.data.collections['06 Studio'].objects.link(o)
o.location=(.20,-.36,.20);o.rotation_euler=(Vector((.003,-.046,.100))-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=.208;d.clip_start=.001
scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.cycles.max_bounces=12;scene.cycles.transmission_bounces=10
scene.render.threads_mode='AUTO'
scene.render.resolution_x=1600;scene.render.resolution_y=1600
scene.camera=bpy.data.objects['CAM • Material and lens closeup'];scene.render.filepath=OUT+'/mamiya_universal_detail.png'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/mamiya_universal.blend')
result={'detail_objects':len(group.all_objects),'total_objects':len(scene.objects),'correct_lens':'100 mm f/2.8','packed_reference_images':[im.name for im in bpy.data.images if im.packed_file]}
