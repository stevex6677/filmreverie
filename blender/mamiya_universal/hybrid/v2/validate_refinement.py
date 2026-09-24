"""Check saved optics/lettering in a fresh Blender CLI process."""
import bpy, bmesh, json, hashlib
from pathlib import Path
from mathutils import Vector

s=bpy.data.scenes['02 Hybrid v2 | Tripo lens'];bpy.context.window.scene=s
bpy.context.view_layer.update()
out=Path(bpy.data.filepath).parent
report={'glass':[],'lettering':[]}
for ob in bpy.data.collections['05 V2.1 | real coated optics'].objects:
    if not ob.name.startswith('Optics | glass element'):continue
    bm=bmesh.new();bm.from_mesh(ob.data)
    bad=sum(not e.is_manifold for e in bm.edges)
    volume=bm.calc_volume(signed=True);bm.free()
    p=ob.data.materials[0].node_tree.nodes.get('Principled BSDF')
    transmission=p.inputs['Transmission Weight'].default_value
    assert bad==0 and volume>0 and transmission==1,(ob.name,bad,volume,transmission)
    report['glass'].append({'name':ob.name,'nonmanifold_edges':bad,'volume':volume,
                            'transmission':transmission,'roughness':p.inputs['Roughness'].default_value,
                            'ior':p.inputs['IOR'].default_value,'film_nm':p.inputs['Thin Film Thickness'].default_value})
assert len(report['glass'])==3
for ob in bpy.data.collections['04 V2.1 | clean rear lettering'].objects:
    if ob.type!='FONT':continue
    corners=[ob.matrix_world@Vector(v) for v in ob.bound_box]
    height=max(p.z for p in corners)-min(p.z for p in corners)
    assert .003<height<.026,(ob.name,height)
    report['lettering'].append({'name':ob.name,'body':ob.data.body,'height':height})
report['unpacked_images']=[im.name for im in bpy.data.images if im.source=='FILE' and not im.packed_file and not Path(bpy.path.abspath(im.filepath)).is_file()]
assert not report['unpacked_images']
manifest=json.loads((out/'refinement-manifest.json').read_text())
assert hashlib.sha256(Path(manifest['input']).read_bytes()).hexdigest()==manifest['input_sha256']
report['accepted_v2_unchanged']=True
report['renders']=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in out.glob('*.png')]
(out/'refinement-validation.json').write_text(json.dumps(report,indent=2))
result=report
