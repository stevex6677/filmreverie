"""Render front/rear finish comparison and verify the saved black-body master."""
from pathlib import Path
import bpy, json, hashlib, traceback

out = Path(bpy.data.filepath).parent
assert 'black_body' in out.parts and 'ignored_generated' in out.parts
scene = bpy.data.scenes['02 Hybrid v2 | Tripo lens']; bpy.context.window.scene = scene
progress = {'status':'running','completed':[]}
status = out/'delivery-progress.json'
try:
    manifest = json.loads((out/'black-body-manifest.json').read_text())
    assert hashlib.sha256(Path(manifest['input']).read_bytes()).hexdigest() == manifest['source_sha256']
    for name, params in manifest['lens_materials'].items():
        p = bpy.data.materials[name].node_tree.nodes.get('Principled BSDF')
        for key, expected in params.items():
            actual = p.inputs[key].default_value
            if isinstance(expected, list): actual = list(actual)
            assert actual == expected, (name, key)
    text = [o.data.body for o in bpy.data.collections['04 V2.1 | clean rear lettering'].objects if o.type=='FONT']
    assert text == manifest['rear_text']
    missing = [im.name for im in bpy.data.images if im.source=='FILE' and not im.packed_file
               and not Path(bpy.path.abspath(im.filepath)).is_file()]
    assert not missing, missing
    for camera, filename in [('V2 01 Front three quarter','front_overview'),
                              ('V2 03 Rear three quarter','rear_overview')]:
        progress['current'] = filename; status.write_text(json.dumps(progress,indent=2))
        scene.camera = bpy.data.objects[camera]
        scene.render.resolution_x = scene.render.resolution_y = 1400
        scene.cycles.samples = 96
        scene.render.filepath = str(out/(filename+'.png'))
        bpy.ops.render.render(write_still=True)
        progress['completed'].append({'file':filename+'.png','resolution':1400,'samples':96,
            'sha256':hashlib.sha256(Path(scene.render.filepath).read_bytes()).hexdigest()})
    report = {'previous_master_unchanged':True,'lens_materials_unchanged':True,'rear_text_unchanged':True,
              'missing_images':missing,'renders':progress['completed'],
              'blend_sha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()}
    (out/'black-body-validation.json').write_text(json.dumps(report,indent=2))
    progress['status']='complete'; progress.pop('current',None)
except Exception:
    progress['status']='failed'; progress['error']=traceback.format_exc(); raise
finally:
    status.write_text(json.dumps(progress,indent=2))
