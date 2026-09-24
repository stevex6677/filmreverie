"""Blender CLI entrypoint: original source -> local details -> verified GLB and renders.

Set FILM_PHOTO_OUTPUT_DIR to a new shared ignored_generated run directory.
Run blender --background <source.blend> --python-exit-code 1
--python blender/autocord/build_delivery.py from the active checkout.
Prepare references and detail/upper-front/lower-front textures first with the
prepare_*.py scripts locally, using the same output directory.
"""
from pathlib import Path
import bpy, hashlib, json, sys
from array import array
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root))
sys.path.insert(0,str(root.parents[1]/'scripts'))
from shared_assets import output_dir
from refine_side_panel import refine_side_panel
from refine_bottom import refine_bottom
from refine_upper_front import refine_upper_front
from refine_lower_front import refine_lower_front
out=output_dir('blender/autocord/detail_refinement')

def execute(name):
    script=root/name
    exec(compile(script.read_text(),str(script),'exec'),{'__file__':str(script),'__name__':'__main__'})

def front_geometry_state(uv_names):
    """Track physical shape and original UVs across the lettering-only passes."""
    def digest(collection, attribute, kind, width):
        values=array(kind,[0])*len(collection)*width
        collection.foreach_get(attribute,values)
        return hashlib.sha256(memoryview(values)).hexdigest()
    return {
        obj.name:{
            'vertices':digest(obj.data.vertices,'co','f',3),
            'topology':digest(obj.data.loops,'vertex_index','i',1),
            'original_uvs':{
                name:digest(obj.data.uv_layers[name].data,'uv','f',2)
                for name in uv_names[obj.name]
            },
        }
        for obj in bpy.context.scene.objects if obj.type=='MESH'
    }

execute('refine_autocord.py')
report={'base_refinement':json.loads((out/'refinement_report.json').read_text())}
report['side_panel']=refine_side_panel(bpy.context.scene,out/'references')
report['bottom']=refine_bottom(bpy.context.scene,out/'references')
original_uv_names={obj.name:[uv.name for uv in obj.data.uv_layers]
                   for obj in bpy.context.scene.objects if obj.type=='MESH'}
before_front=front_geometry_state(original_uv_names)
report['upper_front']=refine_upper_front(bpy.context.scene,out/'references')
report['lower_front']=refine_lower_front(bpy.context.scene,out/'references')
after_front=front_geometry_state(original_uv_names)
assert before_front.keys()==after_front.keys()
for name,before in before_front.items():
    assert before['topology']==after_front[name]['topology']
    assert before['original_uvs']==after_front[name]['original_uvs']
    if name!=report['lower_front']['object']:
        assert before['vertices']==after_front[name]['vertices']
report['front_geometry_preservation']={
    'all_faces_and_original_uv_layers_unchanged':True,
    'coordinates_outside_shutter_inscription_surface_unchanged':True,
    'shutter_depth_repair':report['lower_front']['shutter_depth_repair'],
    'before_mesh_signatures':before_front,
    'after_mesh_signatures':after_front,
}
for image in bpy.data.images:
    if image.users and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'autocord-refined.blend'),compress=True)
(out/'refinement_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
execute('export_delivery.py')
execute('render_delivery.py')
