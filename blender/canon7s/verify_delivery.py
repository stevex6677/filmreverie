"""Verify Canon deliverables and emit an integrity manifest under ignored_generated.

Before publication, set FILM_PHOTO_OUTPUT_DIR to the candidate run. After adding
CURRENT.json, the default verifies its paths/checksums against the viewer catalog.
Run locally; this script never edits tracked metadata.
"""
from pathlib import Path
import hashlib
import json
import os
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import generated_path,asset_path,output_dir
root=Path(__file__).resolve().parents[2]
current_path=Path(__file__).with_name('CURRENT.json')
current=json.loads(current_path.read_text()) if current_path.exists() else None
if os.environ.get('FILM_PHOTO_OUTPUT_DIR'):
    out=output_dir('blender/canon7s/refinement')
else:
    assert current is not None, 'Set FILM_PHOTO_OUTPUT_DIR for an unpublished candidate'
    out=generated_path(current['editable_blend']['path']).parent


def entry(path):
    storage = generated_path('')
    if path.is_absolute() and not path.is_relative_to(storage):
        # Historical reports retain their original host's absolute paths.
        path = storage.joinpath(*path.parts[path.parts.index(storage.name) + 1:])
    return {'path':str(path.relative_to(storage)),
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}


source=asset_path('blender/canon7s/tripo/tripo_canon7s.glb')
source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
assert source_sha=='426aae8ecfc6f707387e64056ba1db3588fea92354c7b693e69fdbaea99f7220'
report=json.loads((out/'refinement_report.json').read_text())
exports=json.loads((out/'export_report.json').read_text())
renders=json.loads((out/'render_complete.json').read_text())
assert exports['master_unchanged'] and exports['browser_reimport']['all_images_packed']
assert report['outside_patch_coordinates_identical'] and report['unchanged_topology'] and report['packed_images']
assert report['source_sha256']==source_sha
surface_path=out/'surface_report.json'
surface=json.loads(surface_path.read_text()) if surface_path.exists() else None
if surface:
    for field in ['protected_coordinates_unchanged','topology_unchanged','uv_layers_unchanged',
                  'restored_materials_unchanged','separate_detail_objects_unchanged']:
        assert surface[field],field
    assert surface['moved_vertices']>0 and surface['maximum_displacement']<.015
    assert all(p['vertices']>10 and p['rms_after']<p['rms_before']*.3 for p in surface['fascia_planes'])
    assert entry(Path(surface['parent_master']))['sha256']==surface['parent_sha256']
    assert all(exports[key]['surface_vertex_colors_preserved'] for key in ['full_detail','browser'])
bottom_path=out/'bottom_report.json'
bottom=json.loads(bottom_path.read_text()) if bottom_path.exists() else None
if bottom:
    assert bottom['status']=='complete' and bottom['packed_file_images']
    assert entry(Path(bottom['parent_master']))['sha256']==bottom['parent_sha256']
    assert hashlib.sha256(asset_path('blender/canon7s/reference/bottom.HEIC').read_bytes()).hexdigest()==bottom['reference_source_sha256']
    preserved=bottom['preservation']
    for field in ['all_source_vertex_coordinates_exactly_preserved','outside_materials_unchanged',
                  'retained_topology_exact','original_smoothing_flags_exact','encoded_custom_normals_retained_exactly']:
        assert preserved[field],field
    assert preserved['source_vertices_before']==preserved['source_vertices_after']
    assert preserved['source_faces_before']-preserved['source_faces_after']==preserved['removed_local_faces']>0
    assert preserved['outside_underside_decoded_normal_max_abs_error']<=1e-6
    for collection in ['uv_layers','color_attributes']:
        assert all(layer['retained_values_exact'] for layer in preserved[collection].values())
    scale=bottom['physical_scale']
    assert scale['width_unchanged'] and scale['requested_width_mm']==138 and not scale['master_was_rescaled']
    assert bottom['socket']['opening_clear_to_blind_end'] and bottom['socket']['clear_aperture_ray_count']==25
    assert bottom['socket']['nominal_major_diameter_mm']==6.35 and bottom['socket']['pitch_mm']==1.27
    assert exports['browser_reimport']['socket_clear_aperture_rays']==25
    assert len(exports['browser_reimport']['underside_objects'])==len(bottom['added_objects'])
master=entry(out/'canon7s-refined.blend')
assert master['sha256']==exports['source_blend_sha256']
if bottom:
    assert master['sha256']==bottom['master_sha256']
files={}
for key,filename in [('full_detail','canon7s-refined.glb'),('browser','canon7s-browser.glb')]:
    item=entry(out/filename)
    assert item['sha256']==exports[key]['sha256']
    item.update({k:exports[key][k] for k in ['triangles','embedded_images','source_blend_sha256']})
    files[key]=item
render_files=[entry(out/(name+'.png')) for name in renders['views']]
assert {'front','rear','top','oblique','lens_detail','rear_detail','top_oblique'} <= set(renders['views'])
if bottom:
    assert {'bottom','bottom_oblique'}<=set(renders['views'])
browser_review=json.loads((out/'browser_review/render_complete.json').read_text())
assert set(browser_review['views'])==({'top','oblique','bottom','bottom_oblique'} if bottom else {'top','oblique'})
browser_renders=[entry(out/'browser_review'/(name+'.png')) for name in browser_review['views']]
revision=os.environ.get('CANON7S_CODE_REVISION') or (current or {}).get('source_code_base_revision')
assert revision and len(revision)==40, 'Set CANON7S_CODE_REVISION to the local checkout base commit'
manifest={
    'model_id':'canon-7s','state':'bottom-refined' if bottom else 'surface-smoothed' if surface else 'reference-refined',
    'source_code_base_revision':revision,
    'source':{'path':'blender/canon7s/tripo/tripo_canon7s.glb','sha256':source_sha},
    'references':[{'path':'blender/canon7s/reference/'+name,'sha256':hashlib.sha256(asset_path('blender/canon7s/reference/'+name).read_bytes()).hexdigest()} for name in ['IMG_2050.jpg','IMG_2052.jpg','IMG_2054.jpg']],
    'editable_blend':master,'full_detail_glb':files['full_detail'],'browser_glb':files['browser'],
    'renders':render_files,
    'browser_renders':browser_renders,
    'reports':{'refinement':str((out/'refinement_report.json').relative_to(generated_path(''))),'export':str((out/'export_report.json').relative_to(generated_path('')))},
    'verification':{'source_unchanged':True,'source_topology_retained':True,'original_uvs_retained':True,
                    'browser_glb_reimported':True,'render_device':renders['device'],
                    'render_backend':renders.get('backend','CPU'),
                    'reference_refinement':{'outside_patch_coordinates_identical':True,
                                            'unchanged_vertices':report['unchanged_vertices'],
                                            'modified_vertices':report['modified_vertices']}},
    'scripts':{str(path.relative_to(root)):hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(Path(__file__).parent.glob('*.py'))},
    'viewer':{'model_id':'canon-7s','route':'/?model=canon-7s','catalog':'standalone/model-viewer/models.json'},
}
if surface:
    manifest['parent_master']=entry(Path(surface['parent_master']))
    manifest['reports']['surface']=str(surface_path.relative_to(generated_path('')))
    manifest['verification']['surface_vertex_colors_preserved']=True
    manifest['verification']['surface_smoothing']={
        key:surface[key] for key in ['moved_vertices','maximum_displacement','protected_vertices',
                                    'protected_coordinates_unchanged','topology_unchanged','uv_layers_unchanged',
                                    'restored_materials_unchanged','separate_detail_objects_unchanged','fascia_planes']}
if bottom:
    if surface:
        manifest['verification']['surface_smoothing']['parent_master']=manifest['parent_master']
    manifest['parent_master']=entry(Path(bottom['parent_master']))
    manifest['references'].append({'path':'blender/canon7s/reference/bottom.HEIC','sha256':bottom['reference_source_sha256']})
    manifest['reports']['bottom']=str(bottom_path.relative_to(generated_path('')))
    # The underside holes intentionally remove local faces; do not carry a
    # previous stage's whole-mesh topology/UV claim into this new delivery.
    del manifest['verification']['source_topology_retained']
    del manifest['verification']['original_uvs_retained']
    manifest['verification']['bottom_refinement']={
        'all_source_vertices_unchanged':True,'retained_topology_uvs_colors_normals_exact':True,
        'removed_local_faces':preserved['removed_local_faces'],'added_triangles':bottom['added_triangles'],
        'master_clear_socket_rays':25,'browser_clear_socket_rays':25,
        'browser_width_units':exports['browser_reimport']['width_units'],
        'physical_scale':scale,'socket':{key:bottom['socket'][key] for key in
                                      ['nominal_major_diameter_mm','pitch_mm','depth_mm','depth_is_reference_estimate']}}
if current and not os.environ.get('FILM_PHOTO_OUTPUT_DIR'):
    catalog=json.loads((root/'standalone/model-viewer/models.json').read_text())
    model=next(m for m in catalog['models'] if m['id']=='canon-7s')
    assert 'public/'+model['asset']==current['browser_glb']['published_path']
    assert current['browser_glb']['path']==files['browser']['path']
    assert hashlib.sha256((root/current['browser_glb']['published_path']).read_bytes()).hexdigest()==model['sha256']
    assert model['sha256']==current['browser_glb']['sha256']==files['browser']['sha256']
    assert current['editable_blend']==master
    assert current['full_detail_glb']==files['full_detail']
    assert current['renders']==render_files
    assert current['browser_renders']==browser_renders
    assert current['state']==manifest['state']
    assert current.get('parent_master')==manifest.get('parent_master')
    if bottom:
        assert model['widthMm']==bottom['physical_scale']['requested_width_mm']==138
    print(f"CURRENT.json, viewer catalog, source, master, both GLBs, {len(render_files)} master renders and {len(browser_renders)} GLB renders verified.")
else:
    (out/'delivery_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
