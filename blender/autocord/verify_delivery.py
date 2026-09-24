"""Verify the authoritative delivery record, viewer catalog and generated files."""
from pathlib import Path
import hashlib, json, sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import generated_path, asset_path
root=Path(__file__).resolve().parents[2]
current=json.loads((Path(__file__).parent/'CURRENT.json').read_text())
catalog=json.loads((root/'standalone/model-viewer/models.json').read_text())
model=next(m for m in catalog['models'] if m['id']==current['model_id'])
assert 'public/'+model['asset']==current['browser_glb']['published_path']
assert model['sha256']==current['browser_glb']['sha256']
assert current['browser_glb']['source_blend_sha256']==current['editable_blend']['sha256']
for entry in [current['editable_blend'],current['browser_glb'],current['full_detail_glb'],*current['renders'],*current.get('browser_evidence',[])]:
    path=generated_path(entry['path'])
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],path
source=asset_path(current['source']['path'])
assert hashlib.sha256(source.read_bytes()).hexdigest()==current['source']['sha256']
report=json.loads(generated_path(current['reports']['browser_export']).read_text())
assert report['sha256']==model['sha256']
assert report['source_sha256']==current['editable_blend']['sha256']
assert report['triangles']==current['browser_glb']['triangles']
published=root/current['browser_glb']['published_path']
assert published.stat().st_size==current['browser_glb']['bytes']
assert hashlib.sha256(published.read_bytes()).hexdigest()==model['sha256']
print(json.dumps({'model_id':current['model_id'],'catalog_matches_current':True,
                  'master_full_detail_browser_and_render_checksums_valid':True,'source_unchanged':True,
                  'triangles':report['triangles'],'render_count':len(current['renders']),
                  'browser_screenshot_count':len(current.get('browser_evidence',[]))},indent=2))
