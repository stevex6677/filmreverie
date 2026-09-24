"""Export full detail and a bounded browser copy; never mutate the saved master.
Run through Blender CLI with canon7s-refined.blend open. All images are embedded.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys
import bpy
from math import cos, sin, pi
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from shared_assets import output_dir
out=output_dir('blender/canon7s/refinement',bpy.data.filepath)
source=Path(bpy.data.filepath)
source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
source_scene=bpy.context.scene
depsgraph=bpy.context.evaluated_depsgraph_get()
scene=bpy.data.scenes.new('Canon 7s | export copies only')
objects=[]
for original in source_scene.objects:
    if original.type not in {'MESH','FONT','CURVE'} or original.hide_render:
        continue
    mesh=bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph),preserve_all_data_layers=True,depsgraph=depsgraph)
    copy=bpy.data.objects.new(original.name,mesh)
    copy.matrix_world=original.matrix_world.copy()
    scene.collection.objects.link(copy)
    objects.append(copy)
bpy.context.window.scene=scene
expects_surface_colors=any('Surface finish' in o.data.color_attributes for o in objects)
bottom_objects={o.name for o in objects if o.name.startswith('Canon 7s underside | ')}
bottom_path=out/'bottom_report.json'
bottom=json.loads(bottom_path.read_text()) if bottom_path.exists() else None
if bottom:
    assert bottom_objects,'The underside report has no corresponding geometry'


def export(filename,compact):
    path=out/filename
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,
        export_animations=False,export_cameras=False,export_lights=False,export_extras=True,
        export_image_format='JPEG' if compact else 'AUTO',export_jpeg_quality=93,
        export_yup=True,export_apply=False)
    raw=path.read_bytes()
    length=struct.unpack_from('<I',raw,12)[0]
    data=json.loads(raw[20:20+length])
    triangles=sum(data['accessors'][p['indices']]['count']//3 for m in data['meshes'] for p in m['primitives'])
    assert all('bufferView' in i and 'uri' not in i for i in data.get('images',[]))
    assert len(data['meshes'])==len(objects)
    colored_materials={i for i,m in enumerate(data.get('materials',[]))
                       if m.get('name','').startswith(('Canon satin metal','Lens recessed anodized metal'))}
    if expects_surface_colors:
        assert len(colored_materials)==2
        for mesh in data['meshes']:
            for primitive in mesh['primitives']:
                if primitive.get('material') in colored_materials:
                    attributes=primitive['attributes']
                    assert 'COLOR_0' in attributes,'Feathered finish colors were lost'
                    assert data['accessors'][attributes['COLOR_0']]['count']==data['accessors'][attributes['POSITION']]['count']
    return {'path':str(path),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),
            'triangles':triangles,'embedded_images':len(data.get('images',[])),
            'surface_vertex_colors_preserved':expects_surface_colors,
            'source_blend_sha256':source_sha}


full=export('canon7s-refined.glb',False)
# Preserve all separate decal geometry; reduce only the Tripo body.
for obj in objects:
    if len(obj.data.polygons)<100000:
        continue
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    modifier=obj.modifiers.new('Browser-only geometry budget','DECIMATE')
    modifier.ratio=.22
    if bottom:
        # Do not collapse the newly opened base plate: long replacement faces
        # introduce shading creases beside its recesses. Zero-weight vertices
        # are excluded by Blender's collapse decimator.
        eligible=[v.index for v in obj.data.vertices
                  if v.co.z>2*bottom['preservation']['underside_finish_z_ceiling']]
        group=obj.vertex_groups.new(name='Browser reduction outside underside')
        group.add(eligible,1,'REPLACE')
        modifier.vertex_group=group.name
        modifier.vertex_group_factor=1
        modifier.ratio+=.78*(1-len(eligible)/len(obj.data.vertices))
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
images={};materials={}
for obj in objects:
    for slot in obj.material_slots:
        original=slot.material
        if original not in materials:
            copy=original.copy()
            for node in copy.node_tree.nodes:
                if node.type!='TEX_IMAGE' or node.image is None:
                    continue
                image=node.image
                if image not in images:
                    small=image.copy();w,h=image.size
                    ratio=min(1,2048/max(w,h))
                    if ratio<1:
                        small.scale(round(w*ratio),round(h*ratio))
                    small.pack();images[image]=small
                node.image=images[image]
            materials[original]=copy
        slot.material=materials[original]
compact=export('canon7s-browser.glb',True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha
report={'status':'complete','source_blend':str(source),'source_blend_sha256':source_sha,
        'full_detail':full,'browser':compact,'master_unchanged':True}
(out/'export_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
# Import the actual browser bytes into an isolated scene and verify no textures
# or named detail objects were lost in the glTF conversion.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=compact['path'],import_pack_images=True)
imported=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(imported)==len(objects)
assert all(i.packed_file for i in bpy.data.images if i.users)
assert any(o.name.startswith('Frame counter reading') for o in imported)
assert bottom_objects<={o.name for o in imported},'Underside components were lost in the browser export'
report['browser_reimport']={'mesh_objects':len(imported),'all_images_packed':True,
                           'underside_objects':sorted(bottom_objects)}
if bottom:
    bpy.context.view_layer.update()
    graph=bpy.context.evaluated_depsgraph_get()
    socket=bottom['socket']
    clear_rays=0
    for radial in (0,.4,.8):
        for j in range(1 if radial==0 else 12):
            angle=2*pi*j/12
            x=socket['center_xy'][0]+radial*socket['minor_radius']*cos(angle)
            y=socket['center_xy'][1]+radial*socket['minor_radius']*sin(angle)
            hit,location,normal,face,obj,matrix=bpy.context.scene.ray_cast(graph,Vector((x,y,-.1)),Vector((0,0,1)))
            assert hit and obj.original.name.startswith(socket['blind_end_object']), 'Browser decimation obstructed the tripod bore'
            assert abs(location.z-socket['blind_end_z'])<2e-6
            clear_rays+=1
    corners=[o.matrix_world@Vector(v) for o in imported for v in o.bound_box]
    width=max(v.x for v in corners)-min(v.x for v in corners)
    # Decimation can shift outer extrema slightly. Cabinet mounting normalizes
    # the derivative's measured bounds, not the master's, to the catalog width.
    report['browser_reimport'].update({'socket_clear_aperture_rays':clear_rays,
                                      'width_units':width,'requested_width_mm':bottom['physical_scale']['requested_width_mm']})
(out/'export_report.json').write_text(json.dumps(report,indent=2))
# Render the reimported bytes too, so the compact derivative has visual evidence.
import os
os.environ['FILM_PHOTO_OUTPUT_DIR']=str(out/'browser_review')
renderer=Path(__file__).with_name('render_views.py')
review_views={'oblique','top'}
if bottom_objects:
    review_views.update({'bottom','bottom_oblique'})
exec(compile(renderer.read_text(),str(renderer),'exec'),
     {'__file__':str(renderer),'RENDER_VIEWS':review_views})
