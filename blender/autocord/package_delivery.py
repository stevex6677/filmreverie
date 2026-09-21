"""Package an inspected run: matched before/after images and checksum manifest."""
from pathlib import Path
import argparse, hashlib, json, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import generated_path, asset_path
parser=argparse.ArgumentParser()
parser.add_argument('run')
parser.add_argument('--previous-run',required=True,help='Previous complete delivery run')
parser.add_argument('--before-renders',required=True,help='Matched close-up renders, relative to runs/')
args=parser.parse_args()
run=generated_path('blender/autocord/detail_refinement/runs/'+args.run)
previous=generated_path('blender/autocord/detail_refinement/runs/'+args.previous_run)
before=generated_path('blender/autocord/detail_refinement/runs/'+args.before_renders)
views=['front','upper_lens','lower_lens','front_lower_details','front_oblique']
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',26)
for view in views:
    original=previous if view=='front' else before
    sheet=Image.new('RGB',(2000,1050),(30,32,33));draw=ImageDraw.Draw(sheet)
    for x,folder,label in [(0,original,'Previous delivery'),(1000,run,'Front lettering refinement')]:
        image=Image.open(folder/(view+'.png')).convert('RGB');image.thumbnail((1000,1000))
        sheet.paste(image,(x,50));draw.text((x+25,12),label,font=font,fill=(235,235,235))
    sheet.save(run/('comparison_'+view+'.jpg'),quality=94)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
export=json.loads((run/'export_report.json').read_text())
assert digest(run/'autocord-refined.blend')==export['master_sha256']
assert digest(run/'minolta-autocord.glb')==export['glb_sha256']
manifest={'schema_version':1,'model_id':'minolta-autocord','state':'visually_reviewed_delivery',
 'source_code_base_revision':'5eeb357',
 'comparison_master':{'run':args.previous_run,'sha256':digest(previous/'autocord-refined.blend')},
 'source':{'path':'blender/autocord/tripo/tripo_autocord.glb','root':'ignored_assets','sha256':export['source_sha256']},
 'references':{name:digest(asset_path('blender/autocord/reference/'+name+'.HEIC')) for name in ('front_logo','right_side_text','back_numbers','bottom','bottom_close','upper_lens','lower_lens','front_lower_details')},
 'export':export,'geometry':json.loads((run/'refinement_report.json').read_text()),
 'renders':{name:digest(run/name) for name in json.loads((run/'render_complete.json').read_text())['views']},
 'browser_evidence':{p.name:digest(p) for p in sorted(run.glob('viewer-*.png'))},
 'comparisons':{p.name:digest(p) for p in sorted(run.glob('comparison_*.jpg'))},
 'code':{p.name:digest(p) for p in sorted(Path(__file__).parent.glob('*.py'))}}
(run/'delivery_manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
