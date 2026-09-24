"""Render the revised lens sequentially; run as a local Blender CLI background job."""
from pathlib import Path
import bpy, bmesh, json, hashlib, traceback

out=Path(bpy.data.filepath).parent
assert 'ignored_generated' in out.parts and 'lens_finish' in out.parts
scene=bpy.data.scenes['02 Hybrid v2 | Tripo lens'];bpy.context.window.scene=scene
progress={'status':'running','completed':[]}
status=out/'delivery-progress.json'
try:
    for camera,file,resolution,samples in [
        ('V2.1 optical detail','lens_detail',1400,96),
        ('V2.1 optical axial','lens_axial',1100,96),
        ('V2 01 Front three quarter','front_overview',1400,64)]:
        progress['current']=file;status.write_text(json.dumps(progress,indent=2))
        scene.camera=bpy.data.objects[camera]
        scene.render.resolution_x=scene.render.resolution_y=resolution
        scene.cycles.samples=samples
        scene.render.filepath=str(out/(file+'.png'))
        bpy.ops.render.render(write_still=True)
        image=Path(scene.render.filepath)
        progress['completed'].append({'file':image.name,'resolution':resolution,'samples':samples,
                                      'sha256':hashlib.sha256(image.read_bytes()).hexdigest()})
    report={'glass':[]}
    for ob in bpy.data.collections['07 V2.2 | clear optical assembly'].objects:
        if not ob.name.startswith('V2.2 | clear lens group'):continue
        bm=bmesh.new();bm.from_mesh(ob.data)
        bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
        p=ob.data.materials[0].node_tree.nodes.get('Principled BSDF')
        transmission=p.inputs['Transmission Weight'].default_value
        assert bad==0 and volume>0 and transmission==1
        report['glass'].append({'name':ob.name,'nonmanifold_edges':bad,'volume':volume,
                                'transmission':transmission,'roughness':p.inputs['Roughness'].default_value,
                                'coating_nm':p.inputs['Thin Film Thickness'].default_value})
    assert len(report['glass'])==3
    assert bpy.data.collections['05 V2.1 | real coated optics'].hide_render
    assert all(o.hide_render for o in scene.objects if o.name.startswith('Optics softbox |'))
    report['missing_images']=[im.name for im in bpy.data.images if im.source=='FILE' and not im.packed_file and not Path(bpy.path.abspath(im.filepath)).is_file()]
    assert not report['missing_images']
    manifest=json.loads((out/'lens-finish-manifest.json').read_text())
    assert hashlib.sha256(Path(manifest['input']).read_bytes()).hexdigest()==manifest['source_sha256']
    report['prior_revision_unchanged']=True
    report['rear_text']=[o.data.body for o in bpy.data.collections['04 V2.1 | clean rear lettering'].objects if o.type=='FONT']
    report['renders']=progress['completed']
    (out/'lens-finish-validation.json').write_text(json.dumps(report,indent=2))
    progress['status']='complete';progress.pop('current',None)
except Exception:
    progress['status']='failed';progress['error']=traceback.format_exc()
    raise
finally:
    status.write_text(json.dumps(progress,indent=2))
