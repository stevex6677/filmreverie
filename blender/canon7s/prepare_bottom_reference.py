"""Convert the read-only HEIC underside reference remotely with Pillow/pillow-heif."""
from pathlib import Path
import hashlib
import json
import sys
from PIL import Image, ImageOps
import pillow_heif
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import asset_path, output_dir
pillow_heif.register_heif_opener()
source=asset_path('blender/canon7s/reference/bottom.HEIC')
out=output_dir('blender/canon7s/bottom_reference')
with Image.open(source) as image:
    converted=ImageOps.exif_transpose(image).convert('RGB')
    converted.save(out/'bottom_reference.jpg',quality=96)
    report={'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'dimensions':list(converted.size),'converted':str(out/'bottom_reference.jpg')}
(out/'reference_report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
