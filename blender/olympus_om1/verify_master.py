"""Validate saved source preservation and restored objects using local Blender CLI."""
from pathlib import Path
import bpy,json,os,numpy as np
from mathutils.kdtree import KDTree
out=Path(os.environ['FILM_PHOTO_OUTPUT_DIR']);master=Path(bpy.data.filepath)
report=json.loads((out/'intermediates/refinement_report.json').read_text())
scene=bpy.context.scene;body=max((o for o in scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices));points=np.empty((len(body.data.vertices),3),np.float32);body.data.vertices.foreach_get('co',points.ravel())
assert np.isfinite(points).all()
tree=KDTree(len(points))
for i,p in enumerate(points):tree.insert(p,i)
tree.balance()
with bpy.data.libraries.load(report['source_master'],link=False) as (source,target):target.objects=[n for n in source.objects if n.startswith('tripo_node')]
original=target.objects[0];co=np.empty((len(original.data.vertices),3),np.float32);original.data.vertices.foreach_get('co',co.ravel());x,y,z=co.T
regions={'leather_body':(y>.065)&(z>.07)&(z<.36),'central_optics':(y<-.18)&(np.hypot(x-.0408,z-.2203)<.095)}
checks={}
for name,mask in regions.items():
 sample=co[mask][::max(1,int(mask.sum())//50000)];distances=[tree.find(p)[2] for p in sample];maximum=max(distances);assert maximum<2e-7,(name,maximum);checks[name]={'sampled_vertices':len(sample),'maximum_nearest_vertex_difference':maximum,'tolerance':2e-7}
required=['OLYMPUS front wordmark','Top OM-1','Body serial 151067','Battery cover','Tripod internal threads','Meter ON OFF lever','Rewind folding crank']
assert all(n in scene.objects for n in required)
assert all(im.packed_file for im in bpy.data.images if im.users)
result={'saved_master':str(master),'finite_geometry':True,'preserved_regions':checks,'required_details':required,'packed_images':True,'body_vertices':len(points),'body_polygons':len(body.data.polygons),'font_objects':len([o for o in scene.objects if o.type=='FONT']),'note':'Preservation checks sample untouched leather and central optics after the socket Boolean. Construction-stage float64 arithmetic may differ below Blender float32 storage precision.'}
(out/'intermediates/master_verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
