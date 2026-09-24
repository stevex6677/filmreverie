"""Generate or verify the compact shoulder delivery record without editing Git files."""
from pathlib import Path
import hashlib,json,sys
repo=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(repo/'scripts'))
from shared_assets import generated_path,output_dir
current=json.loads(Path(__file__).with_name('CURRENT.json').read_text())
out=output_dir('blender/canon_demi_ee17',generated_path(current['editable_blend']['path']))
def entry(p):
    return {'path':str(p.relative_to(generated_path(''))),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
export=json.loads((out/'compact_export_report.json').read_text())
verified=json.loads((out/'shoulder_verification.json').read_text())
browser=json.loads((out/'browser_verification.json').read_text())
assert verified['saved_master_verified'] and verified['triangle_count_preserved']
assert all(not r['errors'] and r['orbitOrPinch'] and r['rear'] for r in browser['reports'])
master=entry(out/'canon-demi-ee17-refined.blend');compact=entry(out/'canon-demi-ee17-compact.glb')
assert compact['bytes']<10_000_000
assert compact['sha256']==export['sha256'] and master['sha256']==export['source_blend_sha256']
assert export['triangles']==verified['source_master_triangles']==browser['reports'][0]['initial']['triangles']
compact.update({k:export[k] for k in ['triangles','embedded_images','source_blend_sha256','compression','position_bits','normal_bits','uv_bits','max_texture_dimension','jpeg_quality','decimated']})
compact['published_path']=f"public/assets/cameras/canon-demi-ee17-{compact['sha256']}.glb"
manifest={k:current[k] for k in ['model_id','source','references','limitations','viewer']}
manifest.update(state='shoulder-corrected-compact',source_code_base_revision='72c283c',
    editable_blend=master,browser_glb=compact,
    previous_delivery=current.get('previous_delivery',{'editable_blend':current['editable_blend'],'browser_glb':current['browser_glb'],'code_revision':'72c283c'}),
    renders=[entry(out/f'shoulder_{name}.png') for name in ['front','top','oblique']],
    browser_renders=[entry(out/f'compact_{name}.png') for name in ['front','top','bottom','back','oblique']],
    verification=verified,
    reports={name:entry(out/(name+'.json')) for name in ['shoulder_report','shoulder_verification','compact_export_report','browser_verification']},
    browser_captures=[entry(out/f'browser-{device}-{view}-ready.png') for device in ['desktop','ipad'] for view in ['home','front']],
    scripts={str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(__file__).parent.glob('*')) if p.suffix in ['.py','.mjs']},
    continuation={'instructions':'Continue from this packed editable master. The compact GLB uses Draco compression, retains all master triangles, and is the viewer delivery. Run correct_shoulder.py from the previous delivery only to reproduce this scoped change in a new run; export_compact.py on the new saved master, then verify_shoulder.py, verify_viewer.mjs and package_compact.py. Keep prior outputs read-only.'},
    refinements={'shoulder':'Lowered the left black enamel deck to the original shoulder, curved its rise into the higher deck, conformed the wordmark, and opened the shutter-release washer seat. Only the two added top surfaces and the already-repaired black backing changed.',
        'size':'7,901,472-byte self-contained GLB; Draco position 16, normal 12, UV 14 bits; 2048-pixel maximum embedded JPEG textures at quality 90; no decimation.',
        'visual_review':'Inspected the corrected master oblique view and compressed GLB front, top, bottom, back and oblique reimport renders. Desktop and emulated iPad loading, rear view, mouse orbit and touch pinch passed with no page errors.'})
if '--verify' in sys.argv:
    for key in ['state','editable_blend','browser_glb','renders','browser_renders','verification','reports','browser_captures']:
        assert current[key]==manifest[key],key
    model=next(m for m in json.loads((repo/'standalone/model-viewer/models.json').read_text())['models'] if m['id']==manifest['model_id'])
    assert 'public/'+model['asset']==compact['published_path'] and model['sha256']==compact['sha256']
    assert hashlib.sha256((repo/compact['published_path']).read_bytes()).hexdigest()==compact['sha256']
    print('CURRENT, catalog, saved master, compact GLB, scope checks, renders and browser checks agree; GLB is below 10 MB.')
else:
    (out/'delivery_manifest_compact.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
