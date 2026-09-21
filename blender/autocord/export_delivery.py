"""Export the saved refined master without decimation; record reproducible hashes."""
from pathlib import Path
import bpy, json, hashlib, struct, sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir, asset_path
out=output_dir('blender/autocord/detail_refinement',bpy.data.filepath)
master=Path(bpy.data.filepath)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
master_sha=sha(master)
bpy.ops.object.select_all(action='DESELECT')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
export=out/'minolta-autocord.glb'
bpy.ops.export_scene.gltf(filepath=str(export),export_format='GLB',use_selection=True,
    export_yup=True,export_animations=False,export_extras=True,export_image_format='AUTO')
with export.open('rb') as f:
    magic,version,length=struct.unpack('<4sII',f.read(12));chunk,kind=struct.unpack('<I4s',f.read(8));gltf=json.loads(f.read(chunk))
assert magic==b'glTF' and version==2 and length==export.stat().st_size
assert all('uri' not in image for image in gltf['images']), 'Export must embed its textures'
uv_sets={int(attribute.removeprefix('TEXCOORD_'))
         for mesh in gltf['meshes'] for primitive in mesh['primitives']
         for attribute in primitive['attributes'] if attribute.startswith('TEXCOORD_')}
assert max(uv_sets,default=0)<=3, 'The viewer supports TEXCOORD_0 through TEXCOORD_3'
triangles=sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf['meshes'] for p in mesh['primitives'])
assert triangles==sum(len(o.data.polygons) for o in meshes)
assert sha(master)==master_sha, 'Export modified the editable master'
source=asset_path('blender/autocord/tripo/tripo_autocord.glb')
assert sha(source)=='a10ce046a5e9e8db20ed324ee4cb18ceca6cf58c1e24e2758db796a94e9a01fb'
report={'source_sha256':sha(source),'master':str(master),'master_sha256':master_sha,
        'glb':str(export),'glb_sha256':sha(export),'bytes':export.stat().st_size,
        'triangles':triangles,'embedded_textures':len(gltf['images']),'no_decimation':True,
        'maximum_texture_coordinate_set':max(uv_sets,default=0),
        'scripts':{name:sha(Path(__file__).parent/name) for name in (
            'build_delivery.py','refine_autocord.py','refine_side_panel.py','refine_bottom.py',
            'refine_upper_front.py','refine_lower_front.py',
            'front_inscription_normals.py',
            'prepare_references.py','prepare_detail_textures.py',
            'prepare_upper_front.py','prepare_lower_front.py','render_delivery.py','export_delivery.py')}}
(out/'export_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
