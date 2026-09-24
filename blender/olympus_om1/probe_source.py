"""Print surface measurements calibrated to source orthographic renders."""
import bpy,numpy as np,json
ob=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices));co=np.empty((len(ob.data.vertices),3),np.float32);ob.data.vertices.foreach_get('co',co.ravel())
s=.980377197265625*1.18/900
for view,points in {'front':[(480,312),(480,280),(300,350),(620,350),(480,420),(375,529),(480,634),(560,529)],'top':[(330,326),(240,360),(170,325),(720,315),(615,350),(625,277),(628,372),(630,250),(560,380),(450,420),(478,295)],'bottom':[(450,580),(180,580),(470,547),(740,630)]}.items():
 for px,py in points:
  if view=='front':d=np.linalg.norm(co[:,[0,2]]-[(px-450)*s,.63055419921875/2+(450-py)*s],axis=1);axis=1
  else:d=np.linalg.norm(co[:,[0,1]]-[(px-450)*s,(450-py)*s*(1 if view=='top' else -1)],axis=1);axis=2
  ids=np.flatnonzero(d<.004)
  vals=co[ids,axis]
  print(view,(px,py), 'position',[(px-450)*s,(450-py)*s], 'depth', np.quantile(vals,[0,.1,.5,.9,1]).tolist() if len(vals) else [],flush=True)
