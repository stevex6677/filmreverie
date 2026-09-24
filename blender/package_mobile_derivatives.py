"""Publish reviewed detail/shelf derivatives without changing editable masters.
Usage: python3 blender/package_mobile_derivatives.py <run-name>
"""
from pathlib import Path
import sys,json,hashlib,shutil
repo=Path(__file__).resolve().parents[1];sys.path.insert(0,str(repo/'scripts'))
from shared_assets import generated_path
from update_model_history import archive_snapshot, write_index
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
catalog_path=repo/'standalone/model-viewer/models.json';catalog=json.loads(catalog_path.read_text())
prepared=[]
for folder in ['mamiya_universal','autocord','canon7s','canon_demi_ee17','olympus_om1']:
 cp=repo/'blender'/folder/'CURRENT.json';current=json.loads(cp.read_text());parent_current=json.loads(cp.read_text())
 run=generated_path(f'blender/{folder}/runs/{sys.argv[1]}');report=json.loads((run/'exports/report.json').read_text())
 assert report['parent_browser_glb']==current['browser_glb']
 assert sha(generated_path(current['editable_blend']['path']))==current['editable_blend']['sha256']
 entry=next(m for m in catalog['models'] if m['id']==current['model_id'])
 for variant in ['detail','shelf']:
  item=report['variants'][variant];source=generated_path(item['path'])
  assert sha(source)==item['sha256'] and source.stat().st_size==item['bytes']
  assert item['bytes']<(5000000 if variant=='detail' else 1000000)
  assert variant!='shelf' or item['triangles']<25000
  assert item['source_blend_sha256']==current['editable_blend']['sha256']
  name=f'{entry["id"]}{"-shelf" if variant=="shelf" else ""}-{item["sha256"]}.glb'
  item['published_path']='public/assets/cameras/'+name
 old=current['browser_glb'];old_file=repo/old['published_path']
 assert sha(old_file)==old['sha256']==sha(generated_path(old['path']))
 current.setdefault('browser_history',[]).append(old)
 current['browser_glb']=report['variants']['detail'];current['shelf_glb']=report['variants']['shelf']
 current['mobile_delivery']={'run':str(run.relative_to(generated_path(''))),'report':str((run/'exports/report.json').relative_to(generated_path(''))),'note':'Non-destructive mobile derivatives of the previous browser delivery. Editable master, previous exports and their historical renders remain preserved. Detail uses Draco and smaller textures; cabinet is decimated separately. See MOBILE_MODELS.md for review and validation.'}
 entry['asset']=current['browser_glb']['published_path'].removeprefix('public/');entry['sha256']=current['browser_glb']['sha256']
 entry['shelf']={'asset':current['shelf_glb']['published_path'].removeprefix('public/'),**{k:current['shelf_glb'][k] for k in ['sha256','bytes','triangles']}}
 prepared.append((cp,current,run,old_file,parent_current))
# Validate all five before publishing anything.
for cp,current,run,old_file,parent_current in prepared:
 archive_snapshot(cp.parent,parent_current,'before-'+sys.argv[1])
 archive_snapshot(cp.parent,current,sys.argv[1],check_only=True)
for cp,current,run,old_file,parent_current in prepared:
 for key in ['browser_glb','shelf_glb']:
  item=current[key];shutil.copyfile(generated_path(item['path']),repo/item['published_path'])
 cp.write_text(json.dumps(current,indent=2)+'\n')
 archive_snapshot(cp.parent,current,sys.argv[1])
 (run/'delivery_manifest.json').write_text(json.dumps(current,indent=2)+'\n')
 old_file.unlink() # Byte-identical historical export is retained in durable storage.
catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
write_index()
print('Published five detail and five cabinet models; accepted masters preserved.')
