"""Generate and validate the HEIC-based top-band continuation record."""
from pathlib import Path
import hashlib,json,sys
repo=Path(__file__).resolve().parents[2];sys.path.insert(0,str(repo/'scripts'))
from shared_assets import generated_path,asset_path
out=generated_path('blender/canon_demi_ee17/refinement/runs/20260923T-top2-b')
current=json.loads(Path(__file__).with_name('CURRENT.json').read_text())
def entry(p):return {'path':str(p.relative_to(generated_path(''))),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
export=json.loads((out/'compact_export_report.json').read_text())
verified=json.loads((out/'top2_verification.json').read_text())
browser=json.loads((out/'browser_verification.json').read_text())
assert verified['saved_master_verified'] and verified['triangle_count_preserved']
assert all(not r['errors'] and r['orbitOrPinch'] and r['rear'] for r in browser['reports'])
master=entry(out/'canon-demi-ee17-refined.blend');compact=entry(out/'canon-demi-ee17-compact.glb')
assert compact['bytes']<10_000_000 and compact['sha256']==export['sha256']
assert master['sha256']==export['source_blend_sha256']
assert export['triangles']==verified['source_master_triangles']==browser['reports'][0]['initial']['triangles']
compact.update({k:export[k] for k in ['triangles','embedded_images','source_blend_sha256','compression','position_bits','normal_bits','uv_bits','max_texture_dimension','jpeg_quality','decimated']})
ref='blender/canon_demi_ee17/references/top2.HEIC'
references=[r for r in current['references'] if r['path']!=ref]+[{'path':ref,'sha256':hashlib.sha256(asset_path(ref).read_bytes()).hexdigest()}]
manifest={k:current[k] for k in ['model_id','source','limitations','viewer']}
manifest.update(state='top2-reference-corrected',source_code_base_revision='dfb71d4',references=references,
    editable_blend=master,browser_glb=compact,
    previous_delivery=current['previous_delivery'] if current['state']=='top2-reference-corrected' else {'editable_blend':current['editable_blend'],'browser_glb':current['browser_glb'],'code_revision':'dfb71d4'},
    renders=[entry(out/f'top2_{name}.png') for name in ['front','top','oblique']],
    browser_renders=[entry(out/f'compact_{name}.png') for name in ['front','top','bottom','back','oblique']],
    verification=verified,
    reports={name:entry(out/(name+'.json')) for name in ['top2_report','top2_verification','compact_export_report','browser_verification']},
    browser_captures=[entry(out/f'browser-{device}-{view}-ready.png') for device in ['desktop','ipad'] for view in ['home','front']],
    scripts={str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(__file__).parent.glob('*')) if p.suffix in ['.py','.mjs']},
    continuation={'instructions':'Continue from this packed master. To reproduce the top2 correction, prepare_top2.py decodes the HEIC and creates a rectified text/grain atlas; run correct_top2.py through Blender MCP on the preceding master in a new output run. Run export_compact.py, reopen the master, verify_top2.py, then remote verify_viewer.mjs and package_top2.py. The compact GLB remains below 10 MB; preserve all prior outputs.'},
    refinements={'top':'Straightened both wordmark lines from top2.HEIC and integrated them into a continuous textured black ribbon with rounded borders. The black band wraps into the side strips. Lowered only intersecting scan vertices immediately underneath it; preserved other controls and surfaces.',
        'size':f"{compact['bytes']:,}-byte self-contained Draco GLB with all master triangles retained.",
        'visual_review':'Reviewed top and oblique master renders against the rectified HEIC, plus actual compressed export renders. Desktop and emulated iPad model loading, rear view and mouse/touch controls verified.'})
(out/'delivery_manifest_top2.json').write_text(json.dumps(manifest,indent=2)+'\n')
if '--verify' in sys.argv:
    assert current==manifest,'CURRENT differs from verified delivery'
    model=next(m for m in json.loads((repo/'standalone/model-viewer/models.json').read_text())['models'] if m['id']==manifest['model_id'])
    assert model['asset']==compact['path'] and model['sha256']==compact['sha256']
    print('Top2 CURRENT, catalog, saved master, compact GLB, scoped preservation, renders and browser checks agree; below 10 MB.')
else:print(json.dumps(manifest,indent=2))
