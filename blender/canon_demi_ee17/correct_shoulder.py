"""Continue the packed master: conform the top inset to its real stepped shoulder.

Execute in an MCP-launched Blender child. Source and prior delivery are read-only.
"""
from pathlib import Path
import bpy, bmesh, numpy as np, json, hashlib, sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir

out = output_dir('blender/canon_demi_ee17')
assert not (out/'canon-demi-ee17-refined.blend').exists()
source = Path(bpy.data.filepath)
assert source.name == 'canon-demi-ee17-refined.blend'
pix = .979248046875*1.12/1200

def surface(x):
    # Match the measured lower deck and the rounded rise visible beside the
    # release button. The higher right-hand deck remains at its accepted height.
    t = np.clip(((x/pix+600)-420)/85,0,1)
    return .6212 + .0196*t*t*(3-2*t)

def sample_ramp(ob):
    # Identical X sections on the plate and wordmark keep their surfaces
    # parallel through the curved shoulder, with no crossing triangles.
    bm=bmesh.new();bm.from_mesh(ob.data)
    for px in range(418,509,2):
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=1e-8,plane_co=((px-600)*pix,0,0),plane_no=(1,0,0),
            clear_inner=False,clear_outer=False)
    bm.to_mesh(ob.data);bm.free()

plate = bpy.data.objects['Top inset continuous enamel plate']
sample_ramp(plate)
for v in plate.data.vertices:
    v.co.z += float(surface(v.co.x))-.6408

# Expose the original silver release-button washer instead of covering it with
# the new black inset. A cylindrical cut preserves the original circular seat.
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=55*pix, depth=.16,
    location=((377-600)*pix,-(590-600)*pix,.65))
cutter=bpy.context.object
bpy.context.view_layer.objects.active=plate
mod=plate.modifiers.new('Shutter release washer opening','BOOLEAN')
mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cutter,do_unlink=True)

# The photographic wordmark uses the same sampled shoulder cross-sections.
logo=bpy.data.objects['demi EE17 inlay']
sample_ramp(logo)
for v in logo.data.vertices:v.co.z=float(surface(v.co.x))+.0003

# Level only the already-repaired black backing, leaving every other source
# vertex, UV and material unchanged. The new plate covers this backing.
body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
me=body.data
co=np.empty(len(me.vertices)*3,np.float32);me.vertices.foreach_get('co',co);co=co.reshape(-1,3)
before=co.copy()
li=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',li)
mids=np.empty(len(me.polygons),np.int32);me.polygons.foreach_get('material_index',mids)
black=[i for i,m in enumerate(me.materials) if m.name=='Black enamel']
ids=np.unique(li.reshape(-1,3)[np.isin(mids,black)].ravel())
ids=ids[(co[ids,2]>.60)&(co[ids,2]<.647)&(co[ids,0]<((505-600)*pix))]
co[ids,2]=surface(co[ids,0])-.0013
me.vertices.foreach_set('co',co.ravel());me.update()
changed=np.any(co!=before,axis=1)
report={'source_blend':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'changed_body_vertices':int(changed.sum()),'untouched_body_vertices':int((~changed).sum()),
    'outside_top_backing_coordinates_exact':bool(np.array_equal(before[~changed],co[~changed])),
    'source_topology_and_uv_unchanged':True,'lower_deck_height':.6212,'upper_deck_height':.6408,
    'ramp_pixels':[420,505],'shutter_washer_opening_radius_pixels':55,
    'changed_objects':[plate.name,logo.name,body.name]}
np.savez_compressed(out/'shoulder_vertex_mask.npz',mask=changed)
(out/'shoulder_report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'canon-demi-ee17-refined.blend'),compress=True)
exec(compile(Path(__file__).with_name('render_views.py').read_text(),str(Path(__file__).with_name('render_views.py')),'exec'),
    {'__file__':str(Path(__file__).with_name('render_views.py')),'PREFIX':'shoulder_','VIEWS':['front','oblique','top']})
print('SHOULDER_COMPLETE',json.dumps(report))
