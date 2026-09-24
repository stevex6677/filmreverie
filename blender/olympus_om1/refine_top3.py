"""Continue the current editable OM-1 master: top3 ASA dial and continuous top metal.
Run locally with Blender CLI on the previous scene.blend into a NEW output run.
"""
from pathlib import Path
import bpy, numpy as np, math, os, json, hashlib, ast, shutil
from mathutils import Matrix
out=Path(os.environ['FILM_PHOTO_OUTPUT_DIR']);out.mkdir(parents=True,exist_ok=False)
for s in ['intermediates','previews','exports']:(out/s).mkdir()
parent=Path(bpy.data.filepath);parent_hash=hashlib.sha256(parent.read_bytes()).hexdigest()
# Reuse only the established construction functions, not the original rebuild.
source=Path(__file__).with_name('refine_camera.py');tree=ast.parse(source.read_text())
helpers=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'text','cylinder','ring','cube'}],type_ignores=[])
exec(compile(helpers,str(source),'exec'))
font=bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
bold=bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');cap_heights={}
silver=bpy.data.materials['Smooth satin aluminum'];black=bpy.data.materials['Black enamel and engraved pigment'];white=bpy.data.materials['Ivory lens and dial lettering'];chrome=bpy.data.materials['Polished control edges']
yellow=bpy.data.materials['Yellow imperial distance markings'].copy();yellow.name='Pale yellow ASA full-stop values';yellow.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.76,.68,.25,1)
center_mat=black.copy();center_mat.name='ASA central release button';center_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.015,.016,.018,1)
ob=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices));me=ob.data
co=np.empty((len(me.vertices),3),np.float32);me.vertices.foreach_get('co',co.ravel());before=co.copy()
me.calc_loop_triangles();faces=np.array([t.vertices[:] for t in me.loop_triangles],dtype=np.int32)
tri_poly=np.array([t.polygon_index for t in me.loop_triangles],dtype=np.int32)
centers=np.array([p.center[:] for p in me.polygons]);x,y,z=centers.T
ids=np.empty(len(me.polygons),np.int32);me.polygons.foreach_get('material_index',ids);old_ids=ids.copy()
def index(mat):
 if mat.name not in me.materials:me.materials.append(mat)
 return me.materials.find(mat.name)
# Cover the COMPLETE prism and top cover. Prior small rectangular masks left
# old baked highlights interleaved with the new PBR metal on the same part.
top=(z>.466)&(y>-.044)&(y<.277)
# Exclude separate controls at their actual component bases, not texture colors.
controls=np.zeros(len(me.polygons),bool)
for xx,yy,rr,zz in [(-.154,.159,.073,.486),(.347,.174,.074,.486),(-.341,.174,.078,.483),(-.270,.116,.050,.485)]:
 controls|=(np.hypot(x-xx,y-yy)<rr)&(z>zz)
# Advance lever to the rear of the ASA dial is a separate black/silver part.
# The advance lever's silver part uses the same metal finish.
shoe=(x>-.054)&(x<.135)&(y>.124)&(y<.282)&(z>.476)
metal=top&~controls&~shoe
ids[metal]=index(silver)
# Accessory shoe is a separate black mounting block with continuous metal rails
# and floor. Keep its back inscription on the actual rear face.
shoe_metal=shoe&(z>.590)
ids[shoe&~shoe_metal]=index(black)
# Retain the original FIX inscription on the actual narrow rear lock face.
ids[shoe&(y>.254)&(y<.263)&(x>-.037)&(x<.114)&(z>.579)&(z<.590)]=0
ids[shoe_metal]=index(silver)
# New complete dial face; no old relief or stray chrome remains inside its rim.
vx,vy,vz=co.T;r=np.hypot(vx+.154,vy-.159)
face=(r<.065)&(vz>.519)
co[face,2]=.5350
# Join the shoulder planes across the former rectangular switch patch.
shoulder=(np.abs(vx)>.14)&(vy>.06)&(vy<.276)&(vz>.472)&(vz<.482)
co[shoulder,2]=.477
fc=np.hypot(x+.154,y-.159)<.065
ids[fc&(z>.519)]=index(black)
# Mild seam-coherent smoothing of the entire continuous prism, preserving edges
# and untouched camera parts. This also removes the old corrugated shading.
_,rep,weld=np.unique(np.round(co,6),axis=0,return_index=True,return_inverse=True)
mask=np.zeros(len(co),bool);mask[np.unique(faces[metal[tri_poly]])]=True
# Do not smooth dial/control boundaries or the already flat shoulder plane.
mask&=(co[:,2]>.484)&(co[:,1]<.26)&~face
weight=np.zeros(len(rep));np.maximum.at(weight,weld,mask.astype(float))
ev=np.empty(len(me.edges)*2,np.int32);me.edges.foreach_get('vertices',ev)
edges=np.unique(np.sort(weld[ev.reshape(-1,2)],axis=1),axis=0);edges=edges[edges[:,0]!=edges[:,1]]
a,b=edges.T;src=np.r_[a,b];dst=np.r_[b,a];degree=np.maximum(np.bincount(src,minlength=len(rep)),1)
pos=co[rep].astype(np.float64);start=pos.copy()
for _ in range(12):
 for strength in [.45,-.43]:
  avg=np.column_stack([np.bincount(src,weights=pos[dst,k],minlength=len(rep))/degree for k in range(3)])
  pos+=strength*weight[:,None]*(avg-pos)
delta=pos-start;delta*=np.minimum(1,.001/np.maximum(np.linalg.norm(delta,axis=1),1e-12))[:,None]
co+=delta[weld].astype(np.float32)
me.vertices.foreach_set('co',co.ravel());me.polygons.foreach_set('material_index',ids);me.update()
# Keep the separate black thumb piece on the advance lever.
paddle_centers=np.array([p.center[:] for p in me.polygons]);px,py,pz=paddle_centers.T
paddle=(px>-.292)&(px<-.125)&(py>.197)&(pz>.507)&(np.hypot(px+.154,py-.159)>.073)
ids[paddle]=index(black)
# The black mounting block has near-vertical walls. Its surrounding upward
# facing prism and shoulder surfaces remain silver, including the curved foot.
face_normals=np.array([p.normal[:] for p in me.polygons])
base_region=(px>-.054)&(px<.135)&(py>.124)&(py<.282)&(pz>.476)&(pz<=.590)
base_up=base_region&(np.abs(face_normals[:,2])>.45)
ids[base_up]=index(silver)
# Remove isolated dark scan triangles on the surrounding silver bevel.
black_faces=np.flatnonzero(base_region&(ids==index(black)))
parents={int(i):int(i) for i in black_faces};owners={}
def root(i):
 while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
 return i
for i in black_faces:
 i=int(i)
 for v in me.polygons[i].vertices:
  key=int(weld[v])
  if key in owners:parents[root(i)]=root(owners[key])
  else:owners[key]=i
sizes={}
for i in parents:sizes[root(i)]=sizes.get(root(i),0)+1
for i in parents:
 if sizes[root(i)]<24:ids[i]=index(silver);base_up[i]=True
me.polygons.foreach_set('material_index',ids)

# Preserve existing collar normals; regenerate smooth normals only on the top.
loop_normals=np.array([n.vector[:] for n in me.corner_normals],np.float32)
loops=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',loops)
fcross=np.cross(co[faces[:,1]]-co[faces[:,0]],co[faces[:,2]]-co[faces[:,0]])
fw=weld[faces];normals=np.column_stack([np.bincount(fw.ravel(),weights=np.repeat(fcross[:,k],3),minlength=len(rep)) for k in range(3)])
normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
selected=metal|shoe_metal|base_up
loop_mask=np.repeat(selected,[p.loop_total for p in me.polygons]);loop_normals[loop_mask]=normals[weld[loops[loop_mask]]]
me.normals_split_custom_set(loop_normals)
for obj in list(bpy.context.scene.objects):
 if obj.name.startswith('ASA '):bpy.data.objects.remove(obj,do_unlink=True)
# A smooth, actual insulating insert replaces the polygon-staircase mask.
# One outline avoids coplanar overlap between a circle and rectangular tail.
outline=[(.039+.025*math.cos(t),.192+.025*math.sin(t),.5962) for t in np.linspace(math.pi,2*math.pi,65)]
outline += [(.064,.258,.5962),(.014,.258,.5962)]
mesh=bpy.data.meshes.new('Shoe insulating insert');mesh.from_pydata(outline,[],[tuple(range(len(outline)))]);mesh.materials.append(black)
insert=bpy.data.objects.new('Shoe insulating insert',mesh);bpy.context.scene.collection.objects.link(insert)
# Replace the temporary switch patch with the complete shoulder's planar skin.
for obj in list(bpy.context.scene.objects):
 if obj.name=='Restored meter switch seat':bpy.data.objects.remove(obj,do_unlink=True)
outline=[]
for xx,yy,start in [(.449,.256,0),(.165,.256,90),(.165,.087,180),(.449,.087,270)]:
 for angle in np.linspace(start,start+90,17):
  t=math.radians(angle);outline.append((xx+.020*math.cos(t),yy+.020*math.sin(t),.4782))
mesh=bpy.data.meshes.new('Continuous right shoulder metal');mesh.from_pydata(outline,[],[tuple(range(len(outline)))]);mesh.materials.append(silver)
cover=bpy.data.objects.new('Continuous right shoulder metal',mesh);bpy.context.scene.collection.objects.link(cover)
cx,cy=-.154,.159
cylinder('ASA dial black insert',(cx,cy,.5354),.064,.0006,black)
ring('ASA central button seam',(cx,cy,.5360),.0251,.0241,.0004,chrome)
cylinder('ASA center button',(cx,cy,.5361),.0240,.0007,center_mat)
values=['25','32','40','50','64','80','100','125','160','200','250','320','400','500','640','800','1000','1250','1600']
for i,value in enumerate(values):
 theta=math.radians(90-i*18)
 obj=text('ASA '+value,value,(0,0,.5360),.0071,yellow if value in ['25','50','100','200','400','800','1600'] else white,boldface=True)
 obj.scale.x*=.9;bpy.context.view_layer.update();width=obj.dimensions.x
 radius=.059-width/2
 obj.location.x=cx+radius*math.cos(theta);obj.location.y=cy+radius*math.sin(theta)
 obj.rotation_euler.z=theta
for letter,angle in zip('ASA',[12,43,74]):
 theta=math.radians(angle)
 obj=text('ASA label '+letter+str(angle),letter,(cx+.031*math.cos(theta),cy+.031*math.sin(theta),.5360),.008,white,boldface=True)
 obj.rotation_euler.z=theta
bpy.data.objects['Hot shoe center contact'].location.z=.5975
for name in ['Top OM-1','Meter ON','Meter OFF']:bpy.data.objects[name].location.z=.4790
# Archive inherited source preservation report with explicit parent relation.
report=json.loads((parent.parent/'intermediates/refinement_report.json').read_text())
report['reference_images']=list(dict.fromkeys(report['reference_images']+['top3.HEIC']))
report['parent_master']=str(parent);report['parent_master_sha256']=parent_hash
report['top3_revision']={'reference':'top3.HEIC','material_faces_changed':int((ids!=old_ids).sum()),'dial_values':values,'layout':'radial text, constant cap height, shared outer radius, centered release button, arced ASA','geometry_vertices_changed':int(np.any(co!=before,axis=1).sum()),'continuous_shell_faces':int(metal.sum())}
(out/'intermediates/refinement_report.json').write_text(json.dumps(report,indent=2))
for fontdata in bpy.data.fonts:
 if fontdata.filepath and fontdata.filepath!='<builtin>':
  try:fontdata.pack()
  except RuntimeError:pass
bpy.ops.wm.save_as_mainfile(filepath=str(out/'scene.blend'),compress=True)
assert hashlib.sha256(parent.read_bytes()).hexdigest()==parent_hash
print(json.dumps(report['top3_revision']),flush=True)
