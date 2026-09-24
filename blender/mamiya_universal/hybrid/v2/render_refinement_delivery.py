"""Long-running delivery renders, launched through Blender CLI as a child job."""
from pathlib import Path
import bpy, json, traceback

out=Path(bpy.data.filepath).parent
assert 'ignored_generated' in out.parts and 'refinement' in out.parts
progress={'status':'running','completed':[]}
status=out/'delivery-progress.json'
try:
    p=Path(__file__).with_name('render_refinement.py')
    for view,res,samples in [('rear_detail',1600,96),('optical_detail',1600,96),('front_overview',1400,64)]:
        progress['current']=view;status.write_text(json.dumps(progress,indent=2))
        ns={'__file__':str(p),'VIEW':view,'RESOLUTION':res,'SAMPLES':samples}
        exec(compile(p.read_text(),str(p),'exec'),ns)
        progress['completed'].append(ns['result'])
    p=Path(__file__).with_name('validate_refinement.py')
    ns={'__file__':str(p)};exec(compile(p.read_text(),str(p),'exec'),ns)
    progress['status']='complete';progress.pop('current',None)
except Exception:
    progress['status']='failed';progress['error']=traceback.format_exc()
    raise
finally:
    status.write_text(json.dumps(progress,indent=2))
