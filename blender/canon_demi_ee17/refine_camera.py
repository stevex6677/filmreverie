"""Scoped photo-based corrections. Always start from source.blend via Blender CLI.

Retains source topology/UV0. Coordinates and corner normals change only inside
recorded front-lettering, rear-label, top-control and underside masks.
"""
from pathlib import Path
import math,json,hashlib
import bpy,numpy as np
from mathutils import Vector
out=Path(bpy.data.filepath).parent
assert bpy.data.filepath.endswith('/source.blend')
ob=next(o for o in bpy.context.scene.objects if o.type=='MESH')
ob.name='Canon Demi EE17 | original Tripo with scoped repairs'
me=ob.data;n=len(me.vertices)
assert n==1015863
co=np.empty(n*3,np.float32);me.vertices.foreach_get('co',co);co=co.reshape(-1,3);original=co.copy()
li=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',li)
faces=li.reshape(-1,3);centers=original[faces].mean(axis=1)
norm=np.empty(len(li)*3,np.float32);me.corner_normals.foreach_get('vector',norm);norm=norm.reshape(-1,3)
original_norm=norm.copy()
uv0=np.empty(len(li)*2,np.float32);me.uv_layers[0].data.foreach_get('uv',uv0)
uv=np.zeros((len(li),2),np.float32);matids=np.zeros(len(faces),np.int32)
changed=np.zeros(n,bool);normal_changed=np.zeros(len(li),bool);records=[]
pix=.979248046875*1.12/1200;cz=.690643310546875/2
def project(x,view):
    if view=='front':return np.column_stack((600+x[:,0]/pix,600-(x[:,2]-cz)/pix))
    if view=='back':return np.column_stack((600-x[:,0]/pix,600-(x[:,2]-cz)/pix))
    return np.column_stack((600+x[:,0]/pix,600+x[:,1]/pix*(1 if view=='bottom' else -1)))
def rect(p,box,feather=3):
    l,t,r,b=box;return np.clip(np.minimum.reduce([p[:,0]-l,r-p[:,0],p[:,1]-t,b-p[:,1]])/feather,0,1)
def disk(p,c,r,feather=2):return np.clip((r-np.linalg.norm(p-c,axis=1))/feather,0,1)
def polygon(p,points):
    inside=np.zeros(len(p),bool)
    for a,b in zip(points,points[1:]+points[:1]):
        if a[1]==b[1]:continue
        inside^=((a[1]>p[:,1])!=(b[1]>p[:,1]))&(p[:,0]<(b[0]-a[0])*(p[:,1]-a[1])/(b[1]-a[1])+a[0])
    return inside.astype(float)
def material(name,color,metal=0,rough=.4,texture=None):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
    b.inputs['Specular IOR Level'].default_value=.22
    if texture:
        im=bpy.data.images.load(str(out/'textures'/texture));im.pack()
        node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;node.extension='EXTEND'
        un=m.node_tree.nodes.new('ShaderNodeUVMap');un.uv_map='Demi reference details'
        m.node_tree.links.new(un.outputs['UV'],node.inputs['Vector']);m.node_tree.links.new(node.outputs['Color'],b.inputs['Base Color'])
    return m
silver=material('Detail satin aluminum',(.19,.20,.21),.78,.3)
black=material('Black enamel',(.00275,.003,.003),.05,.42)
ink=material('Dark engraved slots',(.002,.003,.004),0,.5)
white=material('Warm white inlay',(.75,.74,.68),.08,.46)
def patch(name,view,weight,mat,box=(0,0,1200,1200),target=None):
    p=project(original,view);pc=project(centers,view)
    w=weight(p,original);wf=weight(pc,centers);ids=np.flatnonzero(wf>0)
    assert len(ids),name
    me.materials.append(mat);matids[ids]=len(me.materials)-1
    loops=(ids[:,None]*3+np.arange(3)).ravel();l,t,r,b=box
    uv[loops]=(p[li[loops]]-[l,t])/[r-l,b-t];uv[loops,1]=1-uv[loops,1]
    if target is not None:
        axis=1 if view in ('front','back') else 2
        values=target(original) if callable(target) else target
        co[:,axis]+=(values-co[:,axis])*w;changed[:]|=w>0
        direction={'front':(0,-1,0),'back':(0,1,0),'top':(0,0,1),'bottom':(0,0,-1)}[view]
        nw=w[li,None];norm[:]=norm*(1-nw)+np.array(direction)*nw;normal_changed[:]|=w[li]>0
    records.append({'name':name,'faces':len(ids),'vertices':int((w>0).sum()) if target is not None else 0})
def fit_plane(weight,view,axis):
    mask=weight(project(original,view),original)>.98
    other=[i for i in range(3) if i!=axis]
    a=np.column_stack((np.ones(mask.sum()),original[mask][:,other]));y=original[mask,axis]
    coef=np.linalg.lstsq(a,y,rcond=None)[0]
    for _ in range(5):
        residual=y-a@coef;keep=np.abs(residual-np.median(residual))<.001
        coef=np.linalg.lstsq(a[keep],y[keep],rcond=None)[0]
    return lambda x:coef[0]+x[:,other]@coef[1:]
# Front badge, black lens inscription annulus and aperture lettering only.
badge=lambda p,x:rect(p,(167,365,391,419),4)*(x[:,1]<-.05)*(x[:,1]>-.08)
patch('Front Canon badge','front',badge,material('Photographed Canon badge',(1,1,1),.15,.4,'badge.png'),(167,365,391,419),fit_plane(badge,'front',1))
def lens(p,x):
    r=np.linalg.norm((p-[610,668])/[148,149],axis=1)
    return np.clip((r-.67)/.025,0,1)*np.clip((1-r)/.025,0,1)*(x[:,1]<-.20)
lensmat=material('Front reference lens inscriptions',(1,1,1),0,.5,'lens.png')
patch('CANON LENS SH 30mm 1:1.7 and manufacturer ring','front',lens,lensmat,(391,448,828,885),fit_plane(lens,'front',1))
def aperture(p,x):
    r=np.linalg.norm(p-[610,668],axis=1)
    w=np.clip((r-156)/4,0,1)*np.clip((194-r)/4,0,1)*(x[:,1]<-.209)
    for c in [(776,606),(448,733)]:w*=np.clip((np.linalg.norm(p-c,axis=1)-12)/4,0,1)
    return w
patch('AUTO aperture scale and its continuous silver annulus','front',aperture,material('Photographed aperture annulus',(1,1,1),.52,.35,'lens.png'),(391,448,828,885),fit_plane(aperture,'front',1))
rear=lambda p,x:rect(p,(272,525,891,550),2)*(x[:,1]>.211)
patch('Rear manufacturer and photographed serial','back',rear,material('Rear reference inscription',(1,1,1),.1,.43,'rear.png'),(272,525,891,550),fit_plane(rear,'back',1))
# Restore the missing black top inset, preserving perimeter, knobs and shoe rails.
top_outline=[(167,465),(335,414),(643,414),(647,420),(992,424),(1080,478),(1080,588),(1031,610),(430,618),(422,635),(333,635),(314,612),(170,610)]
def topfield(p,x):
    w=polygon(p,top_outline)*(x[:,2]>.613)*(x[:,2]<.647)
    w*=~((p[:,0]>644)&(p[:,0]<829)&(p[:,1]>419)&(p[:,1]<608))
    w*=np.linalg.norm(p-[969,519],axis=1)>93
    w*=np.linalg.norm(p-[377,590],axis=1)>57
    return w
patch('Top black enamel inset backing','top',topfield,black,target=lambda x:np.minimum(x[:,2],.637))
# A single rectified wordmark on the restored inset, oriented as in top.jpg.
toplogo=material('Photographed demi EE17',(1,1,1),.05,.42,'top-logo.png')
patch('Remove false front-top inscription','top',lambda p,x:rect(p,(475,607,645,645),6)*np.clip((x[:,2]-.633)/.005,0,1)*(x[:,2]<.647),black,target=.637)
lever=lambda p,x:rect(p,(139,363,432,608),4)*np.clip((x[:,2]-.651)/.004,0,1)
patch('Advance lever smooth face','top',lever,silver,target=.657)
patch('Shoe floor remove false contact relief','top',lambda p,x:rect(p,(679,428,794,597),3)*(x[:,2]>.634),silver,target=.6386)
patch('Rewind control face','top',lambda p,x:disk(p,(969,519),80,4)*np.clip((x[:,2]-.653)/.006,0,1),silver,target=.6615)
patch('Shutter release central recess','top',lambda p,x:disk(p,(377,590),19,1)*(x[:,2]>.673),ink,target=.678)
# The upper barrel scales are visible in top.jpg. Keep the fluted grip and
# optics; level only the smooth, inscribed upper sectors to their fitted radius.
for name,region in [('Focus distance',(415,706,813,732)),('Shutter speed',(417,735,702,782))]:
    weight=lambda p,x,region=region:rect(p,region,5)*(x[:,2]>.37)*(x[:,2]<.504)*(np.abs(np.sqrt((x[:,0]-.00914)**2+(x[:,2]-.28317)**2)-.214)<.008)
    valid=weight(project(original,'top'),original)>.98
    radii=np.sqrt((original[valid,0]-.00914)**2+(original[valid,2]-.28317)**2)
    radius=float(np.median(radii))
    patch(name+' smooth inscription band','top',weight,silver,target=lambda x,r=radius:x[:,2]+np.clip(.28317+np.sqrt(np.maximum(r*r-(x[:,0]-.00914)**2,.001))-x[:,2],-.002,.002))
# Underside source is nearly featureless and its lone latch is hallucinated.
bottompoly=[(85,630),(131,630),(163,580),(940,572),(990,582),(1027,624),(1103,619),(1103,735),(1040,741),(1023,691),(994,668),(960,668),(937,690),(893,790),(182,801),(148,787),(121,751),(85,748)]
# Remove the old protruding false latch only inside its replacement control footprint.
patch('Underside continuous silver face','bottom',lambda p,x:rect(p,(92,534,1094,827),12)*np.clip((.047-x[:,2])/.007,0,1),silver,target=.038)
patch('Underside latch seat','bottom',lambda p,x:rect(p,(197,532,365,730),12)*np.clip((.075-x[:,2])/.01,0,1),silver,target=.038)
me.vertices.foreach_set('co',co.ravel());me.polygons.foreach_set('material_index',matids);me.update()
layer=me.uv_layers.new(name='Demi reference details');layer.data.foreach_set('uv',uv.ravel())
me.uv_layers.active_index=0;me.uv_layers[0].active_render=True
# Derive repaired normals from the corrected geometry, including control walls.
# Retain original custom normals everywhere outside the modification mask.
me.normals_split_custom_set(np.zeros_like(norm))
geometric=np.empty_like(norm);me.corner_normals.foreach_get('vector',geometric.ravel())
norm[normal_changed]=geometric[normal_changed]
me.normals_split_custom_set(norm)
def pos(view,x,y,z):return ((x-600)*pix,(y-600)*pix*(1 if view=='bottom' else -1),z)
def cyl(name,view,x,y,r,z,depth,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r*pix,depth=depth,location=pos(view,x,y,z))
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    mod=o.modifiers.new('Machined edge','BEVEL');mod.width=.0008;mod.segments=3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons:f.use_smooth=abs(f.normal.z)<.5
    return o
def box(name,view,x,y,w,h,z,depth,mat,bevel=.0008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos(view,x,y,z));o=bpy.context.object;o.name=name
    o.dimensions=(w*pix,h*pix,depth);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def ring(name,view,x,y,outer,inner,z,depth,mat,arc=(0,360)):
    steps=max(16,int((arc[1]-arc[0])/3));verts=[];faces=[]
    for i in range(steps+1):
        a=math.radians(arc[0]+(arc[1]-arc[0])*i/steps)
        for radius,zz in [(outer,z-depth/2),(inner,z-depth/2),(outer,z+depth/2),(inner,z+depth/2)]:
            verts.append(pos(view,x+radius*math.cos(a),y+radius*math.sin(a),zz))
    for i in range(steps):
        j=i*4;k=j+4
        faces.extend([(j,k,k+1,j+1),(j+2,j+3,k+3,k+2),(j,j+2,k+2,k),(j+1,k+1,k+3,j+3)])
    faces.extend([(0,1,3,2),(steps*4,steps*4+2,steps*4+3,steps*4+1)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(mat);return o
def label(name,text,view,x,y,z,width,height,rotation=0,mat=white):
    cu=bpy.data.curves.new(name,'FONT');cu.body=text;cu.align_x='CENTER';cu.align_y='CENTER';cu.size=1
    o=bpy.data.objects.new(name,cu);bpy.context.scene.collection.objects.link(o);o.location=pos(view,x,y,z)
    bpy.context.view_layer.update();o.scale=(width*pix/max(o.dimensions.x,1e-8),height*pix/max(o.dimensions.y,1e-8),1);cu.materials.append(mat)
    o.rotation_euler=(math.pi if view=='bottom' else 0,0,rotation)
    return o
def cut_slot(o,view,x,y,w,h,z,depth):
    cutter=box('Temporary slot cutter',view,x,y,w,h,z,depth,ink,.0003)
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Recessed coin slot','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
def panel(name,view,points,z,mat,depth):
    from mathutils.geometry import tessellate_polygon
    outline=[]
    for i,b in enumerate(points):
        a=Vector(points[i-1]);b=Vector(b);c=Vector(points[(i+1)%len(points)])
        r=min(10,(a-b).length*.3,(c-b).length*.3)
        start=b+(a-b).normalized()*r;end=b+(c-b).normalized()*r
        for j in range(7):
            t=j/6;v=(1-t)**2*start+2*(1-t)*t*b+t*t*end
            outline.append(Vector(pos(view,v.x,v.y,0)))
    count=len(outline);verts=[(v.x,v.y,z+d) for d in [-depth/2,depth/2] for v in outline]
    lookup={tuple(v):i for i,v in enumerate(outline)};faces=[]
    for tri in tessellate_polygon([outline]):
        ids=[v if isinstance(v,int) else lookup[tuple(v)] for v in tri];faces.append(tuple(reversed(ids)));faces.append(tuple(i+count for i in ids))
    faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(mat);return o
panel('Top inset continuous enamel plate','top',[(167,465),(335,414),(643,414),(647,420),(992,424),(1080,478),(1080,588),(1031,610),(830,610),(645,641),(464,641),(430,618),(422,635),(333,635),(314,612),(170,610)],.6388,black,.004)
box('Shoe continuous floor','top',736,511,112,168,.6419,.0015,silver,.0005)
# Wordmark plane is flush with the black plate, with the original photo pigment.
verts=[pos('top',x,y,.6411) for x,y in [(459,472),(628,472),(628,582),(459,582)]]
mesh=bpy.data.meshes.new('demi EE17 inlay');mesh.from_pydata(verts,[],[(0,3,2,1)]);mesh.materials.append(toplogo)
o=bpy.data.objects.new(mesh.name,mesh);bpy.context.scene.collection.objects.link(o)
layer=mesh.uv_layers.new(name='Demi reference details')
for loop in mesh.loops:layer.data[loop.index].uv=[(0,1),(1,1),(1,0),(0,0)][loop.vertex_index]
panel('Bottom silver seat over flattened old latch','bottom',[(113,559),(140,544),(1059,544),(1083,562),(1090,789),(1068,814),(140,814),(111,789)],.0372,silver,.0005)
panel('Bottom inset continuous enamel plate','bottom',[(110,635),(139,635),(173,586),(923,581),(985,589),(1026,631),(1080,631),(1080,726),(1045,732),(1019,689),(991,671),(959,676),(934,702),(889,786),(185,791),(152,777),(121,744),(110,740)],.0365,black,.001)
# The advance cap seam and its two pin holes.
ring('Advance pivot engraved seam','top',237,506,78,76.5,.6572,.0003,ink)
for x,y in [(207,461),(270,551)]:cyl('Advance cap pin recess','top',x,y,3,.6573,.0003,ink)
# Rewind lever and the opening beneath it.
box('Rewind folding lever slot','top',969,519,36,154,.662,.001,ink,.003)
box('Rewind folding lever','top',969,519,27,145,.665,.005,silver,.002)
# The cable-release bore uses concentric visible thread crests within the existing button.
for i in range(4):ring('Cable release internal thread','top',377,590,18.6,16.8,.680+i*.0022,.00065,silver)
def barrel_inlay(name,box,radius):
    left,back,right,front=box
    a=math.asin((left-610)*pix/radius);b=math.asin((right-610)*pix/radius)
    vertices=[];quads=[]
    for i in range(97):
        theta=a+(b-a)*i/96
        for yy in [back,front]:vertices.append((.00914+radius*math.sin(theta),-(yy-600)*pix,.28317+radius*math.cos(theta)))
    for i in range(96):quads.append((i*2,i*2+1,i*2+3,i*2+2))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],quads);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(silver)
    for face in mesh.polygons:face.use_smooth=True
barrel_inlay('Smooth focus scale inlay',(419,706,804,731),.220)
barrel_inlay('Smooth shutter scale inlay',(421,738,701,780),.218)
def conform_text(o,view):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH');o=bpy.context.object
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for v in o.data.vertices:
        if view=='top' and o.name.startswith(('Focus feet','Shutter ')):
            radius=.22025 if o.name.startswith('Focus feet') else .21825
            v.co.z=.28317+math.sqrt(radius**2-(v.co.x-.00914)**2)
            continue
        origin=Vector((v.co.x,v.co.y,1 if view=='top' else -.2));direction=Vector((0,0,-1 if view=='top' else 1))
        hit,point,normal,index=ob.ray_cast(origin,direction)
        assert hit
        v.co.z=point.z+(.00025 if view=='top' else -.00025)
    return o
green=material('Distance feet green infill',(.035,.16,.045),0,.5)
red=material('Shutter bulb red infill',(.3,.025,.018),0,.5)
for i,text in enumerate(['30','15','10','7','5','3.5','2.6']):
    conform_text(label('Focus feet '+text,text,'top',448+i*48,713,1,20 if len(text)>1 else 11,12,math.pi,green),'top')
for i,text in enumerate(['B','8','15','30','60','125','250','500']):
    conform_text(label('Shutter '+text,text,'top',435+i*34,761,1,25 if len(text)==3 else 19 if len(text)==2 else 10,16,math.pi,red if text=='B' else ink),'top')
seiko=label('SEIKO underside lens signature','SEIKO','bottom',610,390,-.2,105,22,0,ink)
conform_text(seiko,'bottom')
# Bottom controls follow bottom.jpg, positions calibrated to the preserved shell.
ring('Bottom latch mounting rim','bottom',279,654,64,52,.022,.019,silver,arc=(175,365))
cap=cyl('Bottom coin latch','bottom',279,656,49,.020,.021,silver)
cut_slot(cap,'bottom',279,656,9,108,.008,.009)
box('Latch slot recessed shadow','bottom',279,656,8,93,.013,.0005,ink)
cyl('Rewind release black seat','bottom',405,693,43,.035,.003,ink)
cyl('Rewind release button','bottom',405,685,27,.027,.016,silver)
cyl('ASA DIN dial outer seat','bottom',557,685,79,.035,.003,ink)
dial=ring('ASA DIN photographed scale ring','bottom',557,685,77,52,.031,.005,material('Reference ASA DIN scale',(1,1,1),0,.5,'bottom-dial.png'))
layer=dial.data.uv_layers.new(name='Demi reference details')
for loop in dial.data.loops:
    xyz=np.array([dial.data.vertices[loop.vertex_index].co]);p=project(xyz,'bottom')[0]
    layer.data[loop.index].uv=((p[0]-478)/158,1-(p[1]-606)/158)
cyl('ASA DIN knurled center','bottom',557,685,43,.023,.019,black)
for i in range(48):
    a=i*math.tau/48
    o=box('Film speed dial grip','bottom',557+45*math.cos(a),685+45*math.sin(a),2,12,.027,.006,silver,.0003);o.rotation_euler.z=-a+math.pi/2
for x,y in [(541,700),(574,669)]:cyl('Film-speed central pin recess','bottom',x,y,3.5,.0129,.0003,ink)
for x in [482,632]:
    sc=cyl('ASA scale fixing screw','bottom',x,685,7,.029,.006,silver);cut_slot(sc,'bottom',x,685,2,15,.025,.004)
cyl('Battery cap dark seat','bottom',745,683,83,.034,.004,ink)
cap=cyl('Battery compartment slotted cap','bottom',745,683,77,.029,.012,silver)
cut_slot(cap,'bottom',745,683,9,111,.022,.007)
box('Battery slot recessed shadow','bottom',745,683,8,108,.0255,.0004,ink)
cyl('Battery slot endpoint recess','bottom',745,727,3.8,.025,.0004,ink)
# Verification captures exact preservation outside masks and the original UV layer.
check=np.empty_like(uv0);me.uv_layers[0].data.foreach_get('uv',check)
assert np.array_equal(check,uv0)
assert np.array_equal(co[~changed],original[~changed])
assert np.array_equal(norm[~normal_changed],original_norm[~normal_changed])
np.savez_compressed(out/'patch_provenance.npz',vertex_mask=changed,face_materials=matids,normal_mask=normal_changed)
report={'source_vertices':n,'source_faces':len(faces),'patches':records,'modified_vertices':int(changed.sum()),'unchanged_vertices':int((~changed).sum()),'original_uv_sha256':hashlib.sha256(uv0.tobytes()).hexdigest(),'unchanged_topology':True,'outside_masks_coordinates_identical':True,'outside_masks_input_normals_identical':True,'original_uv_identical':True,'added_objects':[o.name for o in bpy.context.scene.objects if o!=ob],'limitations':['Hidden mechanism depths are inferred from the supplied exterior photographs.']}
(out/'refinement_report.json').write_text(json.dumps(report,indent=2))
for image in bpy.data.images:
    if image.users and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'canon-demi-ee17-refined.blend'),compress=True)
print(json.dumps(report))
