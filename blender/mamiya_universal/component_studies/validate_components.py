"""Verify independent scenes, camera margins, external assets and the body's open throat."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts'))
from shared_assets import asset_path, generated_path, output_dir

import bpy,os,json,math
from mathutils import Vector
OUT=str(generated_path('blender/mamiya_universal/component_studies'))
reports=[]
for part,expected_cameras in [('body',4),('lens',3),('film_back',4)]:
 bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,part+'_study.blend'))
 s=bpy.context.scene;bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();g=bpy.data.collections['01 Editable component']
 roots=[o for o in g.objects if o.type=='EMPTY'];assert len(roots)==1
 assert len(bpy.data.scenes)==1 and roots[0]['status']=='Independent shape study. Not assembled.'
 pts=[];obstructions=[]
 for o in g.objects:
  if o.type not in {'MESH','CURVE','FONT'}:continue
  assert o.parent==roots[0]
  eo=o.evaluated_get(dg);me=eo.to_mesh();pts.extend(eo.matrix_world@v.co for v in me.vertices);eo.to_mesh_clear()
  if part=='body' and o.type=='MESH':
   inv=eo.matrix_world.inverted();origin=inv@Vector((0,-.2,.06));direction=inv.to_3x3()@Vector((0,1,0))
   hit,co,normal,index=eo.ray_cast(origin,direction,distance=.4)
   if hit:obstructions.append(o.name)
 assert all(math.isfinite(value) for point in pts for value in point)
 assert not obstructions,obstructions
 cameras=sorted([o for o in s.objects if o.type=='CAMERA'],key=lambda o:o.name);assert len(cameras)==expected_cameras
 framing={}
 for cam in cameras:
  local=[cam.matrix_world.inverted()@p for p in pts];k=cam.data.ortho_scale
  frame={'left':.5+min(p.x for p in local)/k,'right':.5+max(p.x for p in local)/k,'bottom':.5+min(p.y for p in local)/k,'top':.5+max(p.y for p in local)/k}
  assert frame['left']>=.10 and frame['right']<=.90 and frame['bottom']>=.10 and frame['top']<=.90,(cam.name,frame)
  framing[cam.name]={key:round(v,4) for key,v in frame.items()}
 missing=[im.filepath for im in bpy.data.images if im.source=='FILE' and not im.packed_file and not os.path.exists(bpy.path.abspath(im.filepath))];assert not missing
 reports.append({'part':part,'single_component_scene':True,'objects':len(g.objects),'bounds_mm':[round(1000*(max(p[i] for p in pts)-min(p[i] for p in pts)),2) for i in range(3)],'framing':framing,'missing_assets':missing,'body_center_light_path_clear':True if part=='body' else None})
with open(os.path.join(OUT,'validation.json'),'w') as f:json.dump(reports,f,indent=2)
print(json.dumps(reports),flush=True)
