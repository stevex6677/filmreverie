"""Prepare reference-derived inscription maps without editing original photographs."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir
root=output_dir('blender/autocord/detail_refinement')/'references'
for name in ('front_logo','right_side_text'):
    image=Image.open(root/(name+'.jpg')).convert('RGB')
    a=np.asarray(image,dtype=np.float32)/255
    lum=a@np.array([.2126,.7152,.0722],np.float32)
    level=.025+.87*np.clip((lum-.29)/.65,0,1)**1.35
    rgb=np.repeat(level[:,:,None],3,axis=2)
    if name=='right_side_text':
        green=(a[:,:,1]>a[:,:,0]*1.10)&(a[:,:,1]>a[:,:,2]*1.05)
        rgb[green]=np.minimum(a[green]*np.array([.8,1,.8]),1)
    Image.fromarray(np.uint8(np.clip(rgb,0,1)*255)).save(root/(name+'_detail.png'))
# The rear reference unambiguously reads 457647; recreate these six narrow digits
# rather than baking the room's broad specular reflection into the enamel strip.
label=Image.new('RGB',(1400,400),(7,7,7))
d=ImageDraw.Draw(label)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',210)
text='457647';box=d.textbbox((0,0),text,font=font)
d.text(((1400-(box[2]-box[0]))/2,(400-(box[3]-box[1]))/2-box[1]),text,font=font,fill=(205,203,194),stroke_width=0)
label.save(root/'back_numbers_detail.png')
print('Prepared three local inscription textures')
