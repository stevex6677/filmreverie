"""Extract photographed pigment without baking photographic lighting into metal.
Run with remote_exec run python3; Blender operations remain in the MCP builder.
Coordinates below refer to 1568x1176 reference previews, not original JPEG pixels.
"""
from pathlib import Path
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from shared_assets import asset_path, output_dir

out = output_dir('blender/canon7s/refinement')
textures = out / 'textures'
textures.mkdir(exist_ok=True)
photos = {key: Image.open(asset_path('blender/canon7s/reference/' + name)).convert('RGB').resize((1568,1176),Image.Resampling.LANCZOS)
          for key,name in [('front','IMG_2050.jpg'),('rear','IMG_2052.jpg'),('top','IMG_2054.jpg')]}

def save_pigment(name, image, light, base, ink, metallic):
    a = np.asarray(image, dtype=np.float32)
    gray = a.mean(axis=2)
    coverage = np.clip((gray-76)/107,0,1) if light else np.clip((113-gray)/35,0,1)
    if not light:
        coverage=np.asarray(Image.fromarray(np.rint(coverage*255).astype('uint8')).filter(ImageFilter.MedianFilter(3)),dtype=float)/255
    rgb = np.array(base) + coverage[:,:,None]*(np.array(ink)-np.array(base))
    Image.fromarray(np.rint(rgb).astype('uint8')).save(textures/(name+'.png'))
    # The metallic image allows ink to remain non-metallic on the aluminum.
    m = np.rint(255*metallic*(1-coverage)).astype('uint8')
    Image.fromarray(m).save(textures/(name+'_metallic.png'))

def ellipse_patch(photo, center, radius, size=1536):
    cx,cy=center;rx,ry=radius
    return photo.transform((size,size),Image.Transform.AFFINE,(2*rx/size,0,cx-rx,0,2*ry/size,cy-ry),Image.Resampling.BICUBIC)

save_pigment('lens',ellipse_patch(photos['front'],(853,719),(197,202)),True,[24,25,26],[218,216,209],0)
# Re-typeset the four legible rear lines at their measured photographic widths.
# This avoids importing the shallow overlapping strokes visible in the scan.
rear_mask=Image.new('L',(1416,768),0)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',190)
for row,(text,width) in enumerate([('CANON',540),('CAMERA CO., INC.',1320),('MADE IN JAPAN',1236),('NO. 103959',864)]):
    box=font.getbbox(text)
    glyph=Image.new('L',(box[2]-box[0]+8,box[3]-box[1]+8),0)
    ImageDraw.Draw(glyph).text((4-box[0],4-box[1]),text,font=font,fill=255)
    rear_mask.paste(glyph.resize((width,120),Image.Resampling.LANCZOS),(54,30+row*186))
alpha=np.asarray(rear_mask,dtype=float)/255
rear_rgb=np.array([164,166,167])+alpha[:,:,None]*(np.array([17,18,18])-np.array([164,166,167]))
Image.fromarray(np.rint(rear_rgb).astype('uint8')).save(textures/'rear.png')
Image.fromarray(np.rint(255*.8*(1-alpha)).astype('uint8')).save(textures/'rear_metallic.png')
save_pigment('logo',photos['top'].crop((289,577,589,650)).resize((1800,438),Image.Resampling.LANCZOS),False,[164,166,167],[15,16,16],1)
save_pigment('shutter',ellipse_patch(photos['top'],(932,640),(109,103)),True,[18,19,20],[225,223,215],0)
# The meter is a window, not an ink decal; its multi-color scale is retained.
photos['top'].crop((614,600,818,679)).resize((1224,474),Image.Resampling.LANCZOS).save(textures/'meter.png')
# One continuous metal field avoids pasted rectangular finishes on the top.
# Only the measured wordmark contributes pigment; the other controls remain 3D.
atlas=Image.new('RGB',(4140,1160),(164,166,167))
metal_atlas=Image.new('L',atlas.size,255)
logo_box=(round((285-80)*4),round((596-552)*4),round((483-80)*4),round((647-552)*4))
size=(logo_box[2]-logo_box[0],logo_box[3]-logo_box[1])
atlas.paste(Image.open(textures/'logo.png').resize(size,Image.Resampling.LANCZOS),logo_box[:2])
metal_atlas.paste(Image.open(textures/'logo_metallic.png').resize(size,Image.Resampling.LANCZOS),logo_box[:2])
grain=np.random.default_rng(7).normal(0,.75,(1160,4140,1))
Image.fromarray(np.clip(np.asarray(atlas,dtype=float)+grain,0,255).astype('uint8')).save(textures/'top_plate.png')
metal_atlas.save(textures/'top_plate_metallic.png')
# Keep the exact camera lettering and note all transcriptions for continuation.
(out/'reference_details.json').write_text(json.dumps({
    'references':{'front':'IMG_2050.jpg','rear':'IMG_2052.jpg','top':'IMG_2054.jpg'},
    'lens':['VOIGTLÄNDER','COLOR-SKOPAR','35mm F2.5 MC'],
    'rear':['CANON','CAMERA CO., INC.','MADE IN JAPAN','NO. 103959'],
    'top':['Canon 7s','35','ASA','DIN','1000','500','250','125','60','30','15','8','4','2','1','B','T','X'],
    'method':'Photographed front/top glyph masks and accurately transcribed rear engraving on neutral enamel/aluminum; no wholesale photo projected onto the body.'
},indent=2))
print(json.dumps({'output':str(out),'textures':sorted(p.name for p in textures.glob('*.png'))},indent=2))
