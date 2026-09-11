"""Independent photo-derived component studies. No assembled scene is created.
Run in a fresh background Blender: --python build_components.py -- body|lens|film_back
The dimensions below are working estimates, not measured engineering dimensions.
"""
import bpy, bmesh, math, os, sys, json
from math import pi, sin, cos
from mathutils import Vector
OUT=os.path.dirname(os.path.abspath(__file__))
PART=sys.argv[sys.argv.index('--')+1]
assert PART in ('body','lens','film_back')
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene;s.name={'body':'01 Camera body — independent study','lens':'02 Sekor lens — independent study','film_back':'03 Film back — independent study'}[PART]
s.unit_settings.system='METRIC';s.unit_settings.length_unit='MILLIMETERS'
g=bpy.data.collections.new('01 Editable component');s.collection.children.link(g)
construction=bpy.data.collections.new('02 Hidden construction');s.collection.children.link(construction)
studio=bpy.data.collections.new('03 Review studio');s.collection.children.link(studio)
root=bpy.data.objects.new(PART.upper()+' | component origin',None);g.objects.link(root)
root['status']='Independent shape study. Not assembled.';root['dimensions']='Photo-proportioned working millimeters; not caliper measurements.'
def mat(n,c,r=.58):
 m=bpy.data.materials.new(n);m.diffuse_color=(c,c,c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(c,c,c,1);p.inputs['Roughness'].default_value=r;p.inputs['Metallic'].default_value=0;return m
clay=mat('Neutral gray | main castings',.34);panel=mat('Neutral gray | fitted panels',.27);trim=mat('Neutral gray | machined parts',.43,.42);dark=mat('Neutral gray | cavities and optics',.09,.55);insert=mat('Neutral gray | inset panels',.21);rubber=mat('Neutral gray | thin rubber cup',.25,.7)
def move(o,n,m,bev=0):
 o.name=n
 for c in list(o.users_collection):c.objects.unlink(o)
 g.objects.link(o);o.parent=root
 if m:o.data.materials.append(m)
 if bev:
  mod=o.modifiers.new('Edge radius','BEVEL');mod.width=bev*.001;mod.segments=3
  o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def box(n,p,d,m=clay,b=.4):
 bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(p)*.001);o=bpy.context.object;o.dimensions=Vector(d)*.001
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return move(o,n,m,b)
def cyl(n,p,r,d,m=trim,axis='Y',b=.12,N=96):
 bpy.ops.mesh.primitive_cylinder_add(vertices=N,radius=r*.001,depth=d*.001,location=Vector(p)*.001,rotation={'Y':(pi/2,0,0),'X':(0,pi/2,0),'Z':(0,0,0)}[axis]);o=move(bpy.context.object,n,m,b)
 for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 return o
def mesh(n,v,f,m=clay,smooth=False,bev=0):
 me=bpy.data.meshes.new(n);me.from_pydata([Vector(p)*.001 for p in v],[],f);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(n,me);g.objects.link(o);o.parent=root;me.materials.append(m)
 for p in me.polygons:p.use_smooth=smooth
 if bev:
  md=o.modifiers.new('Edge radius','BEVEL');md.width=bev*.001;md.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def line(n,pts,r,m=trim,closed=False):
 c=bpy.data.curves.new(n,'CURVE');c.dimensions='3D';c.bevel_depth=r*.001;c.bevel_resolution=3;c.use_fill_caps=True
 sp=c.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,v in zip(sp.points,pts):p.co=(*[x*.001 for x in v],1)
 sp.use_cyclic_u=closed;o=bpy.data.objects.new(n,c);g.objects.link(o);o.parent=root;c.materials.append(m);return o
def text(n,t,p,size,m=trim,rot=(pi/2,0,0)):
 c=bpy.data.curves.new(n,'FONT');c.body=t;c.size=size*.001;c.align_x='CENTER';c.align_y='CENTER';c.extrude=.012*.001;c.resolution_u=3
 o=bpy.data.objects.new(n,c);g.objects.link(o);o.parent=root;o.location=Vector(p)*.001;o.rotation_euler=rot;c.materials.append(m);return o
def lathe(n,profile,m=clay,axis='Y',center=(0,0,0),N=192):
 v=[]
 for r,h in profile:
  for i in range(N):
   a=2*pi*i/N;v.append(tuple(center[j]+q for j,q in enumerate((r*cos(a),h,r*sin(a)) if axis=='Y' else (r*cos(a),r*sin(a),h))))
 f=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(profile)-1) for i in range(N)]
 return mesh(n,v,f,m,True)
def ring(n,h,r,ri,d,m=trim,axis='Y',center=(0,0,0)):
 return lathe(n,[(ri,h-d/2),(r,h-d/2),(r,h+d/2),(ri,h+d/2),(ri,h-d/2)],m,axis,center)
def cutter(o):
 for c in list(o.users_collection):c.objects.unlink(o)
 construction.objects.link(o);o.hide_render=True;o.hide_set(True);o.display_type='WIRE';return o
def subtract(o,c,n='Editable opening'):
 mod=o.modifiers.new(n,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=c
 return mod
def extrude_xz(n,poly,y0,y1,m=clay,b=.4):
 N=len(poly);v=[(x,y,z) for y in [y0,y1] for x,z in poly];f=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 return mesh(n,v,f,m,False,b)
def extrude_xy(n,poly,z0,z1,m=clay,b=.4):
 N=len(poly);v=[(x,y,z) for z in [z0,z1] for x,y in poly];f=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 return mesh(n,v,f,m,False,b)
def screw(n,p,axis='Y',r=1.3):
 cyl(n,p,r,.55,trim,axis)
 d={'Y':(r*1.35,.12,.28),'X':(.12,r*1.35,.28),'Z':(r*1.35,.28,.12)}[axis]
 v=list(p);v[{'X':0,'Y':1,'Z':2}[axis]]+=(-.33 if axis=='Y' else .33)
 return box(n+' slot',v,d,dark,.04)

def body():
 root['references']='IMG_1989–1999, IMG_2001: bare body front, rear, both sides, top, bottom.'
 root['working_envelope_mm']='140 wide × 184 high × 55 shell depth; mount outside diameter 112; opening diameter 84.'
 # Lower casting is truly open. Its front circle blends into the rear square throat.
 chassis=box('Lower die-cast shell',(0,0,59),(140,55,118),clay,2.3)
 frontcut=cutter(cyl('Lens opening construction',(0,-17,60),42,37,dark,b=0))
 rearcut=cutter(box('Square rear chamber construction',(0,15,60),(97,38,89),dark,0))
 subtract(chassis,frontcut,'Round front throat');subtract(chassis,rearcut,'Open square rear chamber')
 # Sidewall liners reinforce the opening without closing the optical path.
 for x in [-49.3,49.3]:box('Interior side light baffle',(x,13,60),(1.2,25,85),insert,.15)
 for z in [16,104]:box('Interior top or bottom baffle',(0,13,z),(97,25,1.1),insert,.15)
 face=box('Inset front lower skin',(0,-28.1,59),(132.5,1.2,112),panel,1.8)
 subtract(face,frontcut,'Front skin follows lens throat')
 # Larger flange relative to the body, directly estimated from IMG_1996.
 ring('Body mount outer shoulder',-29.8,56,42,4,clay,center=(0,0,60))
 ring('Mount outer machined step',-33,55,44,3.2,trim,center=(0,0,60))
 ring('Inner bayonet seating face',-35,50.7,42.5,1.3,panel,center=(0,0,60))
 # The retaining ring has interrupted inner bayonet lips; leave the optical opening empty.
 for k in range(3):
  a=k*2*pi/3+.2;pts=[];N=28
  for r,h in [(42.5,-36),(46,-36),(46,-33.6),(42.5,-33.6)]:
   pts.extend([(r*cos(a+j*.62/(N-1)),h,60+r*sin(a+j*.62/(N-1))) for j in range(N)])
  f=[(j*N+i,j*N+i+1,((j+1)%4)*N+i+1,((j+1)%4)*N+i) for j in range(4) for i in range(N-1)]+[(0,N,2*N,3*N),(N-1,4*N-1,3*N-1,2*N-1)]
  mesh('Interrupted bayonet tab',pts,f,trim)
 for a in [.45,2.25,4.3]:screw('Bayonet fastener',(47*cos(a),-36,60+47*sin(a)))
 cyl('Lens index pin',(0,-36.5,111.6),.8,1.4,trim)
 box('Bottom mount release shoe',(0,-31.4,3.3),(20,9,4),trim,.5)
 # Finder shell with more rounded top corners and a separate recessed front frame.
 top=box('Rounded finder housing',(0,0,150.5),(140,55,67),clay,3.4)
 bezel=box('Finder rolled front rim',(0,-27.9,151),(138,2,64),trim,2.5)
 fascia=box('Recessed finder fascia',(0,-29,151),(133.8,1,59.5),panel,1.8)
 for name,x,z,w,h in [('Main finder',-41.8,156,44.5,35.5),('Illuminator',12.5,156,46,35.5)]:
  c=cutter(box(name+' recess construction',(x,-24,z),(w,18,h),dark,.3))
  for o in [top,bezel,fascia]:subtract(o,c,name+' recess')
  box(name+' seated insert',(x,-20.3,z),(w-1.2,.7,h-1.2),insert if name=='Main finder' else trim,.2)
  # Recess edge thickness is real geometry, plainly visible with neutral materials.
  for dx in [-w/2,w/2]:box(name+' edge',(x+dx,-28.7,z),(.7,.8,h),trim,.15)
  if name=='Main finder':
   box('Finder internal upper patch',(x+2,-21,164),(13,.25,9),panel,.7)
   lower=box('Finder sloped lower prism',(x,-24,145),(31,8,.7),trim,.2);lower.rotation_euler.x=.25
 square=box('Rangefinder square surround',(59,-29.6,156),(13.2,.7,13),insert,.3)
 c=cutter(cyl('Round rangefinder port construction',(59,-27,156),4,10,dark,b=0))
 for o in [square,fascia,bezel,top]:subtract(o,c,'Circular rangefinder port')
 cyl('Rangefinder recessed optical seat',(59,-22.5,156),3.85,.4,dark)
 # Nameplate follows the upper arc of the mount instead of crossing the flange.
 badge=box('Ribbed nameplate carrier',(0,-29,120),(133,1.25,17),panel,.2)
 cut=cutter(cyl('Nameplate mount arc construction',(0,-28,60),56.6,8,dark,b=0));subtract(badge,cut,'Nameplate curved lower edge')
 for j in range(38):
  z=112+j*.39;half=66
  if z<116.6:
   x=math.sqrt(max(0,56.6**2-(z-60)**2))
   for a,b in [(-half,-x),(x,half)]:line('Nameplate fine rib',[(a,-29.7,z),(b,-29.7,z)],.032,panel)
  else:line('Nameplate fine rib',[(-half,-29.7,z),(half,-29.7,z)],.032,panel)
 t=text('UNIVERSAL badge','UNIVERSAL',(-42,-29.75,119),4.7);t.data.shear=.15
 text('MAMIYA badge','M A M I Y A',(43,-29.75,119),4.4)
 for x,z in [(-62,132),(62,132),(-45,179)]:screw('Finder fascia screw',(x,-29.8,z))
 # Side panels have the stepped rear recess shown in IMG_1990 / IMG_1994.
 for side in [-1,1]:
  # Work in YZ, using a rotated mesh for the stepped cover outline.
  outline=[(-24,4),(-24,114),(25,114),(25,75),(17,73),(17,45),(25,43),(25,4)]
  o=extrude_xz('Stepped side fitted panel',outline,-.7,.7,panel,.4)
  o.rotation_euler.z=pi/2;o.location.x=side*70.4*.001
  for z in [121,176]:screw('Side housing fixing',(side*70.3,1,z),'X',1.25)
  box('Upper flat strap lug',(side*73,0,115),(8,11,1.2),trim,.35)
  line('Lower rectangular strap loop',[(side*72,-4,10),(side*72,4,10),(side*72,4,23),(side*72,-4,23)],.7,trim,True)
  box('Lower strap saddle',(side*72.7,0,22),(2.5,10,5.5),panel,.6)
  screw('Lower lug fixing',(side*71.5,8,16),'X',1.5)
 # Side accessory receptacle: thin walls, deep well, two locating pins.
 o=ring('Side accessory threaded cup',0,10,8,9,trim,center=(0,0,0));o.rotation_euler.z=-pi/2;o.location=(.075,0,.058)
 cyl('Side cup recessed floor',(71.8,0,58),8,.8,dark,'X');cyl('Side cup central bolt',(73.7,0,58),3.4,1,trim,'X');box('Side cup bolt slot',(74.3,0,58),(.12,.4,5.5),dark,.06)
 for z in [52,64]:cyl('Side cup locating pin',(75.6,0,z),.85,2.5,trim,'X')
 for x in [72,73.2,74.4,75.6,76.8,78,79]:
  o=ring('Side cup external thread',0,10.15,9.8,.3,trim);o.rotation_euler.z=-pi/2;o.location=(x*.001,0,.058)
 plate=box('Opposite side accessory plate',(-71.5,0,65),(1.6,19,63),insert,.8)
 c=cutter(cyl('Side socket construction',(-71,0,65),2.7,8,dark,'X',0));subtract(plate,c,'Threaded center opening')
 for z in [42,89]:screw('Accessory plate fastener',(-72.4,0,z),'X')
 # Rear adapter frame with a near-square clear opening; no film back is attached.
 adapter=box('Rear adapter stepped frame',(0,31,60),(138,8,117),clay,2.2)
 c=cutter(box('Rear adapter gate construction',(0,31,61),(99,16,88),dark,0));subtract(adapter,c,'Open rear gate')
 inner=box('Recessed gate rim',(0,35.3,61),(111,1.5,100),panel,2)
 subtract(inner,c,'Gate rim clear opening')
 for z in [15.5,106.5]:box('Upper lower polished registration rail',(0,36.3,z),(100,1.2,2),trim,.8)
 for x in [-51,51]:box('Vertical registration rail',(x,36.3,61),(1.6,1.2,70),trim,.7)
 for x in [-62,62]:
  box('Back retaining slide',(x,37,60),(9,3.5,43),panel,.8)
  for z in [44,77]:screw('Back slide fastener',(x,39,z))
 box('Upper adapter retaining lip',(0,35.8,117.5),(120,4,8),panel,.7)
 for x in [-48,-16,16,48]:screw('Upper adapter screw',(x,38,118))
 for x in [-39,39]:
  cyl('Rear locking cam',(x,36,8),6.5,3,panel)
  o=box('Rear locking cam paddle',(x,39,8),(3,5,13),trim,.8);o.rotation_euler.y=.7
 # Rear upper service plate and thin asymmetric rubber shade.
 box('Rear finder service plate',(0,29,151),(135,2,62),panel,2)
 box('Rear finder optic mounting block',(-34,33,152),(57,8,54),clay,1.5)
 box('Rear finder block inset',(-34,37.4,152),(51,.8,48),panel,.6)
 for h,r,ri,d in [(41,23,15,7),(46,24,16,3),(49,24,17,3)]:ring('Eyepiece stepped barrel',h,r,ri,d,trim,center=(-34,0,155))
 cyl('Eyepiece recessed optic',(-34,46.4,155),14.8,.5,dark)
 # Thin flared membrane with a rolled edge, rather than a solid swollen oval.
 N=192;verts=[]
 def outer(a):return 29+12*max(0,cos(a-.35))**6+6*max(0,-cos(a-.35))**6
 for stage in range(8):
  for i in range(N):
   a=i*2*pi/N;rr=outer(a)
   r,y=[(17,49),(20,49.5),(rr*.83,53),(rr,56),(rr,57),(rr*.83,54),(20,50.5),(17,50)][stage]
   verts.append((-34+r*cos(a),y+.9*sin(a*2),155+r*sin(a)))
 f=[(j*N+i,j*N+(i+1)%N,((j+1)%8)*N+(i+1)%N,((j+1)%8)*N+i) for j in range(8) for i in range(N)]
 mesh('Thin asymmetric flared eyecup',verts,f,rubber,True)
 line('Eyecup rolled outer edge',[(-34+outer(a)*cos(a),57+.9*sin(a*2),155+outer(a)*sin(a)) for a in [i*2*pi/N for i in range(N)]],.45,rubber,True)
 box('Finder selector recess',(23,30.2,176),(18,.6,3.6),dark,1.3);screw('Finder selector knob',(15,32,176),r=3)
 text('Rear finder focal setting','100',(49,30.4,176),2.6,trim,(pi/2,0,pi))
 text('Rear maker','MAMIYA CAMERA CO.,LTD.',(33,30.4,140),2.8,trim,(pi/2,0,pi));text('Rear country','MADE IN JAPAN',(33,30.4,135),2.3,trim,(pi/2,0,pi))
 # Thin cold shoe, feet and underside insert visible in detached views.
 box('Cold shoe base',(0,4,185.1),(24,22,1.4),panel,.3)
 for x in [-10,10]:
  box('Cold shoe rail',(x,4,188),(2.8,22,4.8),clay,.3);box('Cold shoe inward lip',(x*.85,4,190),(5,22,.9),trim,.2)
 text('Shoe serial','A87282',(0,4,186),1.9,trim,(0,0,0))
 cyl('Underside tripod insert',(0,0,.2),7,1,trim,'Z');cyl('Underside socket well',(0,0,-.4),3,.3,dark,'Z')
 return [(240,-420,240),(0,-500,94),(-250,410,240),(500,0,100)],['front_oblique','front_elevation','rear_oblique','side_profile']

def lens():
 root['references']='IMG_1978–1983: detached lens from six directions.'
 root['working_envelope_mm']='96 maximum hood diameter × 113 axial length; 90 mounting-ring diameter; 88 focus grip diameter.'
 root['axis']='Lens modeled standing on its rear mount: optical axis +Z, rear flange z=0.'
 # Radial profile is the primary model, not a stack of disconnected cubes.
 profile=[(28,0),(42,0),(43.5,1),(43.5,6),(45,7),(45,17),(44.4,18),(44.4,24),(43.5,25),(43.5,30),(42.8,31),(42.8,52),(41.4,54),(33.4,54),(33.4,68),(33,69),(33,76),(32.5,78),(34,81),(41,89),(41,97),(40,99),(29,99),(29,89),(25,82),(25,50),(28,45),(28,0)]
 lathe('Continuous stepped lens chassis',profile,clay,'Z')
 # Rear locking ring scallops modeled into the surface.
 N=640;verts=[]
 for h,inner in [(7,True),(7,False),(17,False),(17,True)]:
  for i in range(N):
   a=i*2*pi/N;r=43.5 if inner else 45.15-.55*(.5+.5*cos(a*40));verts.append((r*cos(a),r*sin(a),h))
 f=[(j*N+i,j*N+(i+1)%N,((j+1)%4)*N+(i+1)%N,((j+1)%4)*N+i) for j in range(4) for i in range(N)]
 mesh('Forty scallop mounting lock',verts,f,panel,True)
 for z,r in [(6.5,44),(18.6,44.5),(24,44.4),(30.5,43.8),(53.1,43.9),(69.4,33.8),(77.9,33.1),(96.8,41.3),(99.2,40.5)]:ring('Fine turned separation',z,r,r-.6,.6,trim,'Z')
 # Twelve groups of axial flutes, with wide unfluted lands. Integrated radial profile.
 N=1440;verts=[]
 for h in [31.4,32,51.7,52.4]:
  for i in range(N):
   a=2*pi*i/N;cell=(i%120)/120;grooved=cell<.64
   groove=(.5+.5*cos(2*pi*(i%120)/7.68)) if grooved else 0
   r=43.75-.55*groove
   if h in [31.4,52.4]:r-=.35
   verts.append((r*cos(a),r*sin(a),h))
 f=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(3) for i in range(N)]
 mesh('Grouped axial focus flutes',verts,f,panel,True)
 # Shutter-speed ring has uniform, much finer knurling.
 N=640;verts=[]
 for h in [66.5,70.7]:
  for i in range(N):
   a=2*pi*i/N;r=33.7+(.19 if i%4<2 else -.19);verts.append((r*cos(a),r*sin(a),h))
 mesh('Fine shutter ring knurling',verts,[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],panel,True)
 # Bayonet lugs on the rear face and a recessed rear optical seat.
 ring('Rear optical tube',3,28.1,24,6,insert,'Z');cyl('Rear optical surface',(0,0,5),23.7,.6,dark,'Z')
 for k in range(3):
  a=k*2*pi/3;o=box('Rear bayonet lug',(39*cos(a),39*sin(a),.6),(7,3,1.5),trim,.2);o.rotation_euler.z=a+pi/2
 # Hood is a thin tapered shell with four long rounded vent slots.
 hood=lathe('Vented tapered hood',[(40,98.8),(42.1,98.8),(47.8,110),(48,113),(46.6,113),(46.4,110.4),(40,99.6),(40,98.8)],panel,'Z')
 for k in range(4):
  a0=k*pi/2+.15;pts=[(45.55*cos(a0-.54+1.08*i/40),45.55*sin(a0-.54+1.08*i/40),108) for i in range(41)]
  cr=line('Hood vent arc construction',pts,2.05,dark)
  bpy.ops.object.select_all(action='DESELECT');cr.select_set(True);bpy.context.view_layer.objects.active=cr;bpy.ops.object.convert(target='MESH');cr=bpy.context.object;cutter(cr);subtract(hood,cr,'Rounded vent slot')
  for p in [pts[0],pts[-1]]:
   bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.00205,location=Vector(p)*.001);cap=move(bpy.context.object,'Vent round end construction',dark);cutter(cap);subtract(hood,cap,'Rounded slot end')
 be=hood.modifiers.new('Hood machined edges','BEVEL');be.width=.00012;be.segments=2
 ring('Hood leading rolled rim',112.8,48,46.55,.55,trim,'Z')
 # Shallow recessed optical surface; the clay study avoids metallic glass reflections.
 lathe('Concave engraving bezel',[(29,95.8),(39.8,98.3),(40,99),(29,96.6),(29,95.8)],trim,'Z')
 for r in [29,29.6,30.2]:ring('Front optical retainer thread',96,r,r-.25,.28,panel,'Z')
 lathe('Front optical element',[(29*i/40,95.8+.65*(1-(i/40)**2)) for i in range(41)]+[(29,95.3),(0,95.3)],dark,'Z')
 # Distinct PC-sync nipple, selector and two articulated shutter controls.
 cyl('PC sync terminal base',(0,-33.7,59),3.7,1.2,trim,'Y');ring('PC sync terminal bore',-35.7,1.4,.65,3,trim,center=(0,0,59))
 cyl('Sync selector pivot',(-11,-32.2,60),1.8,2.4,trim);o=box('Sync selector tab',(-11,-33,60),(5,.8,1.4),trim,.25);o.rotation_euler.y=.4
 for sign in [-1,1]:
  pts=[(sign*31,-7,56),(sign*36,-7,57),(sign*36,-7,66),(sign*34,-8,68)]
  line('Bent shutter control arm',pts,.9,trim)
  cyl('Shutter lever finger grip',(sign*34,-8,69.5),1.6,5,trim,'Z')
  for i in range(20):
   a=i*2*pi/20;line('Finger grip axial knurl',[(sign*34+1.6*cos(a),-8+1.6*sin(a),67.4),(sign*34+1.6*cos(a),-8+1.6*sin(a),71.5)],.045,panel)
 # Only major registration marks in the geometry study; paint scales remain deferred.
 for z,r in [(21.5,44.5),(27.8,43.6),(74,33.1)]:
  line('Major radial index',[(0,-r,z-1.2),(0,-r,z+1.2)],.16,trim)
 return [(180,-260,180),(0,-340,56),(0,-40,420)],['oblique','side_profile','optical_face']

def film_back():
 root['references']='IMG_1984–1988 and IMG_2005: asymmetric spool ends, recessed center cover and winder.'
 root['working_envelope_mm']='236 wide × 103 shell height × 54 maximum shell depth. The two spool ends have different profiles.'
 root['axis']='Vertical Z; film plane near Y=0; exterior cover faces +Y. No body attached.'
 # Rear cover plan: unequal cylindrical end chambers blend into a shallower center.
 # World +X (left in a rear view) is the ASA chamber. World -X is the advance/latch chamber.
 # These spline sections were traced from the detached back views, not a symmetric capsule.
 controls=[(-114,6),(-118,17),(-117,29),(-111,39),(-100,43),(-83,43),(-62,40),(-30,39),(10,39),(42,39),(59,42),(72,48),(84,53),(99,53),(111,47),(117,36),(118,21),(114,8),(105,0),(86,-1),(67,0),(55,3),(40,5),(0,5),(-42,5),(-65,3),(-85,0),(-103,0)]
 def catmull(points,steps=10):
  out=[];L=len(points)
  for i in range(L):
   p0,p1,p2,p3=[Vector(points[j%L]) for j in [i-1,i,i+1,i+2]]
   for k in range(steps):
    t=k/steps;v=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t);out.append(tuple(v))
  return out
 outline=catmull(controls)
 # The large ASA end extends lower; cover rises gently into the central bridge.
 def lower(x):return 5+5*(.5-.5*math.tanh((x-62)/12))
 def upper(x):return 91-2*(.5+.5*math.tanh((x-65)/12))
 def shell(n,offset,zlo,zhi,m,cap=True):
  N=len(outline);verts=[]
  for upperlayer in [False,True]:
   for x,y in outline:
    yc=25;vx=x*(1+offset/118);vy=yc+(y-yc)*(1+offset/28)
    z=(upper(x)+zhi) if upperlayer else (lower(x)+zlo);verts.append((vx,vy,z))
  faces=[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
  if cap:faces.extend([tuple(range(N-1,-1,-1)),tuple(range(N,N*2))])
  o=mesh(n,verts,faces,m,False)
  for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
  mod=o.modifiers.new('Rolled cover corner','BEVEL');mod.width=.00055;mod.segments=3;o.modifiers.new('Weighted cover normals','WEIGHTED_NORMAL');return o
 shell('Asymmetric roll-film chassis',0,-1,1,clay)
 shell('Inset continuous curved cover',.45,2,-2,panel)
 shell('Lower cover perimeter bead',.8,-.7,-82,trim)
 shell('Upper cover perimeter bead',.8,80.5,.4,trim)
 # Upper lid follows the asymmetric plan. ASA side tall; center bridge visibly drops.
 N=len(outline);verts=[]
 for layer in [0,1]:
  for x,y in outline:
   z=upper(x)+.7 if layer==0 else 102+6*(.5+.5*math.tanh((x-64)/12))
   verts.append((x,y,z))
 f=[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]+[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]
 o=mesh('Stepped upper bridge and spool lids',verts,f,clay)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 mod=o.modifiers.new('Lid edge radius','BEVEL');mod.width=.001;mod.segments=3;o.modifiers.new('Lid normals','WEIGHTED_NORMAL')
 # Thin connector / registration frame on the attachment side, without the camera body.
 attachment=box('Film-plane mounting frame',(0,1,53),(144,9,90),clay,1.5)
 cut=cutter(box('Film aperture construction',(0,1,53),(89,20,58),dark,0));subtract(attachment,cut,'6x9 aperture')
 # Front plate lies ahead of the molded cover. Recessed pressure plate represents the closed holder interior.
 box('Recessed pressure plate',(0,3.5,53),(89,1,58),dark,.5)
 for z in [22,84]:box('Film registration polished rail',(0,-3.9,z),(95,1,1.8),trim,.6)
 for x in [-47,47]:box('Film aperture edge',(x,-4,53),(1.5,1,61),trim,.5)
 for z in [10,95]:box('Sliding mount ledge',(0,-5.2,z),(137,3,3.3),panel,.5)
 box('Dark slide insertion seam',(0,-5,88),(133,.7,1.1),dark,.2)
 box('Dark slide folded grip',(0,-6.6,90),(101,2.6,4.4),trim,.6)
 # Bottom roll-spool retainers belong to each differently sized chamber.
 for x,y,z in [(94,27,4),(-95,20,9)]:
  cyl('Spool axle retaining flange',(x,y,z),9,1.5,trim,'Z');cyl('Spool pull knob',(x,y,z-4),6,7,panel,'Z')
  for dz in [-6,-4.5,-3]:cyl('Spool knob turned groove',(x,y,z+dz),6.15,.35,trim,'Z')
  for dx in [-7,7]:screw('Spool axle screw',(x+dx,y,z-.85),'Z',.8)
 # ASA dial is on +X (left in rear view); advance lever and latch share -X.
 cx,cy=94,28
 cyl('ASA dial pedestal',(cx,cy,109),10,1.8,panel,'Z')
 cyl('ASA dial face',(cx,cy,110.2),9.3,1,insert,'Z')
 for i in range(80):
  a=i*2*pi/80;line('ASA dial fine knurl',[(cx+9.6*cos(a),cy+9.6*sin(a),108.8),(cx+9.6*cos(a),cy+9.6*sin(a),110.2)],.12,panel)
 for i,label in enumerate(['100','80','50','32','ASA','S','400','200']):
  a=pi/2-i*pi/4;text('ASA dial number',label,(cx+7*cos(a),cy+7*sin(a),110.8),1.5,trim,(0,0,a-pi/2))
 for t,p in [('120',(94,42,108.5)),('S',(80,28,106.8))]:
  box('Film indicator inset',p,(7,4,.25),panel,.3);text('Film type indicator',t,(p[0],p[1],p[2]+.2),2.4,trim,(0,0,0))
 # Swept advance lever narrows along an S-curve from the opposite spool pivot.
 cyl('Film advance pivot',(-95,20,103.5),9,2,panel,'Z')
 lever=[(-100,13),(-106,18),(-105,25),(-99,31),(-87,33),(-75,31),(-62,26),(-49,21),(-31,17),(-18,16),(-17,10),(-28,9),(-48,12),(-67,18),(-81,23),(-91,22)]
 extrude_xy('Swept film advance lever',lever,104,106,panel,.65)
 box('Advance finger rest',(-23,13,107),(15,8,2.4),panel,1.4)
 box('Film counter window',(-79,9,103),(8,5,.6),insert,.5);text('Frame count','8',(-79,9,103.4),2.5,trim,(0,0,0))
 # Rear cover details conform to the shallower center plane at Y=39.5.
 box('Memo clip backplate',(4,40.5,51),(33,1.2,34),insert,.8)
 box('Memo insert',(4,41.2,51),(26,.4,26),trim,.2)
 for z in [35.5,66.5]:box('Memo folded retaining lip',(4,42,z),(32,2,2.7),clay,.7)
 for x in [-11,19]:box('Memo side lip',(x,41.7,51),(2,1.4,28),panel,.4)
 # Latch pressed plate lies on the advance-side end, following the end-cover tangent.
 plate=box('Stamped back latch plate',(-102,43.6,50),(11.5,1.2,71),trim,.7)
 box('Latch center relief',(-102,44.25,50),(6,.2,53),insert,.2)
 line('Folded latch bail',[(-102,45,25),(-106,47,29),(-108,47,33),(-108,47,67),(-106,47,71),(-102,45,75)],1,trim)
 for z in [19,81]:screw('Latch plate screw',(-102,44.8,z),r=1.35)
 # Opposite end: long narrow hinge with several knuckles at the seam.
 for z in [13,33,53,73]:cyl('Cover hinge knuckle',(115,32,z),1.4,18,trim,'Z')
 # Rear bridge markings restrained and editable, without phototextures.
 text('Rear maker','M A M I Y A',(10,40.1,97),4.1,trim,(pi/2,0,pi))
 text('Rear film format','6×9',(-26,40.1,97),4,trim,(pi/2,0,pi))
 text('Rear origin','MADE IN JAPAN',(-64,42,97),1.75,trim,(pi/2,0,pi))
 box('Back release slider recess',(-85,43.5,94),(13,.7,2.7),insert,.4)
 box('Back release tab',(-83,44.4,94),(4,1.4,2.4),trim,.4)
 return [(-290,410,230),(0,500,55),(190,260,410),(230,-370,220)],['rear_oblique','rear_elevation','top_controls','attachment_face']

positions,names={'body':body,'lens':lens,'film_back':film_back}[PART]()
# The review studio belongs only to this component file.
bpy.context.view_layer.update()
visible=[o for o in g.objects if o.type in {'MESH','CURVE','FONT'}]
points=[];dg=bpy.context.evaluated_depsgraph_get()
for o in visible:
 eo=o.evaluated_get(dg);me=eo.to_mesh();points.extend(eo.matrix_world@v.co for v in me.vertices);eo.to_mesh_clear()
zmin=min(p.z for p in points)
floor_z=zmin*1000-.5
floor=lathe('Review floor',[(r,floor_z+h) for r,h in [(0,0),(500,0),(700,0),(800,6),(900,30),(1000,70),(1100,130),(1200,220),(1300,360),(1380,550),(1420,800),(1420,1800)]],mat('Studio matte floor',.46),'Z',N=192)
for c in list(floor.users_collection):c.objects.unlink(floor)
studio.objects.link(floor);floor.parent=None
center=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)))
for i,(position,title) in enumerate(zip(positions,names),1):
 d=bpy.data.cameras.new(f'CAM {i:02d} {title}');cam=bpy.data.objects.new(d.name,d);studio.objects.link(cam);cam.location=Vector(position)*.001
 cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.clip_start=.001;d.clip_end=50
 bpy.context.view_layer.update();local=[cam.matrix_world.inverted()@p for p in points];x0,x1=min(p.x for p in local),max(p.x for p in local);y0,y1=min(p.y for p in local),max(p.y for p in local)
 cam.location+=cam.rotation_euler.to_matrix()@Vector(((x0+x1)/2,(y0+y1)/2,0));d.ortho_scale=max(x1-x0,y1-y0)/.78
for n,p,power,size in [('Large key',(-250,-350,450),8,.3),('Right fill',(300,-50,280),4,.3),('Rear softbox',(-200,330,400),7,.3)]:
 d=bpy.data.lights.new(n,'AREA');d.energy=power*.18;d.shape='DISK';d.size=size;o=bpy.data.objects.new(n,d);studio.objects.link(o);o.location=Vector(p)*.001;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
s.world=bpy.data.worlds.new('Neutral studio world');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.5,.5,.5,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.18
s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=True;s.render.threads_mode='AUTO'
s.render.resolution_x=s.render.resolution_y=1400;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.view_settings.view_transform='AgX'
s.camera=bpy.data.objects['CAM 01 '+names[0]];s.render.filepath=f'//renders/{PART}_01_{names[0]}.png'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='SOLID';area.spaces.active.region_3d.view_distance=max(.2,s.camera.data.ortho_scale*1.3);area.spaces.active.region_3d.view_location=center
bpy.context.view_layer.update()
report={'component':PART,'source_photos':root['references'],'working_envelope_mm':root['working_envelope_mm'],'scene':s.name,'model_objects':len(g.objects),'cameras':names,'assembled':False,'materials':'Neutral grayscale; finish textures and fine painted scales intentionally deferred.'}
with open(os.path.join(OUT,PART+'_study.json'),'w') as f:json.dump(report,f,indent=2)
# Open each file with only its component visible in the working viewport.
for obj in studio.objects:obj.hide_set(True)
bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
root.empty_display_size=.012
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_rotation=s.camera.rotation_euler.to_quaternion()
   area.spaces.active.region_3d.view_perspective='ORTHO'
s.view_settings.exposure=.35
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,PART+'_study.blend'))
print(json.dumps(report),flush=True)
