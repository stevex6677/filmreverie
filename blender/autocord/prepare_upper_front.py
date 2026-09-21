"""Prepare the upper VIEW lens enamel maps using standalone remote Python."""
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import output_dir


# Coordinates measured on the displayed 1568-square before/upper_lens.png.
# These are independent inner/outer outlines, not concentric ideal circles.
_CENTER = [765., 787.]
_INNER = [[1114, 787], [1080, 603], [945, 469], [765, 416],
          [593, 461], [461, 597], [408, 787], [448, 958],
          [581, 1085], [765, 1135], [943, 1087], [1077, 955]]
_OUTER = [[1180, 787], [1129, 568], [978, 417], [765, 354],
          [554, 417], [397, 570], [341, 787], [396, 1003],
          [553, 1158], [765, 1220], [974, 1158], [1126, 1002]]
# Clockwise angles from twelve o'clock, measured from the actual VIEW photograph.
_LETTERING = [
    ('VIEW', [-8., 6., 19., 35.]),
    ('ROKKOR', [63., 76., 90., 105., 120., 136.]),
    ('1:3.2', [165., 179., 194., 201., 209.]),
    ('f=75mm', [249., 262., 275., 286., 298., 310.]),
]


def _letter_mask(size, font_path):
    """Supersample the unwrapped annulus; UV projection supplies the curvature."""
    width, height = size
    supersample = 3
    width_hi, height_hi = width * supersample, height * supersample
    mask = Image.new('L', (width_hi, height_hi), 0)
    font = ImageFont.truetype(str(font_path), 360)
    cap_box = font.getbbox('H')
    cap_height = cap_box[3] - cap_box[1]
    for text, angles in _LETTERING:
        for character, angle in zip(text, angles):
            box = font.getbbox(character)
            glyph = Image.new('L', (box[2] - box[0] + 8, box[3] - box[1] + 8), 0)
            ImageDraw.Draw(glyph).text((4 - box[0], 4 - box[1]), character,
                                      font=font, fill=255)
            # Preserve each glyph's baseline/descender rather than centering a
            # period or colon at cap height. Letter tops point radially outward.
            target_height = .48 * height_hi / cap_height
            angular_cap = 8.8
            target_width = angular_cap / 360 * width_hi / cap_height
            glyph = glyph.resize((max(1, round(glyph.width * target_width)),
                                  max(1, round(glyph.height * target_height))),
                                 Image.Resampling.LANCZOS)
            x = round((angle % 360) / 360 * width_hi - glyph.width / 2)
            y = round(.25 * height_hi + (box[1] - cap_box[1] - 4) * target_height)
            for offset in (-width_hi, 0, width_hi):
                mask.paste(glyph, (x + offset, y))
    return mask.resize(size, Image.Resampling.LANCZOS)


def main():
    root = output_dir('blender/autocord/detail_refinement') / 'references'
    root.mkdir(parents=True, exist_ok=True)
    reference = root / 'upper_lens_preview.jpg'
    if not reference.is_file():
        raise FileNotFoundError(reference)
    font_path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    size = (4096, 256)
    coverage = np.asarray(_letter_mask(size, font_path), dtype=np.float32) / 255
    enamel = np.array([21., 22., 21.], np.float32)
    ivory = np.array([225., 216., 185.], np.float32)
    rgb = enamel + coverage[:, :, None] * (ivory - enamel)
    color_name = 'upper_view_enamel_basecolor.png'
    roughness_name = 'upper_view_enamel_roughness.png'
    Image.fromarray(np.rint(rgb).astype(np.uint8), 'RGB').save(root / color_name)
    roughness = np.rint(255 * (.39 + .10 * coverage)).astype(np.uint8)
    Image.fromarray(roughness, 'L').save(root / roughness_name)
    calibration = {
        'reference': reference.name,
        'transcription': ['VIEW', 'ROKKOR', '1:3.2', 'f=75mm'],
        'letter_centers_clockwise_degrees': dict(_LETTERING),
        'font': str(font_path), 'texture_size': list(size),
        'basecolor': color_name, 'roughness': roughness_name,
        'enamel_srgb_8bit': enamel.astype(int).tolist(),
        'ivory_srgb_8bit': ivory.astype(int).tolist(),
        'baseline_image': 'before/upper_lens.png',
        'screen_size': 1568, 'ortho_scale': .31,
        'camera_target_xz': [.013, .565],
        'center_screen': _CENTER, 'inner_screen': _INNER, 'outer_screen': _OUTER,
        'depth_slab': [-.32, -.25], 'minimum_z': .46,
        'notes': 'Full scanned black inscription annulus; glass, thin outer lip and chrome excluded. '
                 'Independent outlines follow the noncircular scan. No reference illumination is baked. '
                 'Glyph tops face outward; bottom inscription is intentionally upside down, as photographed.',
    }
    (root / 'upper_view_calibration.json').write_text(json.dumps(calibration, indent=2) + '\n')
    print(json.dumps({'maps': [str(root / color_name), str(root / roughness_name)],
                      'calibration': str(root / 'upper_view_calibration.json')}))


if __name__ == '__main__':
    main()
