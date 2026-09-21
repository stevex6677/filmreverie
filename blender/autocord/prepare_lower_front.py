"""Prepare calibrated taking-lens, shutter and curved focus-band PBR maps.

Run outside Blender with FILM_PHOTO_OUTPUT_DIR set to the delivery run. Original
photos remain read-only; the lower-lens and front-lower previews guide the ink.
"""
from pathlib import Path
from math import cos, sin, radians
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import output_dir


TAKING = {'center': [.012, .306], 'radii': [.088, .085],
          'rho': [.80, 1.005], 'bounds': [-.082, .106, .215, .397],
          'depth': [-.32, -.25]}
SHUTTER = {'center': [.013, .311], 'radii': [.139, .141],
           'rho': [.85, 1.055], 'bounds': [-.133, .159, .163, .459],
           'depth': [-.298, -.275]}
# The physical band is not circular. These world-X/Z stations are measured from
# before/front_lower_details.png; its existing chrome outline stays outside.
FOCUS_X = [-.169, -.14, -.11, -.075, -.04, 0., .04, .08, .12, .155, .192]
FOCUS_TOP = [.137, .124, .113, .104, .098, .095, .097, .104, .118, .137, .159]
FOCUS_BOTTOM = [.109, .091, .078, .068, .061, .059, .061, .068, .084, .106, .134]
METER = [('∞', -.158), ('10', -.133), ('5', -.108), ('4', -.092),
         ('3', -.066), ('2.5', -.045), ('2', -.010), ('1.7', .022),
         ('1.5', .050), ('1.3', .087), ('1.2', .115), ('1.1', .145),
         ('1', .170), ('m', .187)]
FEET = [('30', -.138), ('15', -.109), ('12', -.090), ('10', -.071),
        ('8', -.046), ('7', -.025), ('6', .001), ('5', .041),
        ('4.5', .068), ('4', .104), ('3.5', .153), ('ft', .174)]


def _font(size, thin=False, condensed=False):
    directory = Path('/usr/share/fonts/truetype/dejavu')
    names = (['DejaVuSans-ExtraLight.ttf', 'DejaVuSans.ttf'] if thin else
             ['DejaVuSansCondensed.ttf', 'DejaVuSans.ttf'] if condensed else
             ['DejaVuSans.ttf'])
    for name in names:
        if (directory / name).is_file():
            return ImageFont.truetype(str(directory / name), size)
    raise FileNotFoundError('The remote DejaVu Sans font family is required')


def _glyph(text, height, thin=False, condensed=False, width_factor=1.):
    font = _font(192, thin, condensed)
    box = font.getbbox(text)
    image = Image.new('L', (box[2] - box[0] + 12, box[3] - box[1] + 12))
    ImageDraw.Draw(image).text((6-box[0], 6-box[1]), text, font=font, fill=255)
    box = image.getbbox()
    image = image.crop(box)
    width = max(1, round(image.width * height / image.height * width_factor))
    return image.resize((width, max(1, round(height))), Image.Resampling.LANCZOS)


def _stamp(mask, glyph, position, rotation=0):
    glyph = glyph.rotate(rotation, Image.Resampling.BICUBIC, expand=True)
    xy = (round(position[0] - glyph.width/2), round(position[1] - glyph.height/2))
    # Maximum, rather than alpha-pasting a mask onto itself, preserves edge AA.
    patch = Image.new('L', mask.size)
    patch.paste(glyph, xy)
    from PIL import ImageChops
    return ImageChops.lighter(mask, patch)


def _ring_point(spec, theta, rho, size):
    theta = radians(theta)
    cx, cz = spec['center']
    rx, rz = spec['radii']
    left, right, bottom, top = spec['bounds']
    return ((cx + rx*rho*cos(theta)-left)/(right-left)*size,
            (top-cz-rz*rho*sin(theta))/(top-bottom)*size)


def _ring_text(mask, text, spec, angles, rho, height, inward=False,
               thin=False, condensed=False, width_factor=1.):
    size = mask.width
    pixel_height = height*size/(spec['bounds'][3]-spec['bounds'][2])
    if len(text) != len(angles):
        raise ValueError('One calibrated angle is required per glyph')
    font = _font(192, thin, condensed)
    cap = font.getbbox('H')
    cap_height = cap[3]-cap[1]
    for character, angle in zip(text, angles):
        if character != ' ':
            layout = font.getbbox(character)
            ink = font.getmask(character).getbbox()
            # Layout bounds include blank descent space (notably for '-' and
            # '='); use actual ink bounds before sizing the cropped glyph.
            box = (layout[0]+ink[0], layout[1]+ink[1],
                   layout[0]+ink[2], layout[1]+ink[3])
            glyph = _glyph(character, pixel_height*(box[3]-box[1])/cap_height,
                           thin, condensed, width_factor)
            # Keep lowercase and punctuation on the same baseline as capitals.
            offset = pixel_height*(box[1]+box[3]-cap[1]-cap[3])/(2*cap_height)
            direction = 1 if inward else -1
            x, y = _ring_point(spec, angle, rho, size)
            position = (x+direction*offset*cos(radians(angle)),
                        y-direction*offset*sin(radians(angle)))
            mask = _stamp(mask, glyph, position, angle + 90 if inward else angle - 90)
    return mask


def _aged_base(size, color, seed, amplitude):
    width, height = size
    rng = np.random.default_rng(seed)
    grain = rng.normal(0, amplitude, (height, width)).astype(np.float32)
    # Low-contrast oxide variation, not photographic illumination or old letters.
    grain += .45*amplitude*np.sin(np.arange(height, dtype=np.float32)[:, None]*.17)
    return np.clip(np.asarray(color, np.float32)[None, None, :] + grain[:, :, None], 0, 255)


def _save_maps(root, name, rgb, ink, metallic, roughness, ink_color, red=None):
    alpha = np.asarray(ink, np.float32)/255
    rgb = rgb*(1-alpha[:, :, None]) + np.asarray(ink_color)*alpha[:, :, None]
    metallic = np.broadcast_to(np.asarray(metallic, np.float32), alpha.shape).copy()
    roughness = np.broadcast_to(np.asarray(roughness, np.float32), alpha.shape).copy()
    metallic *= 1-alpha
    roughness = roughness*(1-alpha) + .51*alpha
    if red is not None:
        a = np.asarray(red, np.float32)/255
        rgb = rgb*(1-a[:, :, None]) + np.array([155, 36, 27])*a[:, :, None]
        metallic *= 1-a
        roughness = roughness*(1-a)+.51*a
    color_path = root/(name+'_basecolor.png')
    mr_path = root/(name+'_metallic_roughness.png')
    Image.fromarray(np.uint8(np.clip(rgb, 0, 255))).save(color_path)
    mr = np.zeros((*alpha.shape, 3), np.uint8)
    mr[:, :, 0] = 255
    mr[:, :, 1] = np.uint8(np.clip(roughness, 0, 1)*255)
    mr[:, :, 2] = np.uint8(np.clip(metallic, 0, 1)*255)
    Image.fromarray(mr).save(mr_path)
    return {'basecolor': color_path.name, 'metallic_roughness': mr_path.name,
            'resolution': list(ink.size)}


def _taking_maps(root):
    size = 2048
    ink = Image.new('L', (size, size))
    ink = _ring_text(ink, 'MINOLTA', TAKING, np.linspace(225, 157, 7), .907, .0083)
    ink = _ring_text(ink, 'ROKKOR', TAKING, [132, 121, 110, 99, 88, 77], .912, .0087)
    ink = _ring_text(ink, '1:3.5', TAKING, [58, 51, 44, 38, 30], .911, .0082)
    ink = _ring_text(ink, 'f=75mm', TAKING, [8, -3, -14, -25, -37, -49], .911, .0078)
    ink = _ring_text(ink, '1136765', TAKING, np.linspace(-65, -118, 7), .909, .0074)
    return _save_maps(root, 'lower_taking', _aged_base((size, size), [20, 20, 19], 731, .85),
                      ink, .06, .32, [222, 217, 190])


def _shutter_maps(root):
    size = 2048
    ink, red = Image.new('L', (size, size)), Image.new('L', (size, size))
    ink = _ring_text(ink, 'CITIZEN-MVL', SHUTTER, np.linspace(221, 278, 11), .938,
                     .0111, inward=True, thin=True, width_factor=.90)
    height = .0114*size/(SHUTTER['bounds'][3]-SHUTTER['bounds'][2])
    for number, angle in zip(range(3, 19), np.linspace(103, -9, 16)):
        glyph = _glyph(str(number), height, condensed=True, width_factor=.69)
        target = red if number == 3 else ink
        target = _stamp(target, glyph, _ring_point(SHUTTER, angle, .939, size), angle+90)
        if number == 3:
            red = target
        else:
            ink = target
    draw = ImageDraw.Draw(ink)
    for start, end in [(113, 211), (-15, -72)]:
        angles = np.linspace(start, end, 300)
        outside = [_ring_point(SHUTTER, a, .932, size) for a in angles]
        inside = [_ring_point(SHUTTER, a, .907, size) for a in angles[::-1]]
        draw.polygon(outside+inside, fill=255)
    return _save_maps(root, 'lower_shutter', _aged_base((size, size), [177, 175, 166], 732, 1.7),
                      ink, .88, .34, [27, 25, 23], red)


def _focus_maps(root):
    width, height = 4096, 512
    silver = _aged_base((width, height), [187, 185, 172], 733, 1.4)
    black = _aged_base((width, height), [23, 24, 22], 734, .7)
    row = np.arange(height)[:, None]/height
    split = .46
    rgb = np.where((row < split)[:, :, None], silver, black)
    metallic = np.broadcast_to(np.where(row < split, .78, .04), (height, width)).copy()
    roughness = np.broadcast_to(np.where(row < split, .36, .35), (height, width)).copy()
    meter, feet = Image.new('L', (width, height)), Image.new('L', (width, height))
    span = FOCUS_X[-1]-FOCUS_X[0]
    for entries, center, target, color, physical_height in [
            (METER, .225, meter, (29, 29, 26), .0081),
            (FEET, .72, feet, (94, 158, 68), .0084)]:
        for text, x in entries:
            band_height = np.interp(x, FOCUS_X, FOCUS_TOP)-np.interp(x, FOCUS_X, FOCUS_BOTTOM)
            glyph_height = min(.34*height, physical_height/band_height*height)
            glyph = _glyph(text, glyph_height, condensed=True)
            # Account for the UV strip's non-square physical texel dimensions.
            ratio = width*band_height/(span*height)
            glyph = glyph.resize((max(1, round(glyph.width*ratio)), glyph.height), Image.Resampling.LANCZOS)
            target = _stamp(target, glyph, ((x-FOCUS_X[0])/span*width, center*height))
        a = np.asarray(target, np.float32)/255
        rgb = rgb*(1-a[:, :, None])+np.asarray(color)*a[:, :, None]
        metallic *= 1-a
        roughness = roughness*(1-a)+.51*a
    # Delicate meter index lines belong to the silver strip, not the handle.
    ticks = Image.new('L', (width, height))
    draw = ImageDraw.Draw(ticks)
    for text, x in METER[:-1]:
        px = (x-FOCUS_X[0])/span*width
        draw.line((px, 1, px, 17), fill=180, width=2)
    a = np.asarray(ticks, np.float32)/255
    rgb = rgb*(1-a[:, :, None])+np.array([37, 37, 31])*a[:, :, None]
    metallic *= 1-a
    return _save_maps(root, 'lower_focus', rgb, Image.new('L', (width, height)),
                      metallic, roughness, [0, 0, 0])


def prepare_lower_front():
    root = output_dir('blender/autocord/detail_refinement')/'references'
    root.mkdir(parents=True, exist_ok=True)
    for name in ('lower_lens_preview.jpg', 'front_lower_details_preview.jpg'):
        if not (root/name).is_file():
            raise FileNotFoundError(root/name)
    maps = {'taking': _taking_maps(root), 'shutter': _shutter_maps(root), 'focus': _focus_maps(root)}
    report = {
        'maps': maps, 'taking': TAKING, 'shutter': SHUTTER,
        'focus': {'x': FOCUS_X, 'top': FOCUS_TOP, 'bottom': FOCUS_BOTTOM,
                  'depth': [-.18, -.105], 'meter_fraction': [0, .46]},
        'transcription': {'taking': ['MINOLTA', 'ROKKOR', '1:3.5', 'f=75mm', '1136765'],
                          'shutter': 'CITIZEN-MVL', 'ev': list(range(3, 19)),
                          'meter': [item[0] for item in METER], 'feet': [item[0] for item in FEET]},
        'source_references': ['lower_lens_preview.jpg', 'front_lower_details_preview.jpg'],
        'serial_evidence': '1136765 is legible upside-down at the taking lens bottom in both photographs.',
        'orientation': 'Taking lettering tops face outward; EV digits inward; CITIZEN-MVL upright along bottom.',
        'uncertainties': ['Exact historic typeface is approximated by DejaVu Sans / ExtraLight / Condensed.',
                          'Focus-band X/Z calibration follows the existing slightly asymmetric scanned strip.',
                          'No flash/bulb changes: original controls and their markings are retained.'],
        'geometry_policy': 'Retain topology and lens/body shapes; level only shallow false lettering relief within the shutter inscription surface.',
    }
    (root/'lower_front_maps.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


if __name__ == '__main__':
    prepare_lower_front()
