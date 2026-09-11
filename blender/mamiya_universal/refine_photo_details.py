"""Non-destructive detail pass from IMG_1978–2009; run on the previous master.

blender --background mamiya_universal.blend --python refine_photo_details.py
Writes mamiya_universal_refined.blend beside this script. Replaced objects are hidden.
"""
import bpy, bmesh, math, os, json
from math import sin, cos, pi
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__))
s=bpy.data.scenes['Mamiya Universal | Studio'];bpy.context.window.scene=s
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
assert '08 Closeup refinements' not in bpy.data.collections, 'Pass already applied; open the previous master.'
g=bpy.data.collections.new('08 Closeup refinements');s.collection.children.link(g)
root=bpy.data.objects['MAMIYA UNIVERSAL • photo reference model']
black=bpy.data.materials['Black enamel | satin edge highlights'];metal=bpy.data.materials['Black anodized machined aluminum'];chrome=bpy.data.materials['Brushed chrome fittings'];ink=bpy.data.materials['Warm white engraved markings'];dark=bpy.data.materials['Optical black'];leather=bpy.data.materials['Pebbled black leatherette'];rubber=bpy.data.materials['Rubber | hood and eyecup'];red=bpy.data.materials['Red index enamel']
def finish(o,name,mat,bev=0):
 o.name='R • '+name
 for c in list(o.users_collection):c.objects.unlink(o)
 g.objects.link(o);o.parent=root
 if mat:o.data.materials.append(mat)
 if bev:
  m=o.modifiers.new('Machined edge radius','BEVEL');m.width=bev*.001;m.segments=3
  o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
 return o
def box(n,p,d,m=metal,b=.2):
 bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(p)*.001);o=bpy.context.object;o.dimensions=Vector(d)*.001
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,n,m,b)
def cyl(n,p,r,d,m=metal,axis='Y'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r*.001,depth=d*.001,location=Vector(p)*.001,rotation={'Y':(pi/2,0,0),'X':(0,pi/2,0),'Z':(0,0,0)}[axis])
 o=finish(bpy.context.object,n,m,.08)
 for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 return o
def mesh(n,v,f,m=metal,smooth=False):
 me=bpy.data.meshes.new(n);me.from_pydata([Vector(p)*.001 for p in v],[],f);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(n,me);g.objects.link(o);o.parent=root;o.name='R • '+n;me.materials.append(m)
 for f in me.polygons:f.use_smooth=smooth
 return o
def tube(n,pts,r,m=metal,closed=False):
 c=bpy.data.curves.new(n,'CURVE');c.dimensions='3D';c.bevel_depth=r*.001;c.bevel_resolution=3;c.use_fill_caps=True
 sp=c.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*[v*.001 for v in co],1)
 sp.use_cyclic_u=closed;o=bpy.data.objects.new('R • '+n,c);g.objects.link(o);o.parent=root;c.materials.append(m);return o
def text(n,t,p,size,m=ink,rot=(pi/2,0,0)):
 c=bpy.data.curves.new(n,'FONT');c.body=t;c.size=size*.001;c.align_x='CENTER';c.align_y='CENTER';c.extrude=.004*.001;c.resolution_u=4
 o=bpy.data.objects.new('R • '+n,c);g.objects.link(o);o.parent=root;o.location=Vector(p)*.001;o.rotation_euler=rot;c.materials.append(m);return o
def lathe(n,prof,m=metal,x=0,z=64):
 N=128;v=[(x+r*cos(i*2*pi/N),y,z+r*sin(i*2*pi/N)) for r,y in prof for i in range(N)]
 f=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(prof)-1) for i in range(N)]
 return mesh(n,v,f,m,True)
def ring(n,y,r,ri,d,m=metal,x=0,z=64):return lathe(n,[(ri,y-d/2),(r,y-d/2),(r,y+d/2),(ri,y+d/2),(ri,y-d/2)],m,x,z)
def hide(prefixes):
 for o in list(s.objects):
  if o.name.startswith(tuple(prefixes)):o.hide_render=True;o.hide_set(True)
def material(n,color,metallic=0,rough=.3,trans=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=rough;p.inputs['Transmission Weight'].default_value=trans
 return m
# New photographs show no attached shoulder strap. Retain all original objects.
for o in bpy.data.collections['05 Strap'].objects:o.hide_render=True;o.hide_set(True)
hide(['D • Woven strap','D • Strap edge stitch'])

# IMG_1984–1988, 2005: one continuous rounded shell and wrap around the roll back.
hide(['Film back center shell','Rear leatherette cover','Film chamber','Back perimeter trim','Back edge trim','Spool chamber top cap','Film back upper bridge'])
def capsule(n,r,z0,z1,m):
 pts=[(88+r*cos(-pi/2+i*pi/64),49+r*sin(-pi/2+i*pi/64)) for i in range(65)]+[(-88+r*cos(pi/2+i*pi/64),49+r*sin(pi/2+i*pi/64)) for i in range(65)]
 N=len(pts);v=[(x,y,z) for z in [z0,z1] for x,y in pts];f=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 o=mesh(n,v,f,m)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 b=o.modifiers.new('Rolled cover edge','BEVEL');b.width=.0007;b.segments=3;o.modifiers.new('Cover normals','WEIGHTED_NORMAL');return o
capsule('Continuous roll back casting',25,15,122,black)
capsule('Continuous rounded leatherette',25.35,20,106.5,leather)
for z in [17.5,108]:capsule('Roll back perimeter bead',25.65,z-.7,z+.7,metal)
capsule('Roll back upper cover',25.2,110,123,black)
# Move the existing rear label / memo assembly onto the corrected continuous rear plane.
for o in list(s.objects):
 if o.name.startswith(('Roll film ','Back made in Japan','Memo clip','D • Original photographed memo','D • Film back release','D • Film advance arrow','D • 6x9 badge')):
  o.location.y+=.0068
# More faithful badge spacing visible in the rear straight-on photograph.
bpy.data.objects['Roll film Mamiya logo'].location.x=.012
bpy.data.objects['Roll film adapter caption'].location.x=.012
bpy.data.objects['Roll film 6x9'].location.x=-.014
bpy.data.objects['Back made in Japan'].location.x=-.048
bpy.data.objects['D • 6x9 badge border'].location.x+=.033
# Latch end: ASA black dial, 120 / S windows, fine gear edge (IMG_1987).
hide(['ASA ','Spool top knob','D • ASA dial edge','Frame counter window','Frame number','Film advance lever','Film advance thumb pad'])
cyl('ASA dial pedestal',(-88,49,124),10.2,2,metal,'Z');cyl('ASA rotating dial',(-88,49,125.2),9.6,1.4,black,'Z')
for i in range(72):
 a=i*2*pi/72;cyl('ASA edge tooth',(-88+9.5*cos(a),49+9.5*sin(a),125),.22,1.3,metal,'Z')
for i,val in enumerate(['100','80','50','32','ASA','S','400','200']):
 a=pi/2-i*2*pi/8;text('ASA scale '+val,val,(-88+7.25*cos(a),49+7.25*sin(a),126.05),1.65,ink,(0,0,a-pi/2))
cyl('ASA center plate',(-88,49,126),4.4,.3,metal,'Z')
for x,y in [(-90.6,48),(-85.4,50)]:cyl('ASA central screw',(x,y,126.22),.45,.2,chrome,'Z')
cyl('ASA red index',(-88,53,126.3),.45,.2,red,'Z')
for t,p in [('120',(-88,63,123.15)),('S',(-74,49,123.15))]:
 box('Film stock indicator window',p,(7,4,.25),dark,.25);text('Film indicator '+t,t,(p[0],p[1],123.35),2.7,ink,(0,0,0))
# Smooth swept advance lever, plus inset counter on the other chamber.
cyl('Advance lever pivot',(88,49,124.5),9,3,metal,'Z');cyl('Advance pivot screw',(88,49,126.2),3,.5,metal,'Z')
outline=[(91,43),(96,47),(96,54),(91,60),(80,63),(63,61),(43,54),(25,47),(17,43),(18,37),(25,36),(46,43),(65,49),(78,51),(84,48)]
v=[(x,y,z) for z in [125.5,128.0] for x,y in outline];N=len(outline);f=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
o=mesh('Swept film advance lever',v,f,black);be=o.modifiers.new('Lever softened edge','BEVEL');be.width=.0009;be.segments=3;o.modifiers.new('Lever normals','WEIGHTED_NORMAL')
box('Advance finger rest',(25,41,128.6),(15,9,3),rubber,1.7)
box('Counter bezel',(75,34,123.35),(10,6,.5),chrome,.6);box('Counter glass recess',(75,34,123.65),(8.5,4.5,.25),dark,.4);text('Counter numeral','8',(75,34,123.85),2.7,ink,(0,0,0))
for x in [-88,88]:
 cyl('Bottom spool spindle',(x,49,12),5.5,6,metal,'Z');cyl('Spool retaining flange',(x,49,15),7,.8,metal,'Z')
# Stamped latch plate / straight folded bail rather than an inflated wire loop.
hide(['Chrome back latch','Folding latch bail','Latch screw','D • Latch fine abrasion'])
box('Stamped latch foundation',(-99,73.7,63),(12.5,1.1,75),chrome,.8)
box('Latch inset channel',(-99,74.32,63),(6,.2,59),metal,.2)
for z in [31,95]:
 cyl('Latch fastener',(-99,74.7,z),1.5,.65,chrome)
 box('Latch fastener slot',(-99,75.05,z),(1.9,.1,.3),dark,.04)
tube('Folded latch bail',[(-99,75,37),(-103,77,39),(-106,77,43),(-106,77,83),(-103,77,87),(-99,75,89)],1.05,chrome)
for z in [38,88]:cyl('Latch hinge rivet',(-99,75.4,z),1.8,1.2,chrome)
# Film back mounting locks visible below the adapter (IMG_2005).
for x in [-38,38]:
 cyl('Lower adapter locking cam',(x,37,8),5.7,2,metal)
 o=box('Lock cam screwdriver groove',(x,38.1,8),(7,.3,.85),dark,.2);o.rotation_euler.y=-.65

# IMG_1991: hollow accessory socket with exposed center screw and locating pins.
hide(['Side accessory socket','Side socket center','Socket screw thread'])
def xring(n,x,y,z,r,ri,d,m):
 o=ring(n,0,r,ri,d,m);o.rotation_euler.z=-pi/2;o.location=(x*.001,y*.001,(z-64)*.001);return o
xring('Accessory socket rim',78,0,55,10.4,8,11,metal)
cyl('Socket recessed floor',(74,0,55),8,.6,dark,'X');cyl('Socket slotted center bolt',(76.4,0,55),3.5,1.6,chrome,'X')
box('Accessory bolt slot',(77.25,0,55),(.15,.5,5.3),dark,.07)
for z in [49,61]:cyl('Socket locating pin',(78,0,z),.95,3.2,chrome,'X')
for x in [76,77.1,78.2,79.3,80.4,81.5,82.5]:xring('Accessory external screw thread',x,0,55,10.55,10.15,.32,metal)
# Opposite side: rectangular accessory plate with a recessed central socket, two screws.
box('Opposite side accessory plate',(-73.2,0,67),(1.4,18,65),metal,.8)
xring('Side plate threaded socket',-74.4,0,67,4.1,2.4,1.5,metal);cyl('Side plate socket well',(-73.8,0,67),2.4,.3,dark,'X')
for z in [43,91]:
 cyl('Side plate screw',(-74.1,0,z),1.4,.5,chrome,'X')
 for ang in [0,pi/2]:
  o=box('Side screw cross',(-74.4,0,z),(.1,1.8,.28),dark,.04);o.rotation_euler.x=ang
# Rectangular strap attachment clips near the bottom, and upper flat lugs.
for side in [-1,1]:
 x=side*74
 tube('Lower strap loop',[(x,-4,14),(x,4,14),(x,4,24),(x,-4,24)],.7,chrome,True)
 box('Lower lug saddle',(side*74.7,0,22),(2.3,9,5),metal,.5)
 cyl('Lower lug screw',(side*73.6,-8,20),1.8,.8,chrome,'X')
 box('Upper shoulder lug',(side*75,0,122),(9,12,1.25),chrome,.5)
 for z in [115,145]:
  cyl('Side housing screw',(side*72.3,0,z),1.15,.7,metal,'X')
 tube('Upper housing side seam',[(side*72.12,-23,124),(side*72.12,25,124)],.14,dark)
# IMG_1989: non-destructive body opening, metal film rails and dark-slide handle.
cut=cyl('Body light path construction',(0,0,64),36,70,dark);cut.hide_render=True;cut.hide_set(True)
for name in ['Die-cast central chassis','Front perimeter bright edge','Front leatherette panel']:
 mod=bpy.data.objects[name].modifiers.new('Lens light path','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
cut2=box('6x9 gate construction',(0,30,64),(91,28,61),dark,0);cut2.hide_render=True;cut2.hide_set(True)
mod=bpy.data.objects['Film back adapter'].modifiers.new('6x9 exposure gate','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut2
for z in [32,96]:box('Film gate polished rail',(0,37,z),(96,1.2,1.6),chrome,.2)
box('Dark slide grip',(0,34,123.9),(88,2.5,4.5),metal,.7)
text('Dark slide instruction','INSERT DARK SLIDE',(12,35.32,123.8),1.05,ink,(pi/2,0,pi))

# IMG_1997–1999: recessed optics, lilac bright patch and a circular rangefinder port.
hide(['Main finder glass','Rangefinder patch glass','D • Main finder prism','D • Rangefinder patch prism'])
clear=material('R | Lightly coated finder cover',(.72,.62,.55),0,.07,.98)
prism=material('R | Finder prism reflection',(.18,.14,.19),.55,.16)
patch=material('R | Lilac rangefinder reflection',(.45,.31,.50),.28,.19)
p=patch.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(.2,.12,.25,1);p.inputs['Emission Strength'].default_value=.15
box('Recessed front finder cover',(-44,-27.8,158),(38,.25,35),clear,.08)
for x,z,w,h in [(-44,158,39,36)]:
 for off in [0,.6]:
  tube('Finder nested bezel',[(x-w/2+off,-28,z-h/2+off),(x+w/2-off,-28,z-h/2+off),(x+w/2-off,-28,z+h/2-off),(x-w/2+off,-28,z+h/2-off)],.16,metal,True)
box('Deep rectangular finder prism',(-44,-9,158),(29,.8,27),prism,.8)
box('Lilac finder coincidence patch',(-42,-10,164),(10,.35,8.5),patch,1)
# Lower angled optics catch softbox reflections inside the real window.
o=box('Angled lower finder reflector',(-44,-15,146),(28,9,.7),chrome,.1);o.rotation_euler.x=.30
box('Rangefinder square mask',(55,-28,156),(12,.45,13),black,.2)
# Add real circular aperture through the square mask.
rc=cyl('Round rangefinder bore construction',(55,-27,156),3.6,6,dark);rc.hide_render=True;rc.hide_set(True)
mod=bpy.data.objects['R • Rangefinder square mask'].modifiers.new('Circular rangefinder port','BOOLEAN');mod.operation='DIFFERENCE';mod.object=rc
ring('Round rangefinder bezel',-28.3,3.8,3.25,.35,metal,55,156)
cyl('Round rangefinder optic',(55,-27.1,156),3.25,.3,clear)
# Outer finder pane perimeter, larger badge letterforms, correct shoe details.
bpy.data.objects['UNIVERSAL badge'].data.size=.0052;bpy.data.objects['UNIVERSAL badge'].data.shear=.16
bpy.data.objects['MAMIYA badge'].data.size=.0052
for n in ['UNIVERSAL badge','MAMIYA badge']:bpy.data.objects[n].data.extrude=.000012
for x in [-9,9]:
 box('Cold shoe spring',(x,4,189),(1.6,19,.35),chrome,.2)
for y in [-4,11]:cyl('Shoe screw',(0,y,188),1.05,.4,metal,'Z')
# Rear eyecup lip undulates asymmetrically; add a visible inner coated optical surface.
box('Rear finder bright field',(-39,48.95,157),(10,.3,9),patch,.8)
for z in [126,180]:cyl('Rear service plate screw',(0,28.7,z),1.25,.5,metal)
# Less exaggerated polished highlights; retain the existing fine surface material nodes.
for mname in ['Black enamel | satin edge highlights','Black anodized machined aluminum']:
 m=bpy.data.materials[mname];p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Metallic'].default_value=.38 if mname.startswith('Black enamel') else .7
 for n in m.node_tree.nodes:
  if n.type=='VALTORGB':
   for e,v in zip(n.color_ramp.elements,[.29,.33]):e.color=(v,v,v,1)
# New photographs show taller grouped focus grooves with alternating smooth lands.
for o in s.objects:
 if o.name.startswith('Focus knurl'):
  i=int(o.name.rsplit(' ',1)[1]);o.hide_render=(i%20>=10);o.hide_set(o.hide_render)
# Lens 72 mm hood text and subsidiary manufacturing legend.
for body,r,y,center,size in [('LENS MADE IN JAPAN',44.8,-37,pi,1.35),('SEIKO',34.15,-72,pi,1.6),('72MM',41.25,-113.7,-.4,1.35)]:
 for i,ch in enumerate(body):
  a=center+(i-(len(body)-1)/2)*size*.72/r
  text('Lens subsidiary engraving',ch,(r*sin(a),y,64+r*cos(a)),size,ink,(0,a,0))
# PC sync terminal and L-shaped shutter cocking lever from the detached-lens closeups.
ring('PC sync socket flange',-74,3.1,1,.75,chrome,-17,91)
cyl('PC sync insulator',(-17,-74.8,91),1,.8,dark)
tube('Shutter cocking bent lever',[(29,-73,77),(35,-73,78),(35,-78,82),(35,-78,88)],.85,chrome)
cyl('Cocking lever grooved grip',(35,-78,89),1.5,4,chrome,'Z')
for i in range(16):
 a=i*2*pi/16;tube('Cocking grip knurl',[(35+1.5*cos(a),-78+1.5*sin(a),87.5),(35+1.5*cos(a),-78+1.5*sin(a),90.5)],.07,metal)
# Fix overly strong lens tint while retaining layered real refractive geometry.
p=bpy.data.materials['Coated optical glass | blue amber'].node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.72,.62,.46,1);p.inputs['Roughness'].default_value=.055;p.inputs['Transmission Weight'].default_value=1;p.inputs['Metallic'].default_value=0
# Closeup render review: flatter front optical surface and subdued coating.
front=bpy.data.objects['Convex front glass']
for v in front.data.vertices:
 if v.co.y < -.1093:
  v.co.y=-.1104+(v.co.y+.1104)*.45
if 'Thin Film Thickness' in p.inputs:p.inputs['Thin Film Thickness'].default_value=190
bpy.data.objects['R • Rear finder bright field'].location.y=.0473
rear=bpy.data.objects['Rear finder optical glass'];rear.data.materials.clear();rear.data.materials.append(clear)
# Keep the leather grain dark while retaining grazing highlights on raised areas.
lm=bpy.data.materials['Pebbled black leatherette'];lp=lm.node_tree.nodes.get('Principled BSDF');lp.inputs['Specular IOR Level'].default_value=.34
for n in lm.node_tree.nodes:
 if n.type=='VALTORGB' and any(link.to_socket==lp.inputs['Roughness'] for out in n.outputs for link in out.links):
  for e,v in zip(n.color_ramp.elements,[.62,.46,.4]):e.color=(v,v,v,1)

# Five complete camera views, matched lighting and framing.
studio=bpy.data.collections['06 Studio']
views=[('01 Front three-quarter',(320,-490,245),(0,-22,95),.295),('02 Opposite front',(-330,-490,235),(0,-22,95),.295),('03 Rear three-quarter',(-325,470,245),(0,15,97),.295),('04 Side profile',(600,-10,145),(0,-18,96),.29),('05 Elevated rear',(175,400,425),(0,13,95),.305)]
for title,pos,target,scale in views:
 d=bpy.data.cameras.new('CAM • Refined '+title);o=bpy.data.objects.new(d.name,d);studio.objects.link(o);o.location=Vector(pos)*.001;o.rotation_euler=(Vector(target)*.001-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=scale;d.clip_start=.001;d.clip_end=20
# Rear fill reveals the curved cover without changing the studio look.
d=bpy.data.lights.new('Rear detail softbox','AREA');d.energy=4;d.shape='RECTANGLE';d.size=.22;d.size_y=.3;o=bpy.data.objects.new(d.name,d);studio.objects.link(o);o.location=(-.25,.35,.30);o.rotation_euler=(Vector((0,.04,.08))-o.location).to_track_quat('-Z','Y').to_euler()
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=64;s.cycles.use_denoising=True;s.cycles.max_bounces=12;s.cycles.transmission_bounces=10
s.render.threads_mode='AUTO';s.render.use_persistent_data=False;s.render.resolution_x=1600;s.render.resolution_y=1600;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.camera=bpy.data.objects['CAM • Refined 01 Front three-quarter'];s.render.filepath='//renders_refined/01_front_three_quarter.png'
root['reference']='IMG_1964–1977 plus detail series IMG_1978–2009 (IMG_2000 absent)';root['closeup_revision']='Continuous film back, ASA and advance controls, body fittings, finder optics, lens hardware; 2026-09-09'
root['strap_visibility']='Removable strap retained hidden to match new assembled reference photographs.'
for im in bpy.data.images:
 if im.source=='FILE' and im.has_data and not im.packed_file:im.pack()
bpy.context.view_layer.update()
# Center the camera framing from evaluated geometry, including rounded shells.
bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();points=[]
for obj in s.objects:
 if not obj.parent or obj.hide_render or obj.type not in {'MESH','CURVE','FONT'}:continue
 evaluated=obj.evaluated_get(dg);me=evaluated.to_mesh()
 points.extend(evaluated.matrix_world@v.co for v in me.vertices);evaluated.to_mesh_clear()
for cam in [o for o in s.objects if o.type=='CAMERA' and o.name.startswith('CAM • Refined')]:
 inv=cam.matrix_world.inverted();projected=[inv@p for p in points]
 x0,x1=min(p.x for p in projected),max(p.x for p in projected)
 y0,y1=min(p.y for p in projected),max(p.y for p in projected)
 cam.location+=cam.rotation_euler.to_matrix()@Vector(((x0+x1)/2,(y0+y1)/2,0))
 cam.data.ortho_scale=max(cam.data.ortho_scale,(x1-x0)/.8,(y1-y0)/.8)
bpy.context.view_layer.update()

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'mamiya_universal_refined.blend'))
print(json.dumps({'refinement_objects':len(g.objects),'total_objects':len(s.objects),'cameras':[v[0] for v in views]}))
