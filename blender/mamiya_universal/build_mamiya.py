"""Photo-referenced Mamiya Universal; execute using Blender MCP. Dimensions in mm."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy, math, os
from mathutils import Vector
from math import sin, cos, pi

OUT = str(output_dir('blender/mamiya_universal'))
S = .001
scene = bpy.data.scenes.new('Mamiya Universal | Studio')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'MILLIMETERS'
groups = {}
for name in ['01 Body', '02 Rangefinder', '03 Sekor 100mm', '04 Roll Film Back', '05 Strap', '06 Studio']:
    c=bpy.data.collections.new(name); scene.collection.children.link(c); groups[name]=c
group=groups['01 Body']
root=bpy.data.objects.new('MAMIYA UNIVERSAL • photo reference model',None)
group.objects.link(root)
root['reference']='IMG_1964–IMG_1970; black Universal, 100 mm lens, 6x9 roll film back'
root['dimensions']='Photo-estimated proportions; not engineering measurements'

def mat(name,col,metal=0,rough=.35):
    m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*col,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
black=mat('Black enamel | satin edge highlights',(.016,.019,.023),.65,.28)
edge=mat('Black anodized machined aluminum',(.008,.011,.014),.8,.25)
rubber=mat('Rubber | hood and eyecup',(.012,.013,.015),.05,.48)
silver=mat('Brushed chrome fittings',(.48,.51,.53),.9,.25)
ink=mat('Warm white engraved markings',(.77,.76,.66),.2,.43)
red=mat('Red index enamel',(.6,.012,.008),.15,.3)
paper=mat('Aged memo paper',(.63,.56,.4),0,.82)
dark=mat('Optical black',(.002,.003,.004),.2,.42)
leather=mat('Pebbled black leatherette',(.021,.022,.024),.05,.57)
n=leather.node_tree.nodes; l=leather.node_tree.links; p=n.get('Principled BSDF')
tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=1700; tex.inputs['Detail'].default_value=3
coord=n.new('ShaderNodeTexCoord'); l.new(coord.outputs['Object'],tex.inputs['Vector'])
bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.55; bump.inputs['Distance'].default_value=.00038
l.new(tex.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs['Normal'],p.inputs['Normal'])
glass=mat('Coated optical glass | blue amber',(.07,.115,.13),.15,.075)
gp=glass.node_tree.nodes.get('Principled BSDF'); gp.inputs['Transmission Weight'].default_value=.85; gp.inputs['IOR'].default_value=1.52
finder=mat('Finder glass | smoked violet',(.037,.043,.072),.48,.12)
diffuser=mat('Rangefinder frosted illumination panel',(.38,.42,.39),.08,.4)
nylon=mat('Woven black nylon',(.017,.018,.021),0,.68)
n=nylon.node_tree.nodes; l=nylon.node_tree.links
t=n.new('ShaderNodeTexNoise'); t.inputs['Scale'].default_value=2200
b=n.new('ShaderNodeBump'); b.inputs['Strength'].default_value=.55; b.inputs['Distance'].default_value=.00025
l.new(t.outputs['Fac'],b.inputs['Height']); l.new(b.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])

def finish(o,name,material,bev=0):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    group.objects.link(o)
    if group!=groups['06 Studio']: o.parent=root
    if material:o.data.materials.append(material)
    if bev:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL'); mod.width=bev*S; mod.segments=3
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o
def box(name,loc,dim,material=black,bev=.6):
    bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(loc)*S); o=bpy.context.object
    o.dimensions=Vector(dim)*S; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,material,bev)
def cyl(name,loc,r,d,material=black,axis='Y',bev=.25,verts=96):
    rot={'Y':(pi/2,0,0),'Z':(0,0,0),'X':(0,pi/2,0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r*S,depth=d*S,location=Vector(loc)*S,rotation=rot)
    o=finish(bpy.context.object,name,material,bev)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o
def mesh(name,verts,faces,material):
    m=bpy.data.meshes.new(name); m.from_pydata([Vector(v)*S for v in verts],[],faces); m.update()
    o=bpy.data.objects.new(name,m); group.objects.link(o); o.parent=root; m.materials.append(material); return o
def lathe(name,profile,material=edge,x=0,z=64,segments=128):
    v=[(x+r*cos(2*pi*i/segments),y,z+r*sin(2*pi*i/segments)) for r,y in profile for i in range(segments)]
    f=[]
    for j in range(len(profile)-1):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments
            f.append((a,b,b+segments,a+segments))
    o=mesh(name,v,f,material)
    for p in o.data.polygons:p.use_smooth=True
    return o
def ring(name,y,r,inner,d,material=edge,x=0,z=64):
    return lathe(name,[(inner,y-d/2),(r,y-d/2),(r,y+d/2),(inner,y+d/2),(inner,y-d/2)],material,x,z)
def text(name,body,loc,size,material=ink,rotation=(pi/2,0,0),align='CENTER'):
    c=bpy.data.curves.new(name,'FONT'); c.body=body;c.size=size*S;c.align_x=align;c.align_y='CENTER';c.extrude=.015*S;c.resolution_u=3
    o=bpy.data.objects.new(name,c);group.objects.link(o);o.parent=root;o.location=Vector(loc)*S;o.rotation_euler=rotation;c.materials.append(material);return o
def line(name,pts,r,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r*S;c.bevel_resolution=3
    sp=c.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for p,co in zip(sp.bezier_points,pts):p.co=Vector(co)*S;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);group.objects.link(o);o.parent=root;c.materials.append(material);return o
def screw(name,x,y,z,back=False):
    cyl(name,(x,y,z),1.25,.6,silver if back else edge)
    box(name+' slot',(x,y+(.35 if back else -.35),z),(1.65,.12,.27),dark,.05)

# Body shell, layered seams and leather panels.
box('Die-cast central chassis',(0,0,67),(142,49,134),black,3)
box('Front perimeter bright edge',(0,-25,70),(142,2,138),edge,2.5)
box('Front leatherette panel',(0,-26.3,65),(133,1.4,125),leather,1.6)
box('Base casting',(0,0,4),(145,53,8),black,2)
for x in [-72,72]:
    box('Side leatherette',(x,1,69),(1,42,111),leather,1)
    box('Back retaining rail',(x,24,59),(3,8,104),edge,.7)
    box('Bottom back lock',(x*.77,29,9),(12,14,7),black,1)
for x in [-62,62]:
    for z in [10,111]:screw('Chassis screw',x,-27.1,z)
cyl('Tripod socket metal insert',(0,2,0),7,1.2,silver,'Z')
cyl('Tripod socket bore',(0,2,-.7),3.2,.3,dark,'Z')
cyl('Side accessory socket',(76,0,55),11,10,edge,'X')
cyl('Side socket center',(81.2,0,55),7.7,.4,dark,'X')
for x in [77,78,79,80]:cyl('Socket screw thread',(x,0,55),11.25,.35,black,'X',.05)

group=groups['02 Rangefinder']
box('Rangefinder top housing',(0,1,153),(144,51,66),black,3)
box('Front bezel edge',(0,-25.4,153),(141,2,63),edge,2)
box('Finder face plate',(0,-26.6,153),(136,1.3,58),black,1)
for name,x,z,w,h,material in [('Main finder',-44,158,39,36,finder),('Illumination window',10,158,43,36,diffuser),('Rangefinder patch',55,156,12,13,finder)]:
    box(name+' recess',(x,-27.5,z),(w+2.8,1.8,h+2.8),dark,.35)
    box(name+' glass',(x,-28.5,z),(w,.5,h),material,.2)
    if name=='Main finder':
        box('Internal finder prism',(-47,-28.8,147),(27,.2,3),edge,.1)
        box('Finder reflected highlight',(-40,-28.85,169),(13,.1,2),diffuser,.1)
box('Brand engraved strip',(0,-27.6,123),(133,1,12),edge,.2)
text('UNIVERSAL badge','UNIVERSAL',(-46,-28.3,123),4.2)
text('MAMIYA badge','M A M I Y A',(43,-28.3,123),4.1)
for x in [-65,65]:
    for z in [129,179]:screw('Finder face screw',x,-28,z)
box('Cold shoe foot',(0,4,187),(26,24,1.7),edge,.4)
for x in [-11,11]:
    box('Cold shoe rail',(x,4,190),(3,24,4),black,.35)
    box('Cold shoe lip',(x*.86,4,192),(5,24,1),edge,.25)
text('Shoe serial','A87282',(0,6,188.05),2.2,ink,(0,0,0))
box('Rear finder service plate',(0,27.2,153),(137,2,61),black,1.5)
text('Rear maker','MAMIYA CAMERA CO.,LTD.',(24,28.5,142),3,ink,(pi/2,0,pi))
text('Rear country','MADE IN JAPAN',(24,28.5,137),2.4,ink,(pi/2,0,pi))
box('Finder selector slot',(20,28.5,176),(20,1,3),dark,1)
cyl('Finder selector knob',(11,30,176),3,3,silver)
text('Finder focal length','100',(46,28.5,175),2.8,ink,(pi/2,0,pi))
box('Eyepiece mounting block',(-39,32,154),(48,9,51),edge,3)
ring('Eyepiece barrel',42,22,14,12,edge,-39,155)
ring('Eyepiece lip',49,25,16,3,rubber,-39,155)
cyl('Rear finder optical glass',(-39,48,155),14,.9,finder)
# Flared oval rubber eye shade.
o=lathe('Flared rubber eyecup',[(17,48),(21,52),(28,56),(30,56),(29,53),(24,48),(17,48)],rubber,-39,155)
for v in o.data.vertices:
    v.co.x=(-39*S)+(v.co.x+39*S)*1.22

group=groups['03 Sekor 100mm']
ring('Lens bayonet flange',-29,49,34,4,edge)
ring('Bayonet polished rim',-31.5,48.7,46.8,1,silver)
ring('Lens mount collar',-36,45,33,8,black)
ring('Depth of field scale ring',-42,44,32,5,edge)
ring('Focus helicoid',-54,42.5,29,20,black)
ring('Distance scale band',-47,43,31,5,edge)
# Distinct blocks of very fine milled grip ribs.
for i in range(160):
    a=2*pi*i/160
    if i%20<14:
        o=box('Focus knurl %03d'%i,(42.8*sin(a),-57,64+42.8*cos(a)),(.72,17,1.1),edge,.15);o.rotation_euler[1]=a
ring('Focus front rim',-66,43,28,2,edge)
ring('Shutter housing',-72,34,24,11,black)
ring('Shutter speed ring',-78,33.5,24,4,edge)
for i in range(120):
    a=i*2*pi/120
    o=box('Shutter ring knurl',(33.55*sin(a),-78,64+33.55*cos(a)),(.42,3.8,.5),edge,.08);o.rotation_euler[1]=a
ring('Aperture barrel',-86,31.8,24,11,black)
lathe('Lens flared front barrel',[(25,-89),(31.5,-89),(39.5,-100),(39.5,-110),(36,-112),(28,-109),(25,-89)],edge)
ring('Front lettering bezel',-112,38.5,28.8,2.2,black)
for y,r in [(-109,28.7),(-110,29),(-111,29.4),(-113,37.5)]:ring('Concentric filter thread',y,r,r-.35,.4,edge)
# True concave seating and curved glass surface with dark internal aperture.
cyl('Optical cavity',(0,-95,64),26,1,dark)
ring('Inner optical tube',-102,28,24,13,edge)
for i in range(8):
    a=i*2*pi/8; pts=[]
    for rr,aa in [(9,a),(24,a+.22),(24,a+.92),(9,a+.85)]:pts.append((rr*cos(aa),-99,64+rr*sin(aa)))
    mesh('Iris blade',pts,[(0,1,2,3)],black)
profile=[]
for i in range(25):
    r=27.7*i/24;profile.append((r,-113+3.8*(r/27.7)**2))
profile.extend([(27.7,-107),(0,-107)])
lathe('Convex front glass',profile,glass)
# Vented hood: solid front rim and four actual open windows between struts.
ring('Hood rear collar',-113,41,38.8,2,edge)
ring('Hood leading rim',-125,46,43.8,3,black)
for i in range(4):
    a=i*pi/2+.3;v=[]
    for y,r in [(-114,40.6),(-124,45.3)]:
        for da in [-.14,.14]:
            for d in [-.8,.8]:v.append(((r+d)*cos(a+da),y,64+(r+d)*sin(a+da)))
    mesh('Hood vent bridge',v,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],black)

def arc_text(body,r,y,center,size):
    step=size*.67/r
    for i,ch in enumerate(body):
        a=center+(i-(len(body)-1)/2)*step
        text('Lens engraving '+ch,ch,(r*sin(a),y,64+r*cos(a)),size,ink,(pi/2,a,0))
arc_text('MAMIYA-SEKOR  1:3.5  f=100mm',33.7,-113.3,0,2.2)
arc_text('No.126613',33.7,-113.3,pi,2.2)
for i,val in enumerate(['32','22','16','11','8','5.6','4','3.5','4','5.6','8','11','16','22','32']):
    a=(i-7)*.105
    o=text('DOF '+val,val,(44.2*sin(a),-42,64+44.2*cos(a)),1.8,ink,(a,0,0))
    line('DOF tick',[(44.4*sin(a),-43.7,64+44.4*cos(a)),(44.4*sin(a),-44.7,64+44.4*cos(a))],.09,ink)
for i,val in enumerate(['1.5','2','3','5','10','∞']):
    a=(i-2.5)*.25;text('Focus distance '+val,val,(43.1*sin(a),-49,64+43.1*cos(a)),2.2,ink,(a,0,0))
line('Red focus index',[(0,-39.5,109),(0,-45,109)],.4,red)
for i,val in enumerate(['B','1','2','4','8','15','30','60','125','250','500']):
    a=(i-5)*.18;text('Shutter speed '+val,val,(34*sin(a),-76.7,64+34*cos(a)),1.7,ink,(a,0,0))
for i,val in enumerate(['3.5','4','5.6','8','11','16','22','32']):
    a=(i-3.5)*.22;text('Aperture '+val,val,(32*sin(a),-87,64+32*cos(a)),1.6,ink,(a,0,0))
text('Seiko shutter label','SEIKO',(22,-83,84),2.2,ink,(pi/2,0,0))
for name,x,z,a in [('Shutter cocking lever',28,87,-.4),('Aperture lever',-21,40,.5)]:
    o=box(name,(x,-79,z),(3,7,17),silver,.6);o.rotation_euler[1]=a
    cyl(name+' pivot',(x,-76,z+5),2.5,2,edge)
cyl('Cable release socket',(-27,-80,80),3.4,5,silver)
cyl('Cable release hole',(-27,-82.7,80),1.7,.3,dark)
cyl('Shutter selector pin',(0,-79,100),2.6,7,silver)

group=groups['04 Roll Film Back']
box('Film back adapter',(0,30,61),(143,12,115),edge,2)
box('Film back center shell',(0,48,64),(174,36,100),black,6)
box('Rear leatherette cover',(0,67,63),(177,2,89),leather,2.5)
for x in [-88,88]:
    cyl('Film chamber',(x,49,64),25,101,black,'Z',1)
    cyl('Film chamber leather wrap',(x,49,61),25.4,86,leather,'Z',.7)
    for z in [16,108]:cyl('Back perimeter trim',(x,49,z),25.8,2,edge,'Z',.5)
    cyl('Spool chamber top cap',(x,49,116),25.5,14,black,'Z',1.8)
    cyl('Spool top knob',(x,49,125),10,4,edge,'Z',.7)
    for z in [16,108]:box('Back edge trim',(0,67,z),(178,3,2),edge,.6)
box('Film back upper bridge',(0,48,116),(178,39,14),black,2)
text('Roll film Mamiya logo','M A M I Y A',(-7,68.1,118),4.2,ink,(pi/2,0,pi))
text('Roll film 6x9','6×9',(-47,68.1,118),4.8,ink,(pi/2,0,pi))
text('Roll film adapter caption','R O L L   F I L M   A D A P T E R',(-8,68.1,112.8),1.4,ink,(pi/2,0,pi))
text('Back made in Japan','MADE IN JAPAN',(43,68.1,117),2.3,ink,(pi/2,0,pi))
box('Memo clip frame',(0,69.3,60),(31,3,32),edge,1)
box('Memo paper insert',(0,71,60),(26,1,25),paper,.4)
text('Memo title','MEMO CLIP',(0,71.6,66),3,dark,(pi/2,0,pi))
text('Memo subtitle','for loaded film type',(0,71.6,61),1.8,dark,(pi/2,0,pi))
text('Memo footer','INSERT FILM LABEL',(0,71.6,52),1.5,dark,(pi/2,0,pi))
for z in [45,75]:box('Memo clip lip',(0,72,z),(30,2,3),black,.7)
box('Chrome back latch',(-94,73,63),(12,2.5,71),silver,1)
line('Folding latch bail',[(-95,75,38),(-103,79,42),(-103,79,81),(-95,75,87)],1.3,silver)
for z in [34,92]:screw('Latch screw',-94,74.5,z,True)
box('Film advance lever',(68,53,127),(35,10,3),edge,1)
box('Film advance thumb pad',(53,53,129),(15,12,4),black,2)
cyl('ASA speed dial',(88,49,128),9,2,silver,'Z',.25)
cyl('ASA dial insert',(88,49,129.2),7.8,.5,edge,'Z')
for i,val in enumerate(['25','50','100','200','400','800']):
    a=i*pi/3;text('ASA '+val,val,(88+5.7*cos(a),49+5.7*sin(a),129.6),1.3,ink,(0,0,a-pi/2))
text('ASA label','ASA',(88,49,129.6),1.6,ink,(0,0,0))
box('Frame counter window',(78,34,123.2),(9,5,.8),dark,.3)
text('Frame number','8',(78,34,123.8),3,ink,(0,0,0))

group=groups['05 Strap']
for s in [-1,1]:
    box('Strap lug',(s*75,1,123),(12,14,2),silver,1.5)
    line('Strap buckle frame',[(s*78,-5,127),(s*91,-5,127),(s*91,8,127),(s*78,8,127),(s*78,-5,127)],1.3,edge)
# Relaxed cloth ribbon from the two shoulder lugs around the rear of the camera.
pts=[(-84,2,125),(-130,17,50),(-155,65,6),(-135,135,4),(-70,181,5),(0,193,6),(75,176,5),(141,130,5),(161,59,7),(128,8,46),(84,2,125)]
path=[]
for j in range(len(pts)-1):
    p0=Vector(pts[max(j-1,0)]);p1=Vector(pts[j]);p2=Vector(pts[j+1]);p3=Vector(pts[min(j+2,len(pts)-1)])
    for k in range(12):
        t=k/12;path.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
path.append(Vector(pts[-1]));v=[]
for i,p in enumerate(path):
    tangent=path[min(i+1,len(path)-1)]-path[max(i-1,0)]
    side=tangent.cross(Vector((0,0,1))).normalized()
    if side.length<.1:side=Vector((1,0,0))
    width=9 if i<18 or i>len(path)-19 else 17
    v.extend([p-side*width/2,p+side*width/2])
o=mesh('Continuous woven shoulder strap',v,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(path)-1)],nylon)
mod=o.modifiers.new('Webbing thickness','SOLIDIFY');mod.thickness=.9*S
mod=o.modifiers.new('Soft webbing edges','BEVEL');mod.width=.35*S;mod.segments=2
for p in o.data.polygons:p.use_smooth=True

group=groups['06 Studio']
floor=mat('Warm grey studio floor',(.19,.205,.215),0,.7)
box('Studio floor',(0,0,-5),(2000,2000,6),floor,0)
world=bpy.data.worlds.new('Soft studio environment');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.3,.34,.4,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
def aim(o,target):o.rotation_euler=(Vector(target)*S-o.location).to_track_quat('-Z','Y').to_euler()
def camera(name,pos,target,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);group.objects.link(o);o.location=Vector(pos)*S;aim(o,target);d.type='ORTHO';d.ortho_scale=scale*S;d.lens=55;d.clip_start=.001;return o
front=camera('CAM • Front three-quarter',(340,-480,320),(0,20,85),415)
rear=camera('CAM • Rear three-quarter',(-320,440,285),(0,30,92),365)
camera('CAM • Front elevation',(0,-600,95),(0,0,95),300)
camera('CAM • Rear elevation',(0,600,100),(0,0,100),310)
scene.camera=front
for name,pos,power,size,col in [('Key softbox',(-260,-300,430),18,310,(1,.88,.74)),('Fill softbox',(320,-100,260),12,250,(.75,.85,1)),('Top rim',(0,280,430),23,270,(1,1,1)),('Front strip',(-60,-400,120),4,140,(1,1,1))]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size*S;d.color=col
    o=bpy.data.objects.new(name,d);group.objects.link(o);o.location=Vector(pos)*S;aim(o,(0,0,80))
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=OUT+'/mamiya_universal_front.png'
scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
bpy.context.view_layer.update()
for o in bpy.context.selected_objects:o.select_set(False)
root.select_set(True);bpy.context.view_layer.objects.active=root
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.clip_start=.001
            area.spaces.active.region_3d.view_distance=.5
            area.spaces.active.region_3d.view_location=(0,0,.09)
            area.spaces.active.region_3d.view_rotation=front.rotation_euler.to_quaternion()
            area.spaces.active.shading.type='MATERIAL'
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/mamiya_universal.blend')
result={'filepath':bpy.data.filepath,'objects':len(scene.objects),'scene':scene.name,'model_components':len([o for o in scene.objects if o.parent==root])}
