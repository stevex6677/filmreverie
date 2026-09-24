"""Replace only the added top band and wordmark from the top2 HEIC reference."""
from pathlib import Path
import bpy,bmesh,numpy as np,json,hashlib,math,os,sys
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir
if not os.environ.get('FILM_PHOTO_OUTPUT_DIR'):
    raise ValueError('Set FILM_PHOTO_OUTPUT_DIR to the prepared run from prepare_top2.py')
out=output_dir('blender/canon_demi_ee17')
assert not (out/'canon-demi-ee17-refined.blend').exists()
source=Path(bpy.data.filepath)
body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
pix=.979248046875*1.12/1200
for name in ['Top inset continuous enamel plate','demi EE17 inlay']:
    bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
# Registered outline: a continuous band with rounded ends and a smooth front
# border. Its lip now reaches the metal surround instead of stopping in steps.
outline=[(95,480),(132,449),(180,426),(330,416),(417,426),(472,436),
    (650,433),(835,431),(902,427),(951,414),(997,417),(1050,447),(1102,490),
    (1102,565),(1070,588),(1036,620),(995,639),(476,640),(440,629),
    (420,626),(400,627),(320,634),(230,634),(170,618),(119,584),(95,563)]
smooth=[]
for i,p in enumerate(outline):
    a=Vector(outline[i-1]);b=Vector(p);c=Vector(outline[(i+1)%len(outline)])
    radius=min(14,(a-b).length*.25,(c-b).length*.25)
    start=b+(a-b).normalized()*radius;end=b+(c-b).normalized()*radius
    for j in range(7):
        t=j/6;v=(1-t)**2*start+2*t*(1-t)*b+t*t*end
        smooth.append(Vector(((v.x-600)*pix,-(v.y-600)*pix,0)))
lookup={tuple(v):i for i,v in enumerate(smooth)}
faces=[]
for tri in tessellate_polygon([smooth]):
    faces.append(tuple(v if isinstance(v,int) else lookup[tuple(v)] for v in tri))
mesh=bpy.data.meshes.new('Top2 continuous ribbon');mesh.from_pydata(smooth,[],faces);mesh.update()
bm=bmesh.new();bm.from_mesh(mesh)
for px in range(94,1105,6):
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=1e-8,plane_co=((px-600)*pix,0,0),plane_no=(1,0,0),clear_inner=False,clear_outer=False)
for py in range(416,641,8):
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=1e-8,plane_co=(0,-(py-600)*pix,0),plane_no=(0,1,0),clear_inner=False,clear_outer=False)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
for v in mesh.vertices:
    x=v.co.x/pix+600;y=-v.co.y/pix+600
    t=np.clip((x-420)/85,0,1)
    z=.6212+.0196*t*t*(3-2*t)
    # The end strips follow the rounded shell into the original side bands.
    blend=max(np.clip((175-x)/65,0,1),np.clip((x-1035)/65,0,1))
    if blend:
        hit,p,n,f=body.ray_cast(Vector((v.co.x,v.co.y,.66)),Vector((0,0,-1)))
        if hit:z=(1-blend)*z+blend*min(z,p.z+.0006)
    v.co.z=z
plate=bpy.data.objects.new('Top2 continuous textured black band',mesh);bpy.context.scene.collection.objects.link(plate)
bpy.context.view_layer.objects.active=plate;plate.select_set(True)
mod=plate.modifiers.new('Thin inset edge','SOLIDIFY');mod.thickness=.0012;mod.offset=-1
bpy.ops.object.modifier_apply(modifier=mod.name)
mat=bpy.data.materials.new('Top2 photographed black band and aligned lettering');mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=.58
bsdf.inputs['Specular IOR Level'].default_value=.18
uvnode=mat.node_tree.nodes.new('ShaderNodeUVMap');uvnode.uv_map='Top2 band coordinates'
for kind,file in [('color','top2-band-color.png'),('normal','top2-band-normal.png')]:
    im=bpy.data.images.load(str(out/file));im.pack()
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;tex.extension='EXTEND'
    mat.node_tree.links.new(uvnode.outputs['UV'],tex.inputs['Vector'])
    if kind=='color':mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    else:
        im.colorspace_settings.name='Non-Color'
        normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.uv_map='Top2 band coordinates'
        normal.inputs['Strength'].default_value=.55
        mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
plate.data.materials.append(mat)
# The original release washer remains exposed and untouched.
bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=55*pix,depth=.16,location=((377-600)*pix,-(590-600)*pix,.65))
cutter=bpy.context.object;cutter.data.materials.append(mat)
bpy.context.view_layer.objects.active=plate
mod=plate.modifiers.new('Original shutter washer opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
uv=plate.data.uv_layers.new(name='Top2 band coordinates')
for loop in plate.data.loops:
    v=plate.data.vertices[loop.vertex_index].co
    uv.data[loop.index].uv=((v.x/pix+600)/1200,1-(-v.y/pix+600)/1200)
for face in plate.data.polygons:face.use_smooth=face.normal.z>.6
# Remove intersections from the old scan immediately beneath this replacement
# band. Knobs, washer, advance lever, shoe, and the surrounding chrome stay put.
co=np.empty(len(body.data.vertices)*3,np.float32);body.data.vertices.foreach_get('co',co);co=co.reshape(-1,3)
before=co.copy();xy=np.column_stack((co[:,0]/pix+600,-co[:,1]/pix+600))
candidate=(co[:,2]>.50)&(co[:,2]<.65)&(xy[:,0]>90)&(xy[:,0]<1110)&(xy[:,1]>413)&(xy[:,1]<646)
candidate &= ~((xy[:,0]>139)&(xy[:,0]<432)&(xy[:,1]>363)&(xy[:,1]<608))
candidate &= ~((xy[:,0]>644)&(xy[:,0]<829)&(xy[:,1]>419)&(xy[:,1]<608))
for center,radius in [((377,590),61),((969,519),95)]:candidate &= np.linalg.norm(xy-center,axis=1)>radius
for i in np.flatnonzero(candidate):
    hit,p,n,f=plate.ray_cast(Vector((co[i,0],co[i,1],.7)),Vector((0,0,-1)))
    if hit and -.004<co[i,2]-p.z<.012:co[i,2]=min(co[i,2],p.z-.0015)
changed=np.any(before!=co,axis=1)
body.data.vertices.foreach_set('co',co.ravel());body.data.update()
np.savez_compressed(out/'top2_backing_mask.npz',mask=changed)
report={'source_blend':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'reference':'blender/canon_demi_ee17/references/top2.HEIC',
    'reference_sha256':'d3f739c98c87a720a9d67f44beaca9acae1804098bc9a7d69d8bc2c04a51edcc',
    'removed_objects':['Top inset continuous enamel plate','demi EE17 inlay'],
    'added_object':plate.name,'body_vertices_modified':int(changed.sum()),'wordmark_rectangle':[470,484,629,605],
    'outline':outline,'wordmark_coplanar_with_band':True}
(out/'top2_report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'canon-demi-ee17-refined.blend'),compress=True)
renderer=Path(__file__).with_name('render_views.py')
exec(compile(renderer.read_text(),str(renderer),'exec'),{'__file__':str(renderer),'PREFIX':'top2_','VIEWS':['top','oblique','front']})
print('TOP2_COMPLETE',json.dumps(report))
