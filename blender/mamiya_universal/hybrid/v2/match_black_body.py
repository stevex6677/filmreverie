"""Match body finishes to the accepted V2.2 black lens without editing its optics.

Run through local Blender MCP with the accepted lens-finish master loaded.
Original atlas, comparison scene and previous revisions remain intact.
"""
from pathlib import Path
import sys, json, hashlib
import bpy
import numpy as np

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / 'scripts'))
from shared_assets import output_dir

source = Path(bpy.data.filepath)
out = output_dir('blender/mamiya_universal/hybrid/v2/black_body')
scene = bpy.data.scenes['02 Hybrid v2 | Tripo lens']
bpy.context.window.scene = scene
base = bpy.data.objects['Camera v2 | repaired source mesh']
base.data = base.data.copy()
atlas = base.data.materials[0]

def signature():
    return {m.name: {i.name: list(i.default_value) if i.type == 'RGBA' else i.default_value
                     for i in m.node_tree.nodes.get('Principled BSDF').inputs
                     if i.name in ('Base Color', 'Metallic', 'Roughness', 'Transmission Weight',
                                   'IOR', 'Thin Film Thickness', 'Thin Film IOR')}
            for m in bpy.data.materials if m.name.startswith('V2.2 |')
            and m.use_nodes and m.node_tree.nodes.get('Principled BSDF')}

lens_before = signature()
def finish(name, leather=False):
    m = atlas.copy(); m.name = name
    nodes, links = m.node_tree.nodes, m.node_tree.links
    p = nodes.get('Principled BSDF')
    for socket in ('Base Color', 'Metallic', 'Roughness'):
        for link in list(p.inputs[socket].links): links.remove(link)
    # Narrow neutral range removes baked brown illumination, keeps subtle wear.
    bw = nodes.new('ShaderNodeRGBToBW'); bw.label = 'Remove baked warm cast'
    links.new(nodes['Image Texture'].outputs['Color'], bw.inputs['Color'])
    ramp = nodes.new('ShaderNodeValToRGB'); ramp.label = 'Lens-matched black reflectance'
    ramp.color_ramp.elements[0].position = .02
    ramp.color_ramp.elements[0].color = (.004, .005, .0065, 1)
    ramp.color_ramp.elements[1].position = .65
    ramp.color_ramp.elements[1].color = ((.012, .014, .017, 1) if leather
                                         else (.013, .016, .020, 1))
    links.new(bw.outputs[0], ramp.inputs[0]); links.new(ramp.outputs[0], p.inputs['Base Color'])
    p.inputs['Metallic'].default_value = 0 if leather else .65
    p.inputs['Roughness'].default_value = .52 if leather else .27
    nodes['Normal Map'].inputs['Strength'].default_value = .8 if leather else .12
    if leather:
        # Preserve the atlas's fine leather grain through proportional luminance.
        ramp.color_ramp.elements[0].position = 0
        ramp.color_ramp.elements[0].color = (0,0,0,1)
        ramp.color_ramp.elements[1].position = 1
        ramp.color_ramp.elements[1].color = (.065,.075,.09,1)
        rough = nodes.new('ShaderNodeMapRange'); rough.clamp = True
        rough.inputs['From Min'].default_value = 0; rough.inputs['From Max'].default_value = 1
        rough.inputs['To Min'].default_value = .46; rough.inputs['To Max'].default_value = .64
        links.new(nodes['Separate Color'].outputs['Green'], rough.inputs['Value'])
        links.new(rough.outputs[0], p.inputs['Roughness'])
        edge = nodes.new('ShaderNodeBsdfPrincipled')
        edge.inputs['Metallic'].default_value = .65
        edge.inputs['Roughness'].default_value = .27
        edge_ramp = nodes.new('ShaderNodeValToRGB')
        edge_ramp.color_ramp.elements[0].position=.02
        edge_ramp.color_ramp.elements[0].color=(.004,.005,.0065,1)
        edge_ramp.color_ramp.elements[1].position=.65
        edge_ramp.color_ramp.elements[1].color=(.013,.016,.020,1)
        links.new(bw.outputs[0],edge_ramp.inputs[0])
        links.new(edge_ramp.outputs[0],edge.inputs['Base Color'])
        nm=nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.12
        links.new(nodes['Image Texture.002'].outputs['Color'],nm.inputs['Color'])
        links.new(nm.outputs[0],edge.inputs['Normal'])
        attr=nodes.new('ShaderNodeAttribute'); attr.attribute_name='V2.3 leather transition'
        mix=nodes.new('ShaderNodeMixShader')
        links.new(attr.outputs['Fac'],mix.inputs[0])
        links.new(edge.outputs[0],mix.inputs[1]);links.new(p.outputs[0],mix.inputs[2])
        links.new(mix.outputs[0],nodes['Material Output'].inputs['Surface'])
    return m

metal = finish('V2.3 | lens-matched black body metal')
leather = finish('V2.3 | deep black textured leatherette', True)
base.data.materials.append(metal); base.data.materials.append(leather)
co = np.empty(len(base.data.vertices)*3, np.float32)
base.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
vi = np.empty(len(base.data.loops), np.int32)
base.data.loops.foreach_get('vertex_index', vi)
centers = co[vi.reshape(-1, 3)].mean(1)
x, y, z = centers.T
body = y >= -.075
# Keep front finder windows and discrete metal controls in their original atlas.
windows = ((x>-.216)&(x<-.048)&(z>.617)&(z<.744) |
           (x>-.007)&(x<.171)&(z>.606)&(z<.747) |
           (x>.231)&(x<.281)&(z>.660)&(z<.713)) & (y<0)
accessories = ((z>.802)&(x>-.04)&(x<.09)&(y>.11)&(y<.21)) | ((np.abs(x)>.35)&(z>.548))
body &= ~(windows | accessories)
leather_area = (z>.035)&(z<.505)&(np.abs(x)<.31)
leather_area |= (z>.125)&(z<.458)&(np.abs(x)>=.31)
assign = np.zeros(len(base.data.polygons), np.int32)
assign[body] = 1; assign[body & leather_area] = 2
base.data.polygons.foreach_set('material_index', assign)
vx,vy,vz=co.T
def smooth01(value):
    t=np.clip(value,0,1);return t*t*(3-2*t)
central=smooth01((.31-np.abs(vx))/.008)*smooth01((vz-.035)/.012)*smooth01((.505-vz)/.012)
outer=smooth01((vz-.125)/.009)*smooth01((.458-vz)/.009)
weight=np.maximum(central,outer).astype(np.float32)
attribute=base.data.attributes.new('V2.3 leather transition','FLOAT','POINT')
attribute.data.foreach_set('value',weight)

# Separate reconstructed plates keep their fine geometry and inscriptions.
for oldname in ('Hybrid | satin ribbed nameplate', 'V2.1 | memo satin enamel'):
    old = bpy.data.materials[oldname]
    replacement = old.copy(); replacement.name = 'V2.3 | black ' + oldname.split('|')[-1].strip()
    p = replacement.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (.009, .011, .014, 1)
    p.inputs['Metallic'].default_value = .62
    p.inputs['Roughness'].default_value = .29
    for ob in scene.objects:
        if not hasattr(ob.data, 'materials'): continue
        for slot in ob.material_slots:
            if slot.material == old: slot.material = replacement

assert signature() == lens_before
scene['body_finish_revision'] = 'V2.3: neutral black metal and textured black leatherette matched to V2.2 lens'
scene.camera = bpy.data.objects['V2 01 Front three quarter']
scene.render.resolution_x = scene.render.resolution_y = 1400
scene.render.resolution_percentage = 100
scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
scene.cycles.samples = 64
blend = out/'mamiya_universal_hybrid_v2_black_body.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
manifest = {'input':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'blend':str(blend),'lens_materials_unchanged':True,'lens_materials':lens_before,
            'face_counts':dict(zip(['preserved','black_metal','black_leather'],np.bincount(assign).tolist())),
            'rear_text':[o.data.body for o in bpy.data.collections['04 V2.1 | clean rear lettering'].objects if o.type=='FONT']}
(out/'black-body-manifest.json').write_text(json.dumps(manifest,indent=2))
scene.render.resolution_x = scene.render.resolution_y = 800;scene.cycles.samples=24
scene.render.filepath = str(out/'front_preview.png');bpy.ops.render.render(write_still=True)
scene.camera = bpy.data.objects['V2 03 Rear three quarter']
scene.render.filepath = str(out/'rear_preview.png');bpy.ops.render.render(write_still=True)
result = {'out':str(out),'blend':str(blend),'face_counts':manifest['face_counts']}
