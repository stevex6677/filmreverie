"""Convert read-only HEIC references into shared generated inspection JPEGs."""
from pathlib import Path
import sys
from PIL import Image, ImageOps
import pillow_heif
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, output_dir
pillow_heif.register_heif_opener()
out = output_dir('blender/autocord/detail_refinement') / 'references'
out.mkdir(parents=True, exist_ok=True)
for name in ('front_logo', 'right_side_text', 'back_numbers', 'bottom', 'bottom_close',
             'upper_lens', 'lower_lens', 'front_lower_details'):
    with Image.open(asset_path('blender/autocord/reference/' + name + '.HEIC')) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
        image.save(out / (name + '.jpg'), quality=97)
        image.thumbnail((1600,1600))
        image.save(out / (name + '_preview.jpg'), quality=95)
        print(name, source.size, image.size)
