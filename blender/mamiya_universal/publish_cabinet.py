"""Publish a reviewed Mamiya cabinet run; preserve detail, master and history.

python3 blender/mamiya_universal/publish_cabinet.py <reviewed-run>
"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

REPO = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(REPO / 'scripts'), str(REPO / 'blender')]
from shared_assets import generated_path
from update_model_history import archive_snapshot, write_index

run = sys.argv[1]
assert re.fullmatch(r'[A-Za-z0-9_-]+', run)
folder = REPO / 'blender/mamiya_universal'
current = json.loads((folder / 'CURRENT.json').read_text())
relative = f'blender/mamiya_universal/runs/{run}'
out = generated_path(relative)
assert json.loads((out / 'intermediates/parent-current.json').read_text()) == current
report = json.loads((out / 'exports/report.json').read_text())
item = report['shelf_glb']
assert item['bytes'] < 1_500_000 and item['triangles'] < 190_000 and item['primitives'] <= 20
assert item['source_blend_sha256'] == current['editable_blend']['sha256']
assert item['source_glb_sha256'] == report['source']['sha256']
for entry in [item, item['export_blend'], report['source'], current['editable_blend'], current['shelf_glb']]:
    file = generated_path(entry['path'])
    assert hashlib.sha256(file.read_bytes()).hexdigest() == entry['sha256']
    if 'bytes' in entry:
        assert file.stat().st_size == entry['bytes']
assert all(obj['before'] == obj['after'] for obj in report['objects'] if obj['lettering_preserved'])
archive_snapshot(folder, current, 'before-' + run)
previous = current['shelf_glb']
item['published_path'] = f"public/assets/cameras/mamiya-universal-shelf-{item['sha256']}.glb"
shutil.copyfile(generated_path(item['path']), REPO / item['published_path'])
current.setdefault('shelf_history', []).append(previous)
current['shelf_glb'] = item
current['shelf_delivery'] = {'run': relative, 'report': relative + '/exports/report.json',
    'builder': 'blender/mamiya_universal/build_cabinet.py',
    'note': 'Cabinet-only revision: preserve lettering and separate PBR materials; retain more body geometry. Editable master and detail export unchanged.'}
current['updated'] = '2026-09-25'
current['revision'] = 'Hybrid v2 — black body; component-preserving cabinet LOD'
(folder / 'CURRENT.json').write_text(json.dumps(current, indent=2, ensure_ascii=False) + '\n')
catalog_path = REPO / 'standalone/model-viewer/models.json'
catalog = json.loads(catalog_path.read_text())
entry = next(entry for entry in catalog['models'] if entry['id'] == current['model_id'])
entry['shelf'] = {'asset': item['published_path'].removeprefix('public/'),
                  **{key: item[key] for key in ['sha256', 'bytes', 'triangles']}}
catalog_path.write_text(json.dumps(catalog, indent=2) + '\n')
archive_snapshot(folder, current, run)
write_index()
# The retained authoring export was verified above; only retire its runtime copy.
if previous['published_path'] != item['published_path']:
    (REPO / previous['published_path']).unlink()
print(json.dumps(item, indent=2))
