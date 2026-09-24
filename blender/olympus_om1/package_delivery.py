"""Publish a reviewed local Olympus GLB and update CURRENT and viewer catalog.

Run with python3 and FILM_PHOTO_OUTPUT_DIR set to the reviewed run. This does not
commit or upload anything. --verify checks the current delivery without editing.
"""
from pathlib import Path
import sys,os,json,hashlib,shutil,subprocess
repo=Path(__file__).resolve().parents[2];sys.path.insert(0,str(repo/'scripts'))
from shared_assets import generated_path,asset_path
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
current_path=Path(__file__).with_name('CURRENT.json');catalog_path=repo/'standalone/model-viewer/models.json'

def verify():
 current=json.loads(current_path.read_text());catalog_text=catalog_path.read_text();catalog=json.loads(catalog_text);entry=next(m for m in catalog['models'] if m['id']=='olympus-om1')
 for key in ['editable_blend','browser_glb']:
  item=current[key];p=generated_path(item['path']);assert sha(p)==item['sha256'];assert p.stat().st_size==item['bytes']
 browser=current['browser_glb'];published=repo/browser['published_path'];assert sha(published)==browser['sha256']==entry['sha256'];assert entry['asset']=='assets/cameras/'+published.name
 assert browser['source_blend_sha256']==current['editable_blend']['sha256'];assert browser['bytes']<10_000_000
 assert sha(asset_path(current['source']['path']))==current['source']['sha256']
 for reference in current['references']:assert sha(asset_path(reference['path']))==reference['sha256']
 for render in current['renders']:assert sha(generated_path(render['path']))==render['sha256']
 print(json.dumps({'verified':True,'bytes':browser['bytes'],'sha256':browser['sha256'],'master':current['editable_blend']['path']},indent=2))

if '--verify' in sys.argv:
 verify();raise SystemExit
out=Path(os.environ['FILM_PHOTO_OUTPUT_DIR']).resolve();assert out.is_relative_to(generated_path('').resolve())
report=json.loads((out/'exports/export_report.json').read_text());master=out/'scene.blend';glb=out/'exports/olympus-om1-compact.glb'
assert sha(master)==report['source_blend_sha256'];assert sha(glb)==report['sha256'];assert glb.stat().st_size==report['bytes']<10_000_000
assert report['packed_images'] and report['reimported_meshes']>0

def record(p,root=None):
 return {'path':str(p.relative_to(root or generated_path(''))),'sha256':sha(p),'bytes':p.stat().st_size}
source=asset_path('blender/olympus_om1/tripo/om1.glb');expected='6be533abba34dc0eb91e46f6dd02ce34988b2a1d55ddd103cdb880d4f3ada704';assert sha(source)==expected
published=repo/'public/assets/cameras'/f'olympus-om1-{sha(glb)}.glb';shutil.copyfile(glb,published)
refinement=json.loads((out/'intermediates/refinement_report.json').read_text())
reviewed_views=os.environ.get('OM1_REVIEWED_VIEWS','').split(',') if os.environ.get('OM1_REVIEWED_VIEWS') else [f'{prefix}{view}.png' for prefix in ['final_','compact_'] for view in ['front','back','top','bottom','oblique']]
assert all(Path(name).name==name and name.endswith('.png') for name in reviewed_views)
current={'model_id':'olympus-om1','state':'reference-refined','source':record(source,asset_path('')),'references':[record(p,asset_path('')) for p in sorted(p for p in asset_path('blender/olympus_om1/references').iterdir() if p.suffix.lower() in {'.jpg','.jpeg','.png','.heic'})],'editable_blend':record(master),'browser_glb':{**record(glb),'published_path':str(published.relative_to(repo)),'source_blend_sha256':sha(master),'triangles':report['triangles'],'compression':report['compression']},'renders':[record(out/'previews'/name) for name in reviewed_views],'verification':{'source_unchanged':True,'source_uvs_preserved_before_socket_boolean':True,'construction_float64_exact_match_outside_masks':refinement['unchanged_vertices_outside_masks'],'saved_master_checks':json.loads((out/'intermediates/master_verification.json').read_text()),'export':report,'visual_review':'Reviewed against the supplied photos: '+', '.join(reviewed_views),'physical_device_tested':False},'changes':['Corrected OLYMPUS badge, lens name ring, shutter/aperture/focus scales, ASA dial, OM-1 and ON/OFF markings.','Restored rewind face/crank, meter lever and accessory-shoe contact.','Added recessed battery cover coin slot, open tripod socket with internal thread, underside screws, MADE IN JAPAN and serial 151067.','Smoothed selected metal and lettering surfaces while preserving leather, knurled grips and original optics.'],'reports':[record(out/'intermediates/refinement_report.json'),record(out/'exports/export_report.json'),record(out/'intermediates/master_verification.json')],'viewer':{'model_id':'olympus-om1','route':'/?model=olympus-om1','catalog':'standalone/model-viewer/models.json'},'continuation':{'instructions':'Use the local Blender CLI. Continue editing from editable_blend into a unique durable run. To rebuild, import the original source with inspect_source.py in a new FILM_PHOTO_OUTPUT_DIR, run refine_camera.py on intermediates/source.blend, render_views.py on scene.blend, then export_compact.py on scene.blend. Inspect both master and decoded export renders before package_delivery.py. Set the same output directory throughout. Run package_delivery.py --verify and verify_viewer.mjs. Keep original inputs and previous runs intact.','source_inspection_blend':record(Path(refinement['source_master']))},'limitations':[item for item in refinement['limitations'] if not item.startswith('Browser export')]+(['Browser export uses a non-destructive decimated derivative.'] if report['source_mesh_retention_ratio']<1 else []),'code_base_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'scripts':{p.name:sha(p) for p in sorted(Path(__file__).parent.iterdir()) if p.suffix in {'.py','.mjs'}}}
if 'top3_revision' in refinement:
 current['state']='top3-dial-and-continuous-metal'
 current['changes'] += ['Rebuilt radial ASA typography, highlighted 25 and full-stop values, centered button and arced ASA from top3.HEIC.', 'Replaced mixed scan/PBR patches with continuous top-cover and prism metal; restored metal shoe rails and insulated contact.']
 current['verification']['top3_revision']=refinement['top3_revision']
 current['continuation']['parent_editable_blend']=record(Path(refinement['parent_master']))
 current['continuation']['instructions']='Use Blender CLI and refine_top3.py on parent_editable_blend in a NEW empty FILM_PHOTO_OUTPUT_DIR to reproduce this revision. The script preserves the parent and builds on it. For further edits use editable_blend, save into another unique run, then verify_master.py, render_views.py, render_top_details.py and export_compact.py. Review master and decoded export before packaging.'
catalog_text=catalog_path.read_text();catalog=json.loads(catalog_text);entry={'id':'olympus-om1','title':'Olympus','titleAccent':'OM-1','subtitle':'Reference-refined lettering, controls and underside','edition':'REFERENCE REFINEMENT','caption':'OM-SYSTEM ZUIKO AUTO-S','captionDetail':'50 mm / 1:1.8','asset':str(published.relative_to(repo/'public')),'sha256':sha(glb),'profile':'default','rotation':[0,0,0],'camera':{'distance':4.8,'portraitDistance':5.8,'home':[-1.7,1.4,3.2],'front':[0,.05,3.8],'rear':[0,.15,-3.8],'side':[-3.8,.25,0]},'exposure':1.05}
if 'top3_revision' in refinement:entry['subtitle']='Corrected ASA dial and uniform top metal finish'
previous=next((i for i,m in enumerate(catalog['models']) if m['id']==entry['id']),None)
if previous is None:catalog['models'].append(entry)
else:
 old_entry=catalog['models'][previous];entry={**old_entry,**entry};catalog['models'][previous]=entry
current_path.write_text(json.dumps(current,indent=2)+'\n')
if previous is None:
 block='\n'.join('    '+line for line in json.dumps(entry,indent=2).splitlines())
 before,after=catalog_text.rsplit('\n  ]',1);catalog_path.write_text(before+',\n'+block+'\n  ]'+after)
else:catalog_path.write_text(catalog_text.replace(old_entry['asset'],entry['asset']).replace(old_entry['sha256'],entry['sha256']).replace(json.dumps(old_entry['subtitle']),json.dumps(entry['subtitle']),1))
(out/'delivery_manifest.json').write_text(json.dumps(current,indent=2)+'\n')
archive=out/'intermediates/scripts';archive.mkdir(exist_ok=True)
for p in Path(__file__).parent.iterdir():
 if p.suffix in {'.py','.mjs'}:shutil.copyfile(p,archive/p.name)
verify()
