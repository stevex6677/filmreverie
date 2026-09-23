"""Hash and verify deliverables remotely; emits generated metadata only."""
from pathlib import Path
import os,sys,hashlib,json
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import asset_path,generated_path
repo=Path(__file__).resolve().parents[2]
current_path=Path(__file__).with_name('CURRENT.json')
current=json.loads(current_path.read_text()) if current_path.exists() else None
if current and current.get('state')=='top2-reference-corrected' and not os.environ.get('FILM_PHOTO_OUTPUT_DIR'):
    import runpy
    sys.argv=[str(Path(__file__).with_name('package_top2.py')),'--verify']
    runpy.run_path(sys.argv[0],run_name='__main__')
    raise SystemExit(0)
if current and current.get('state')=='shoulder-corrected-compact' and not os.environ.get('FILM_PHOTO_OUTPUT_DIR'):
    import runpy
    sys.argv=[str(Path(__file__).with_name('package_compact.py')),'--verify']
    runpy.run_path(sys.argv[0],run_name='__main__')
    raise SystemExit(0)
out=Path(os.environ['FILM_PHOTO_OUTPUT_DIR']) if os.environ.get('FILM_PHOTO_OUTPUT_DIR') else generated_path(current['editable_blend']['path']).parent
def entry(p):return {'path':str(p.relative_to(generated_path(''))),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
source=asset_path('blender/canon_demi_ee17/tripo/ee17.glb')
assert hashlib.sha256(source.read_bytes()).hexdigest()=='21679ebfe257777b36424eb26ec7783955c11ad38036098b6957df25256419c9'
verification=json.loads((out/'master_verification.json').read_text());assert verification['saved_master_verified']
exports=json.loads((out/'export_report_preserved.json').read_text());assert exports['master_unchanged'] and exports['browser_reimport']['names_retained']
assert exports['browser']['triangles']==exports['full_detail']['triangles']
master=entry(out/'canon-demi-ee17-refined.blend');assert master['sha256']==exports['source_blend_sha256']
files={}
for key,name in [('full_detail','canon-demi-ee17-refined.glb'),('browser','canon-demi-ee17-viewer.glb')]:
    item=entry(out/name);assert item['sha256']==exports[key]['sha256']
    item.update({k:exports[key][k] for k in ['triangles','embedded_images','source_blend_sha256']});files[key]=item
manifest={'model_id':'canon-demi-ee17','state':'reference-refined','source_code_base_revision':'0c120daecdfda40147957543c9e0447c988217b7','source':{'path':'blender/canon_demi_ee17/tripo/ee17.glb','sha256':hashlib.sha256(source.read_bytes()).hexdigest()},'references':[{'path':'blender/canon_demi_ee17/references/'+name+'.jpg','sha256':hashlib.sha256(asset_path('blender/canon_demi_ee17/references/'+name+'.jpg').read_bytes()).hexdigest()} for name in ['front','top','bottom','back']],'editable_blend':master,'full_detail_glb':files['full_detail'],'browser_glb':files['browser'],'renders':[entry(out/('final_'+name+'.png')) for name in ['front','back','top','bottom','oblique','bottom_oblique']],'browser_renders':[entry(out/('viewer_'+name+'.png')) for name in ['front','top','bottom','oblique']],'verification':verification,'export_verification':exports['browser_reimport'],'reports':{name:entry(out/(name+'.json')) for name in ['refinement_report','master_verification','export_report_preserved']},'scripts':{str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(__file__).parent.glob('*.py'))},'viewer':{'model_id':'canon-demi-ee17','route':'/?model=canon-demi-ee17','catalog':'standalone/model-viewer/models.json'},'continuation':{'source_inspection_blend':entry(out/'source.blend'),'instructions':'Use the packed editable master for continuation. Rebuild in a new shared run: inspect_source.py through an MCP-launched Blender child, prepare_textures.py through remote_exec with FILM_PHOTO_OUTPUT_DIR, then refine_camera.py on source.blend. Render, verify_master.py, export_delivery.py and package_delivery.py. Keep source files read-only. Only the four requested areas are in scope.'},'limitations':['Hidden control depths are inferred from exterior photographs; this is a visual reconstruction.']}
(out/'delivery_manifest_preserved.json').write_text(json.dumps(manifest,indent=2)+'\n')
if current and not os.environ.get('FILM_PHOTO_OUTPUT_DIR'):
    for key in ['editable_blend','full_detail_glb','browser_glb','renders','browser_renders','scripts']:assert current[key]==manifest[key],key
    catalog=json.loads((repo/'standalone/model-viewer/models.json').read_text())
    model=next(m for m in catalog['models'] if m['id']=='canon-demi-ee17')
    assert model['asset']==current['browser_glb']['path'] and model['sha256']==current['browser_glb']['sha256']
    print('CURRENT, viewer catalog, source, saved master, both exports and ten final renders agree.')
else:print(json.dumps(manifest,indent=2))
