import bpy,numpy as np
ob=next(o for o in bpy.context.scene.objects if o.type=='MESH');co=np.empty((len(ob.data.vertices),3),np.float32);ob.data.vertices.foreach_get('co',co.ravel());x,y,z=co.T;r=np.hypot(x-.038,z-.214)
for lo,hi in [(-.30,-.28),(-.26,-.233),(-.123,-.103),(-.1,-.078),(-.061,-.036),(-.036,-.02)]:
 mask=(y>lo)&(y<hi)&(abs(x-.038)<.025)&(z>.35)
 print('band',lo,hi,np.quantile(r[mask],[0,.1,.5,.9,1]).tolist(),flush=True)
mask=(abs(x-.038)<.11)&(z>.469)&(z<.515)&(y<.025)
a=np.column_stack([x[mask],z[mask],np.ones(mask.sum())]);v=y[mask];coef=np.linalg.lstsq(a,v,rcond=None)[0]
print('nameplate fit',coef.tolist(),np.quantile(v-a@coef,[0,.1,.5,.9,1]).tolist(),flush=True)
