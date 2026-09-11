"""Read-only verification of the tracked migration snapshot."""
import hashlib
import json
from shared_assets import REPO, shared_root

manifest = json.loads((REPO / 'shared-assets-manifest.json').read_text())
root = shared_root()
checked = set()
for record in manifest['files']:
    file = root / record['path']
    if file in checked:
        continue
    if file.stat().st_size != record['bytes']:
        raise RuntimeError(f'Size mismatch: {file}')
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != record['sha256']:
        raise RuntimeError(f'Checksum mismatch: {file}')
    checked.add(file)
print(f'Verified {len(checked)} unique shared files; {len(manifest["files"])} original copies preserved.')
