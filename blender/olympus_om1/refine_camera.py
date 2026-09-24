"""Reference-based Olympus OM-1 repairs; run on intermediates/source.blend.

Local Blender CLI. Keep original UVs, leather, optics and overall scan silhouette.
Only selected metal/inscription fields are smoothed. Editable lettering and added
controls remain separate. Measurements are visual estimates from supplied photos.
"""
from pathlib import Path
import bpy,numpy as np,math,json,hashlib,sys
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir
out=output_dir('blender/olympus_om1')
for sub in ['intermediates','exports','previews']:(out/sub).mkdir(exist_ok=True)
parent=Path(bpy.data.filepath);source_sha=hashlib.sha256(parent.read_bytes()).hexdigest()
ob=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices));ob.name='Olympus OM-1 | preserved Tripo camera'
me=ob.data;assert len(me.vertices)==988799,'Start from the original inspected source'
co=np.empty((len(me.vertices),3),np.float32);me.vertices.foreach_get('co',co.ravel());original=co.copy()
loops=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',loops);faces=loops.reshape(-1,3)
uv=np.empty(len(loops)*2,np.float32);me.uv_layers[0].data.foreach_get('uv',uv);uv_sha=hashlib.sha256(uv.tobytes()).hexdigest()
x,y,z=original.T;cx,cz=.0408,.2203;r=np.hypot(x-cx,z-cz)
materials=[]
def material(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;materials.append(m);return m
silver=material('Smooth satin aluminum',(.48,.49,.50),.82,.32)
chrome=material('Polished control edges',(.58,.60,.62),.92,.2)
black=material('Black enamel and engraved pigment',(.008,.009,.011),.15,.34)
white=material('Ivory lens and dial lettering',(.82,.80,.70),.05,.42)
gray=material('Recessed gray engraving',(.10,.105,.11),.55,.5)
yellow=material('Yellow imperial distance markings',(.95,.49,.045),.05,.4)
green=material('Green focal length enamel',(.02,.42,.08),.05,.4)
red=material('Red lens alignment',(.55,.01,.005),.05,.4)
blue=material('Blue slow shutter numbers',(.025,.1,.19),.05,.4)
brass=material('Tripod threaded brass interior',(.24,.16,.07),.8,.28)
# Split off a material with subdued normal-map strength for scan surfaces.
scan=me.materials[0]
for node in scan.node_tree.nodes:
 if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.24

def rect(a,b,lo1,hi1,lo2,hi2,f=.005):
 return np.clip(np.minimum.reduce([a-lo1,hi1-a,b-lo2,hi2-b])/f,0,1)
# Continuous metal fields. Raised controls and leather/knurling are excluded.
fascia=rect(x,z,-.466,.466,.390,.472)*np.clip((.086-y)/.008,0,1)*np.clip((y-.049)/.004,0,1)
fascia*=np.clip((np.hypot(x+.226,z-.404)-.039)/.006,0,1)
rear=rect(x,z,-.466,.466,.413,.474)*(y>.264)
rear*=0  # Preserve the already smooth rear fascia and its original boundary.
prism=(z>.475)&(z<.603)&(y<.15)&(y>-.04)&(np.abs(x-.039)<.158)
# Avoid mount face below the logo and black accessory shoe at the rear.
prism=prism.astype(float)
prism[np.hypot(x+.154,y-.159)<.084]=0
prism[(y>.126)&(z>.574)]=0
plate=(z>.466)&(z<.482)&(y>.063)&(y<.282)&(np.abs(x)>.16)&(np.abs(x)<.466)
base=(z<.006)&(y>.060)&(y<.300)
name=rect(x,z,-.096,.178,.466,.515,.003)*(y<.005)*(y>-.039)
lens=np.clip((r-.122)/.004,0,1)*np.clip((.166-r)/.004,0,1)*(y<-.271)
# Original barrel markings are inaccurate. Keep knurled sections untouched.
band_specs=[('Shutter speed collar',-.066,-.030,silver),('Depth of field collar',-.103,-.075,silver),('Focus distance collar',-.126,-.104,black),('Aperture collar',-.261,-.235,black)]
bands=[]
for name_b,lo,hi,mat in band_specs:
 w=np.clip(np.minimum(y-lo,hi-y)/.002,0,1)*np.clip((r-.185)/.005,0,1)
 bands.append((name_b,w,mat))
# Replace the false rewind face, switch field and ASA disk, preserving outer rims.
asa=np.clip((.063-np.hypot(x+.154,y-.159))/.004,0,1)*(z>.519)
rewind=np.clip((.070-np.hypot(x-.347,y-.174))/.003,0,1)*(z>.495)
switch=rect(x,y,.165,.274,.105,.258,.003)*((z>.476)&(z<.574))
weight=np.maximum.reduce([fascia,rear,prism*.85,plate.astype(float),base.astype(float),name,lens,asa,rewind,switch.astype(float),*[w*.7 for _,w,_ in bands]])
# Seam-coherent Taubin smoothing retains source topology and the UV layout.
_,representative,weld=np.unique(np.round(co,6),axis=0,return_index=True,return_inverse=True)
pos=co[representative].astype(np.float64);start=pos.copy();w=np.ones(len(pos));np.minimum.at(w,weld,weight)
ev=np.empty(len(me.edges)*2,np.int32);me.edges.foreach_get('vertices',ev);edges=np.unique(np.sort(weld[ev.reshape(-1,2)],axis=1),axis=0);edges=edges[edges[:,0]!=edges[:,1]]
a,b=edges.T;src=np.r_[a,b];dst=np.r_[b,a];degree=np.maximum(np.bincount(src,minlength=len(pos)),1)
for _ in range(18):
 for strength in (.5,-.48):
  avg=np.column_stack([np.bincount(src,weights=pos[dst,k],minlength=len(pos))/degree for k in range(3)])
  pos+=strength*w[:,None]*(avg-pos)
delta=pos-start;length=np.linalg.norm(delta,axis=1);delta*=np.minimum(1,.0025/np.maximum(length,1e-12))[:,None];co=original+delta[weld]
# Level erroneous relief only within inscription/control fields.
co[:,1]+=(.0621-co[:,1])*fascia*.95
co[:,1]+=(.2784-co[:,1])*rear*.95
co[:,2]+=(.477-co[:,2])*plate*.9
# The underside was already planar: preserve its geometry.
name_plane=lambda xx,zz:.0038082*xx+.1283438*zz-.08651358
co[:,1]+=(name_plane(x,z)-co[:,1])*name
co[:,1]+=(-.2904-co[:,1])*lens
co[:,2]+=(.5290-co[:,2])*asa
co[:,2]+=(.5278-co[:,2])*rewind
co[:,2]+=(.4757-co[:,2])*switch
# Remove false raised lettering from each collar using a robust smooth radial fit.
# Fourier terms preserve the scan's gentle ellipse and center offset; y preserves taper.
band_fits=[]
angle=np.arctan2(z-cz,x-cx)
radial_basis=np.column_stack([np.ones(len(co)),np.cos(angle),np.sin(angle),np.cos(2*angle),np.sin(2*angle),y])
for band_name,ww,mat in bands:
 sample=ww>.95
 aa=radial_basis[sample];rr=r[sample]
 coeff=np.linalg.lstsq(aa,rr,rcond=None)[0]
 for _ in range(4):
  residual=rr-aa@coeff;keep=np.abs(residual-np.median(residual))<.004
  coeff=np.linalg.lstsq(aa[keep],rr[keep],rcond=None)[0]
 target=radial_basis@coeff
 amount=ww
 scale=(r+(target-r)*amount)/np.maximum(r,1e-8)
 co[:,0]=cx+(co[:,0]-cx)*scale;co[:,2]=cz+(co[:,2]-cz)*scale
 band_fits.append({'name':band_name,'fitted_vertices':int(sample.sum()),'coefficients':coeff.tolist()})
ids=np.zeros(len(faces),np.int32)
def assign(weights,mat,threshold=.35):
 if mat.name not in me.materials:me.materials.append(mat)
 idx=me.materials.find(mat.name);ids[np.mean(weights[faces],axis=1)>threshold]=idx
assign(np.maximum.reduce([fascia,rear,prism,plate.astype(float),base.astype(float),name]),silver)
for _,ww,mat in bands:assign(ww,mat)
# Match the connected shoulder walls, bevels and ends to the same satin metal.
shoulder=((z>.386)&(z<.484)&(y>.047)&(y<.294))
shoulder &= ((y<.105)|(np.abs(x)>.431))
assign(shoulder.astype(float),silver)
assign(lens,black);assign(asa,black);assign(rewind,silver);assign(switch.astype(float),silver)
me.vertices.foreach_set('co',co.astype(np.float32).ravel());me.polygons.foreach_set('material_index',ids);me.update()
# Regenerate geometric normals after smoothing; no baked corrugation on metal.
if me.has_custom_normals:
 bpy.context.view_layer.objects.active=ob;bpy.ops.mesh.customdata_custom_splitnormals_clear()
for poly in me.polygons:poly.use_smooth=True
# Weld normals virtually across duplicate UV-seam vertices.
fc=np.cross(co[faces[:,1]]-co[faces[:,0]],co[faces[:,2]]-co[faces[:,0]])
fw=weld[faces]
normals=np.column_stack([np.bincount(fw.ravel(),weights=np.repeat(fc[:,k],3),minlength=len(pos)) for k in range(3)])
normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
loop_normals=normals[weld[loops]]
for (band_name,ww,_),fit in zip(bands,band_fits):
 coeff=np.array(fit['coefficients']);rr=radial_basis@coeff
 derivative=-coeff[1]*np.sin(angle)+coeff[2]*np.cos(angle)-2*coeff[3]*np.sin(2*angle)+2*coeff[4]*np.cos(2*angle)
 analytic=np.column_stack([np.cos(angle)+derivative/rr*np.sin(angle),np.full(len(co),-coeff[5]),np.sin(angle)-derivative/rr*np.cos(angle)])
 analytic/=np.maximum(np.linalg.norm(analytic,axis=1)[:,None],1e-12)
 blend=ww[loops,None];loop_normals=loop_normals*(1-blend)+analytic[loops]*blend
loop_normals/=np.maximum(np.linalg.norm(loop_normals,axis=1)[:,None],1e-12)
blend=np.maximum(plate.astype(float),switch)[loops,None]
loop_normals=loop_normals*(1-blend)+np.array([0,0,1])*blend
me.normals_split_custom_set(loop_normals)
check=np.empty_like(uv);me.uv_layers[0].data.foreach_get('uv',check);assert hashlib.sha256(check.tobytes()).hexdigest()==uv_sha
print('SMOOTHING DONE',flush=True)
# Build a BVH for accurately positioning small barrel markings on the actual scan.
bvh=BVHTree.FromPolygons(co.tolist(),faces.tolist(),all_triangles=True)
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
boldpath='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font=bpy.data.fonts.load(fontpath);bold=bpy.data.fonts.load(boldpath);cap_heights={}
def text(name,body,loc,height,mat,width=None,basis=None,boldface=False):
 cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.align_x='CENTER';cu.align_y='CENTER';cu.size=1;cu.resolution_u=6;cu.font=bold if boldface else font
 obj=bpy.data.objects.new(name,cu);bpy.context.scene.collection.objects.link(obj);cu.materials.append(mat)
 if cu.font.name not in cap_heights:
  cu.body='H';bpy.context.view_layer.update();cap_heights[cu.font.name]=obj.dimensions.y;cu.body=body
 bpy.context.view_layer.update();raw_width=obj.dimensions.x;obj.scale=(height/cap_heights[cu.font.name],)*3
 if width:obj.scale.x=width/max(raw_width,1e-8)
 obj.location=loc
 if basis is not None:obj.rotation_euler=Matrix(basis).transposed().to_euler()
 return obj
front_basis=[(1,0,0),(0,0,1),(0,-1,0)]
top_basis=[(1,0,0),(0,1,0),(0,0,1)]
bottom_basis=[(1,0,0),(0,-1,0),(0,0,-1)]
# OLYMPUS wordmark fits the existing badge rather than adding a new badge.
logo=text('OLYMPUS front wordmark','OLYMPUS',(.040,-.03,.490),.026,black,width=.213,basis=front_basis,boldface=True)
# Tilt onto the measured original badge plane.
logo.location.y=name_plane(.04,.490)-.0006
logo.rotation_euler=Matrix([(1,.0038082,0),(0,.1283438,1),(0,-1,.1283438)]).transposed().to_euler()
text('Front rewind release R','R',(-.281,.0610,.405),.013,black,basis=front_basis)
# Individually editable lens characters follow the photographed clockwise inscription.
label='OLYMPUS  OM-SYSTEM  ZUIKO  AUTO-S  50mm  1:1.8  made in Japan'
widths=[.45 if ch in ' ilI1:.' else .8 if ch in 'MWm' else .64 for ch in label]
span=math.radians(338);total=sum(widths);angle=math.radians(184)
for i,(ch,cw) in enumerate(zip(label,widths)):
 da=span*cw/total;theta=angle-da/2;angle-=da
 if ch==' ':continue
 rr=.1458;loc=(cx+rr*math.cos(theta),-.2911,cz+rr*math.sin(theta))
 basis=[(math.sin(theta),0,-math.cos(theta)),(math.cos(theta),0,math.sin(theta)),(0,-1,0)]
 text(f'Lens inscription {i:02d} {ch}',ch,loc,.0118,white,basis=basis)
# Barrel scales projected radially to the retained ring surface.
def barrel_label(name,label,theta_deg,yy,h,mat):
 theta=math.radians(theta_deg);rad=Vector((math.cos(theta),0,math.sin(theta)));origin=Vector((.04,yy,.226))+rad*.35
 hit,normal,_,_=bvh.ray_cast(origin,-rad,.3)
 if hit is None:raise RuntimeError('No barrel surface for '+name)
 loc=hit+rad*.0008
 return text(name,label,loc,h,mat,basis=[(math.sin(theta),0,-math.cos(theta)),(0,1,0),tuple(rad)])
for angle,label in zip(np.linspace(155,25,12),['1000','500','250','125','60','30','15','8','4','2','1','B']):barrel_label('Shutter '+label,label,float(angle),-.048,.0115,black if label in ['1000','500','250','125','60'] else blue)
for angle,label in zip([126,113,102,90,78,67,54],['16','8','4','|','4','8','16']):barrel_label('Depth of field '+str(angle),label,angle,-.088,.010,red if label=='|' else black)
for angle,label in zip([135,115,96,78,61,42,24],['∞','10','5','3','2','1.5','1']):barrel_label('Focus metres '+label,label,angle,-.115,.010,white)
for angle,label in zip([136,111,88,66,46],['ft','30','12','6','4']):barrel_label('Focus feet '+label,label,angle,-.122,.007,yellow)
for angle,label in zip([144,125,107,90,73,55,35],['1.8','2.8','4','5.6','8','11','16']):barrel_label('Aperture '+label,label,angle,-.248,.014,white)
barrel_label('Lens focal length','50mm',171,-.247,.015,green)
serial=barrel_label('Lens serial 5225581','JAPAN  5225581',270,-.086,.009,gray)
serial.rotation_euler=(serial.rotation_euler.to_quaternion() @ Quaternion((0,0,1),math.pi)).to_euler()
# Simple construction helpers, all separate editable pieces.
def cylinder(name,loc,radius,depth,mat,rotation=(0,0,0),vertices=96):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc,rotation=rotation);o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 bevel=o.modifiers.new('Machined edge','BEVEL');bevel.width=.0007;bevel.segments=3
 o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');return o

def cube(name,loc,dims,mat,bevel=.001,angle=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.rotation_euler.z=angle;o.data.materials.append(mat)
 if bevel:m=o.modifiers.new('Rounded machining','BEVEL');m.width=bevel;m.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o

def ring(name,center,outer,inner,depth,mat):
 n=128;verts=[]
 for zz in [-depth/2,depth/2]:
  for rr in [outer,inner]:
   verts.extend([(center[0]+rr*math.cos(i*2*math.pi/n),center[1]+rr*math.sin(i*2*math.pi/n),center[2]+zz) for i in range(n)])
 fs=[]
 for i in range(n):
  j=(i+1)%n
  fs.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],fs);mesh.materials.append(mat);o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o)
 for p in mesh.polygons:p.use_smooth=p.index%4>=2
 return o
# ASA dial: original knurled side retained, restored black face and ordered markings.
cylinder('ASA dial black insert',(-.154,.159,.52925),.059,.0005,black)
values=['25','32','40','50','64','80','100','125','160','200','250','320','400','500','640','800','1000','1250','1600']
for i,value in enumerate(values):
 theta=math.radians(90-i*360/len(values));xx=-.154+.047*math.cos(theta);yy=.159+.047*math.sin(theta)
 tt=text('ASA '+value,value,(xx,yy,.5297),.0066,yellow if value in ['50','100','200','400','800','1600'] else white,width=.0137,basis=top_basis);tt.rotation_euler.z=theta-math.pi/2
text('ASA label','ASA',(-.154,.185,.5302),.008,white,basis=top_basis)
cylinder('ASA center button',(-.154,.15,.530),.018,.001,black)
# Rewind cap and folding crank. Preserve its original grooved rim.
cylinder('Rewind clean cap',(.347,.174,.5280),.0685,.0008,silver)
cube('Rewind folding crank',(.347,.174,.5305),(.133,.017,.004),chrome,.0014,angle=-.05)
# Meter switch and its two photographed positions.
cube('Restored meter switch seat',(.2195,.1815,.4770),(.111,.151,.001),silver,.0003)
cylinder('Meter switch bezel',(.214,.189,.481),.035,.005,chrome)
cylinder('Meter switch black insert',(.214,.189,.484),.030,.003,black)
cube('Meter ON OFF lever',(.214,.194,.489),(.012,.063,.010),chrome,.002,angle=.68)
text('Top OM-1','OM-1',(.235,.098,.4777),.027,black,width=.098,basis=top_basis,boldface=True).rotation_euler.z=math.pi
for body,xx,yy in [('ON',.171,.166),('OFF',.253,.226)]:text('Meter '+body,body,(xx,yy,.478),.011,black,basis=top_basis).rotation_euler.z=math.pi
# Rebuild accessory-shoe rail contact, where the original contact was missing.
cylinder('Hot shoe center contact',(.039,.192,.5963),.015,.0018,chrome)
# Underside: true open socket through the original flat plate.
print('DETAILS BUILT',flush=True)
bpy.context.view_layer.objects.active=ob
cutter=cylinder('Temporary tripod bore',(.018,.124,.009),.020,.036,black,vertices=64)
for m in list(cutter.modifiers):cutter.modifiers.remove(m)
mod=ob.modifiers.new('Open tripod socket','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
ring('Tripod socket lip',(.018,.124,.0006),.023,.0185,.003,chrome)
ring('Tripod internal wall',(.018,.124,.010),.0195,.0175,.020,brass)
# Actual helical thread relief inside the visible bore.
curve=bpy.data.curves.new('Tripod internal helix','CURVE');curve.dimensions='3D';curve.bevel_depth=.0010;curve.bevel_resolution=3
spline=curve.splines.new('POLY');n=640;spline.points.add(n-1)
for i,p in enumerate(spline.points):
 t=i/(n-1);theta=t*math.pi*2*5;p.co=(.018+.0178*math.cos(theta),.124+.0178*math.sin(theta),.002+t*.016,1)
thread=bpy.data.objects.new('Tripod internal threads',curve);bpy.context.scene.collection.objects.link(thread);curve.materials.append(brass)
cylinder('Tripod dark blind end',(.018,.124,.022),.018,.001,black)
# Battery cover with actual coin slot cut into its face.
ring('Battery cover circular seam',(-.357,.168,.0003),.056,.053,.002,gray)
cap=cylinder('Battery cover',(-.357,.168,-.0001),.0525,.004,silver)
slot=cube('Temporary battery coin slot',(-.357,.168,-.002),(.008,.064,.005),black,0,angle=-.25)
mod=cap.modifiers.new('Recessed coin slot','BOOLEAN');mod.operation='DIFFERENCE';mod.object=slot;bpy.context.view_layer.objects.active=cap;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(slot,do_unlink=True)
cube('Battery slot shadow',(-.357,.168,.0004),(.007,.062,.0003),gray,0,angle=-.25)
cylinder('Battery cover pinhole',(-.378,.154,-.0024),.0028,.0004,black,vertices=32)
for i,(xx,yy) in enumerate([(-.427,.167),(-.022,.124),(.058,.124),(.433,.215)]):
 cylinder('Underside screw '+str(i),(xx,yy,-.0001),.0072,.002,chrome,vertices=48)
 for theta in [.55,.55+math.pi/2]:cube('Screw cross recess '+str(i),(xx,yy,-.0013),(.010,.0017,.0003),black,.0003,theta)
text('Underside manufacturer','MADE IN JAPAN',(.167,.211,-.0007),.012,gray,width=.193,basis=bottom_basis)
text('Body serial 151067','151067',(.354,.212,-.0007),.013,gray,width=.079,basis=bottom_basis)
# Retain the source's already legible FIX mark on the rear accessory shoe.
# Conform the curved scale glyphs vertex-by-vertex to avoid burying their edges
# in the tapered collars. Keep hidden editable font sources alongside meshes.
for glyph in list(bpy.context.scene.objects):
 if glyph.type!='FONT' or not glyph.name.startswith(('Shutter ','Depth of field ','Focus metres ','Focus feet ','Aperture ','Lens focal length','Lens serial')):continue
 bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
 mesh=bpy.data.meshes.new_from_object(glyph.evaluated_get(graph),preserve_all_data_layers=True,depsgraph=graph)
 for v in mesh.vertices:
  world=glyph.matrix_world@v.co;rad=Vector((world.x-.04,0,world.z-.226)).normalized();origin=Vector((.04,world.y,.226))+rad*.36
  hit,_,_,_=bvh.ray_cast(origin,-rad,.3)
  if hit is None:raise RuntimeError('Could not conform '+glyph.name)
  v.co=hit+rad*.0010
 name=glyph.name;glyph.name=name+' | editable font';glyph.hide_render=True;glyph.hide_set(True)
 conformed=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(conformed)

for image in bpy.data.images:
 if image.users and not image.packed_file:image.pack()
report={'source_master':str(parent),'source_master_sha256':source_sha,'original_uv_sha256':uv_sha,'original_vertices':len(original),'original_faces':len(faces),'radial_band_fits':band_fits,'smoothed_vertices':int(np.count_nonzero(weight)),'unchanged_vertices_outside_masks':bool(np.array_equal(co[weight==0],original[weight==0])),'smoothing_max_displacement':float(np.max(np.linalg.norm(co-original,axis=1))),'added_objects':[o.name for o in bpy.context.scene.objects if o!=ob], 'reference_images':['front.jpg','lens.jpg','top.jpg','top2.jpg','bottom.jpg','back.jpg','left.jpg','right.jpg'],'limitations':['Hidden mechanical depths are visual estimates. Lettering uses a close font substitute; source photographs determine wording and placement.','Browser export works on separate copies; the full refined mesh is retained by default, with optional decimation for stricter budgets.']}
(out/'intermediates/refinement_report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'scene.blend'),compress=True)
print('SAVED REFINED MASTER',flush=True)
