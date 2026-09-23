"""Rectify only the supplied detail photographs; run with remote_exec."""
from pathlib import Path
import os, sys
import numpy as np
from PIL import Image
import cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import asset_path,output_dir
out=output_dir('blender/canon_demi_ee17/refinement')/'textures';out.mkdir(exist_ok=True)
def photo(name):
    im=Image.open(asset_path('blender/canon_demi_ee17/references/'+name+'.jpg')).convert('RGB')
    return np.asarray(im.resize((1824,1368),Image.Resampling.LANCZOS))
def warp(name,quad,size):
    w,h=size
    matrix=cv2.getPerspectiveTransform(np.float32(quad),np.float32([(0,0),(w-1,0),(w-1,h-1),(0,h-1)]))
    return cv2.warpPerspective(photo(name),matrix,(w,h),flags=cv2.INTER_CUBIC)
Image.fromarray(photo('front')[430:1118,570:1258]).save(out/'lens.png')
Image.fromarray(warp('front',[(220,308),(568,313),(567,393),(218,390)],(1392,320))).save(out/'badge.png')
Image.fromarray(warp('back',[(350,519),(1305,532),(1303,575),(350,561)],(1910,86))).save(out/'rear.png')
Image.fromarray(photo('bottom')[587:853,671:937]).save(out/'bottom-dial.png')
# White top letters are extracted from the user's oblique photo and rectified.
# Corners enclose the two-line wordmark with its photographed orientation.
top=warp('top',[(729,411),(953,484),(888,588),(667,514)],(640,420))
gray=top.mean(axis=2);mask=np.clip((gray-92)/115,0,1)
color=np.array([9,10,10])[None,None,:]*(1-mask[:,:,None])+np.array([223,222,208])[None,None,:]*mask[:,:,None]
Image.fromarray(color.astype('uint8')).save(out/'top-logo.png')
print(out)
