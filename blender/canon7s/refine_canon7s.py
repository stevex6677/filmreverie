"""Localized Canon 7s restoration; run from source.blend through Blender CLI.

Original mesh topology, UVs and materials are retained outside calibrated patches.
All screen measurements use the 1200px orthographic source evidence. Top view is
rotated 180 degrees to match IMG_2054. Never use an already-refined blend as input.
"""
from pathlib import Path
import hashlib
import json
import math
import sys
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, output_dir

out = output_dir('blender/canon7s/refinement')
obj = max((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
obj.name = 'Canon 7s | preserved Tripo body with localized inscription repairs'
mesh = obj.data
assert len(mesh.vertices) == 999829, 'Rebuild only from the inspected original source'
co = np.empty(len(mesh.vertices)*3, np.float32)
mesh.vertices.foreach_get('co', co)
co = co.reshape(-1,3)
original = co.copy()
loops = np.empty(len(mesh.loops), np.int32)
mesh.loops.foreach_get('vertex_index', loops)
assert all(p.loop_total == 3 for p in mesh.polygons)
faces = loops.reshape(-1,3)
centers = co[faces].mean(axis=1)
uv0 = np.empty(len(loops)*2,np.float32)
mesh.uv_layers[0].data.foreach_get('uv',uv0)
uv_hash = hashlib.sha256(uv0.tobytes()).hexdigest()
new_uv = np.zeros((len(loops),2),np.float32)
material_ids = np.zeros(len(faces),np.int32)
normal = np.empty(len(loops)*3,np.float32)
mesh.corner_normals.foreach_get('vector',normal)
normal = normal.reshape(-1,3)
changed = np.zeros(len(co),bool)
scale = .9791259765625 * 1.12
pixel = scale / 1200
records = []


def project(points, view):
    if view == 'top':
        return np.column_stack((600-points[:,0]/pixel,600+points[:,1]/pixel))
    x = points[:,0] if view == 'front' else -points[:,0]
    return np.column_stack((600+x/pixel,600-(points[:,2]-.5976563096046448/2)/pixel))


def rectangle(p, box, feather=5):
    l,t,r,b=box
    return np.clip(np.minimum.reduce((p[:,0]-l,r-p[:,0],p[:,1]-t,b-p[:,1]))/feather,0,1)


def material(name, texture=None, metal=0, rough=.4, color=(.1,.1,.1,1)):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if texture:
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Canon reference details'
        for suffix,socket,space in [('', 'Base Color','sRGB'),('_metallic','Metallic','Non-Color')]:
            path=out/'textures'/(texture+suffix+'.png')
            if not path.exists():
                continue
            image=bpy.data.images.load(str(path),check_existing=True)
            image.colorspace_settings.name=space;image.pack()
            node=nodes.new('ShaderNodeTexImage');node.image=image
            node.extension='EXTEND'
            links.new(uv.outputs['UV'],node.inputs['Vector'])
            links.new(node.outputs['Color'],bsdf.inputs[socket])
    return mat


silver=material('Neutral brushed aluminum detail',metal=.8,rough=.37,color=(.37,.38,.39,1))
black=material('Engraved black infill',rough=.48,color=(.006,.007,.008,1))
red=material('Release indicator red enamel',rough=.4,color=(.25,.012,.008,1))


def patch(name,view,weight,uv_box,mat,target=None,axis=None):
    pc=project(centers,view);pv=project(original,view)
    wf=weight(pc,centers);wv=weight(pv,original)
    selected=wf>0
    ids=np.flatnonzero(selected)
    assert len(ids), name+' selected no faces'
    loop_ids=(ids[:,None]*3+np.arange(3)).ravel()
    l,t,r,b=uv_box
    new_uv[loop_ids,0]=(pv[loops[loop_ids],0]-l)/(r-l)
    new_uv[loop_ids,1]=1-(pv[loops[loop_ids],1]-t)/(b-t)
    mesh.materials.append(mat)
    material_ids[selected]=len(mesh.materials)-1
    if target is not None:
        affected=wv>0
        values=target(original) if callable(target) else np.full(len(co),target)
        co[:,axis]+=(values-co[:,axis])*wv
        changed[:] |= affected
        direction={'front':(0,-1,0),'rear':(0,1,0),'top':(0,0,1)}[view]
        nw=wv[loops,None]
        normal[:]=normal*(1-nw)+np.array(direction)*nw
    records.append({'name':name,'source_faces':len(ids),'leveled_vertices':int(np.count_nonzero(wv)) if target is not None else 0})
    print(records[-1],flush=True)


# Preserve the glass and chrome lip. Only the black name ring is leveled.
def lens_weight(p,xyz):
    r=np.linalg.norm((p-[679,675])/[145,151],axis=1)
    return np.clip((r-.785)/.018,0,1)*np.clip((1.015-r)/.018,0,1)*(xyz[:,1]<-.225)

lp=project(original,'front')
lw=lens_weight(lp,original)
fit=lw>.95
# A plane fitted to the ring preserves its slight scan tilt, removes false letters.
A=np.column_stack((np.ones(fit.sum()),original[fit,0],original[fit,2]))
y=original[fit,1]
coef=np.linalg.lstsq(A,y,rcond=None)[0]
for _ in range(4):
    residual=y-A@coef
    keep=np.abs(residual-np.median(residual))<.0016
    coef=np.linalg.lstsq(A[keep],y[keep],rcond=None)[0]
patch('Voigtländer Color-Skopar 35mm F2.5 MC','front',lens_weight,
      (534,524,824,826),material('Lens name ring | reference lettering','lens',rough=.38),
      lambda xyz:coef[0]+coef[1]*xyz[:,0]+coef[2]*xyz[:,2],1)

# Restore the photographed serial rather than the Tripo hallucination 109999.
def rear_weight(p,x):
    w=rectangle(p,(754,348,1004,473),7)
    w*=np.linalg.norm(p-[768,414],axis=1)>23
    return w*(x[:,1]>.182)*(x[:,1]<.218)
patch('Rear CANON manufacturer and serial 103959','rear',rear_weight,
      (806,360,976,454),material('Rear engraving | reference pigment','rear',rough=.36),.1903,1)

# Clean only the lettering field, the absent meter seat, and the false logo.
def top_field(p,x):
    w=rectangle(p,(276,580,642,689),8)
    w*=~((p[:,0]>491)&(p[:,1]>652))
    return w*(x[:,2]>.547)*(x[:,2]<.572)
patch('Top plate logo field and meter seat','top',top_field,(285,596,483,647),
      material('Canon 7s top wordmark | reference pigment','logo',rough=.37),.5614,2)
patch('Remove misplaced Tripo top inscription','top',
      lambda p,x:rectangle(p,(649,747,751,789),6)*(x[:,2]>.55)*(x[:,2]<.574),
      (649,747,751,789),silver,.5614,2)

# Restore one continuous satin top surface, not isolated bright decal rectangles.
# Horizontal plate only: knobs, lens, shoe rails and body walls keep their scan.
top_mat=material('Continuous satin top plate and Canon 7s wordmark','top_plate',rough=.37)
pc=project(centers,'top')
face_normals=np.cross(original[faces[:,1]]-original[faces[:,0]],original[faces[:,2]]-original[faces[:,0]])
face_normals/=np.maximum(np.linalg.norm(face_normals,axis=1)[:,None],1e-12)
plate=(rectangle(pc,(80,552,1115,842),1)>0)&(centers[:,2]>.549)&(centers[:,2]<.575)&(face_normals[:,2]>.35)
plate &= ~((pc[:,0]>486)&(pc[:,0]<637)&(pc[:,1]>651)&(pc[:,1]<834))
for center,radius in [((211,679),61),((345,767),61),((714,668),82),((852,633),49)]:
    plate &= np.linalg.norm(pc-center,axis=1)>radius
# Include every already-cleaned logo field triangle to avoid residual islands.
plate |= (material_ids==3)|(material_ids==4)
ids=np.flatnonzero(plate)
mesh.materials.append(top_mat)
material_ids[ids]=len(mesh.materials)-1
li=(ids[:,None]*3+np.arange(3)).ravel()
pv=project(original[loops[li]],'top')
new_uv[li]=(pv-[80,552])/[1035,290]
new_uv[li,1]=1-new_uv[li,1]
records.append({'name':'Continuous top plate satin finish','source_faces':len(ids),'leveled_vertices':0})

# This is the existing dial, not a substituted camera body or new cylinder.
def shutter_weight(p,x):
    r=np.linalg.norm((p-[714,668])/[73,76],axis=1)
    return np.clip((1-r)/.035,0,1)*(x[:,2]>.579)
patch('Shutter speed ASA DIN dial face','top',shutter_weight,(641,592,787,744),
      material('Black shutter dial | photographed speed markings','shutter',rough=.4),.59225,2)

# Film reminder and folding rewind lever: retain both original knurled rims.
for name,center,radius in [('Film reminder',(345,767),46),('Rewind knob',(211,679),45)]:
    p=project(original,'top');distance=np.linalg.norm(p-center,axis=1)
    mask=(distance<radius)&(original[:,2]>.56)
    height=float(np.quantile(original[mask,2],.8))
    patch(name+' clean face','top',
          lambda p,x,c=center,r=radius,h=height:np.clip((r-np.linalg.norm(p-c,axis=1))/3,0,1)*(x[:,2]>h-.009),
          (center[0]-radius,center[1]-radius,center[0]+radius,center[1]+radius),silver,height,2)
    records[-1]['height']=height

mesh.vertices.foreach_set('co',co.ravel())
mesh.polygons.foreach_set('material_index',material_ids)
mesh.update()
layer=mesh.uv_layers.new(name='Canon reference details')
layer.data.foreach_set('uv',new_uv.ravel())
mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
length=np.linalg.norm(normal,axis=1)
normal/=np.maximum(length[:,None],1e-8)
mesh.normals_split_custom_set(normal)
assert np.array_equal(co[~changed],original[~changed])
check_uv=np.empty_like(uv0);mesh.uv_layers[0].data.foreach_get('uv',check_uv)
assert hashlib.sha256(check_uv.tobytes()).hexdigest()==uv_hash


def top_location(x,y,z):
    return ((600-x)*pixel,(y-600)*pixel,z)


def cube(name,box,z,depth,mat,bevel=0):
    l,t,r,b=box
    bpy.ops.mesh.primitive_cube_add(size=1,location=top_location((l+r)/2,(t+b)/2,z))
    ob=bpy.context.object;ob.name=name
    ob.dimensions=((r-l)*pixel,(b-t)*pixel,depth)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat)
    if bevel:
        mod=ob.modifiers.new('Machined edge','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def top_text(name,text,x,y,height,width,z,mat=black):
    curve=bpy.data.curves.new(name,'FONT');curve.body=text;curve.align_x='CENTER';curve.align_y='CENTER'
    curve.size=1;curve.extrude=0
    ob=bpy.data.objects.new(name,curve);bpy.context.scene.collection.objects.link(ob)
    ob.location=top_location(x,y,z);ob.rotation_euler=(0,0,math.pi)
    bpy.context.view_layer.update()
    ob.scale.x=width*pixel/max(ob.dimensions.x,1e-6)
    ob.scale.y=height*pixel/max(ob.dimensions.y,1e-6)
    curve.materials.append(mat)
    return ob


# The reference meter has a black rectangular recess in front of the shoe.
cube('Meter window | dark recessed surround',(503,591,622,663),.5621,.002,black,.002)
verts=[top_location(x,y,.56325) for x,y in [(508,596),(617,596),(617,658),(508,658)]]
me=bpy.data.meshes.new('Meter window color scale');me.from_pydata(verts,[],[(0,3,2,1)]);me.update()
ob=bpy.data.objects.new(me.name,me);bpy.context.scene.collection.objects.link(ob)
me.materials.append(material('Meter scale beneath glass','meter',rough=.22))
layer=me.uv_layers.new(name='Canon reference details')
for loop in me.loops:
    layer.data[loop.index].uv=[(0,1),(1,1),(1,0),(0,0)][loop.vertex_index]
# Borders are geometry; scale and pointer remain precisely as photographed.
for box in [(502,590,506,664),(619,590,623,664),(502,590,623,594)]:
    cube('Meter bezel edge',box,.563,.0015,silver,.0006)
film_height=next(r['height'] for r in records if r['name']=='Film reminder clean face')
top_text('Film reminder 35','35',345,741,17,24,film_height+.0002)
rewind_height=next(r['height'] for r in records if r['name']=='Rewind knob clean face')
cube('Folding rewind handle slot',(188,641,234,717),rewind_height+.00025,.0005,black,.004)
cube('Folding rewind handle',(192,644,230,714),rewind_height+.0012,.002,silver,.003)
top_text('Rewind release marking','R',824,692,12,11,.5629)
top_text('Shutter release advance marking','A',835,578,12,11,.563)
# A compact black frame counter window with the visible 33 reading.
cube('Frame counter window',(935,592,963,625),.563,.001,black,.002)
top_text('Frame counter reading','33',949,609,16,20,.5637,silver)
# Film plane mark: the engraved ring is crossed by a fine horizontal stroke.
pp=project(co,'top')
near=(np.linalg.norm(pp-[453,777],axis=1)<20)&(co[:,2]>.55)
mark_height=float(np.quantile(co[near,2],.95))+.00025
bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,location=top_location(453,777,mark_height),major_radius=7*pixel,minor_radius=.7*pixel)
bpy.context.object.name='Film plane engraved ring';bpy.context.object.data.materials.append(black)
cube('Film plane engraved line',(434,776,472,778),mark_height,.00015,black)
# Red release indicator, restricted to the scanned small circular control.
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=top_location(888,708,.568))
bpy.context.object.name='Release red index';bpy.context.object.scale=(.002,.002,.00035)
bpy.context.object.data.materials.append(red)

for image in bpy.data.images:
    if image.users and not image.packed_file:
        image.pack()
source=asset_path('blender/canon7s/tripo/tripo_canon7s.glb')
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'source_vertices':len(co),'source_faces':len(faces),'patches':records,
        'unchanged_vertices':int((~changed).sum()),'modified_vertices':int(changed.sum()),
        'unchanged_topology':True,'original_uv_sha256':uv_hash,
        'outside_patch_coordinates_identical':True,
        'maximum_displacement':float(np.linalg.norm(co-original,axis=1).max()),
        'added_details':[o.name for o in bpy.context.scene.objects if o!=obj],
        'packed_images':all(i.packed_file for i in bpy.data.images if i.users)}
(out/'refinement_report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'canon7s-refined.blend'),compress=True)
print(json.dumps(report),flush=True)
exec(compile(Path(__file__).with_name('render_views.py').read_text(),str(Path(__file__).with_name('render_views.py')),'exec'),{'__file__':str(Path(__file__).with_name('render_views.py'))})
