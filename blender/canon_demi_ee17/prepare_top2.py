"""Decode the read-only HEIC reference, then rectify its lettering for the mesh."""
from pathlib import Path
from PIL import Image, ImageOps
import pillow_heif
import cv2,numpy as np,json
pillow_heif.register_heif_opener()
out=Path('/workspace/film_photo/ignored_generated/blender/canon_demi_ee17/refinement/runs/20260923T-top2-b')
out.mkdir(parents=True,exist_ok=True)
source=Path('/workspace/film_photo/ignored_assets/blender/canon_demi_ee17/references/top2.HEIC')
im=ImageOps.exif_transpose(Image.open(source)).convert('RGB')
im.save(out/'top2-decoded.png')
im.thumbnail((1800,1800));im.save(out/'top2-review.jpg',quality=96)
photo=np.asarray(im)
src=np.float32([(535,851),(826,845),(816,621),(540,628)])
dst=np.float32([(829,429),(644,429),(644,608),(829,608)])
H=cv2.getPerspectiveTransform(src,dst)
aligned=cv2.warpPerspective(photo,H,(1200,1200),flags=cv2.INTER_CUBIC)
Image.fromarray(aligned).save(out/'top2-aligned.png')
# One continuous atlas puts the lettering directly into the black band's
# surface. Rectify the two-line inscription independently of the perspective
# at the control tops, with its baselines parallel to the camera body.
quad=np.float32([(847,625),(1087,621),(1089,770),(849,774)])
M=cv2.getPerspectiveTransform(quad,np.float32([(0,0),(767,0),(767,479),(0,479)]))
letters=cv2.warpPerspective(photo,M,(768,480),flags=cv2.INTER_CUBIC)
mask=np.clip((letters.mean(axis=2)-72)/135,0,1)
mask=np.rot90(mask,2)
# Photographic fine grain, with broad illumination removed. Mirrored tiles
# have continuous values at each repeated edge.
grain=photo[659:787,1097:1137].mean(axis=2).astype(np.float32)
grain=grain-cv2.GaussianBlur(grain,(0,0),7)
grain=np.concatenate([grain,grain[:,::-1]],axis=1)
grain=np.concatenate([grain,grain[::-1]],axis=0)
field=np.tile(grain,(5,15))[:1200,:1200]
field=np.clip(field,-12,12)
atlas=np.clip(22+field*.65,8,38)
atlas=np.repeat(atlas[:,:,None],3,axis=2)
# World-pixel placement comes from the accessory-shoe registration above.
l,t,r,b=470,484,629,605
mask=cv2.resize(mask,(r-l,b-t),interpolation=cv2.INTER_AREA)
atlas[t:b,l:r]=atlas[t:b,l:r]*(1-mask[:,:,None])+np.array([224,223,210])*mask[:,:,None]
Image.fromarray(atlas.astype('uint8')).save(out/'top2-band-color.png')
dx=cv2.Sobel(field,cv2.CV_32F,1,0,ksize=3)*.005
dy=cv2.Sobel(field,cv2.CV_32F,0,1,ksize=3)*.005
normal=np.stack([-dx,dy,np.ones_like(dx)],axis=-1)
normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
Image.fromarray(np.clip((normal*.5+.5)*255,0,255).astype('uint8')).save(out/'top2-band-normal.png')
def mapped(points):return cv2.perspectiveTransform(np.float32([points]),H)[0].round(2).tolist()
print('MAPPED',json.dumps({'logo':mapped([(847,625),(1087,621),(1089,770),(849,774)]),
    'controls':mapped([(326,716),(1512,676),(1259,613)]),
    'band':mapped([(130,692),(218,650),(309,593),(420,588),(1090,573),(1168,582),(1355,580),(1440,574),(1540,590),(1665,651),(1700,730),(1685,770),(1590,790),(1480,844),(1320,848),(1194,843),(1110,830),(457,849),(374,863),(242,843),(168,776),(126,784)])}))
print('REFERENCE',im.size,str(out))
