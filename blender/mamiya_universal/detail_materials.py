"""Detail pass from IMG_1971–1977. Execute locally authored code through Blender MCP."""
import bpy, math
from mathutils import Vector
scene=bpy.context.scene
OUT='/root/projects/film_photo/blender/mamiya_universal'
assert scene.name=='Mamiya Universal | Studio'

def shader(name,color,metal,rough):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links
    p=n.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs['Surface'])
    tc=n.new('ShaderNodeTexCoord');m.diffuse_color=(*color,1)
    return m,n,l,p,tc
def noise(n,l,coord,scale,detail=2):
    t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=scale;t.inputs['Detail'].default_value=detail
    l.new(coord,t.inputs['Vector']);return t
def ramp(n,l,source,stops):
    r=n.new('ShaderNodeValToRGB');r.color_ramp.interpolation='EASE'
    for i,(pos,col) in enumerate(stops):
        e=r.color_ramp.elements[i] if i<2 else r.color_ramp.elements.new(pos)
        e.position=pos;e.color=(*col,1)
    l.new(source,r.inputs[0]);return r.outputs[0]
def bump(n,l,height,distance,strength,normal=None):
    b=n.new('ShaderNodeBump');b.inputs['Distance'].default_value=distance;b.inputs['Strength'].default_value=strength
    l.new(height,b.inputs['Height'])
    if normal:l.new(normal,b.inputs['Normal'])
    return b.outputs['Normal']

# Real-world scale, directionally stretched, irregular raised grain. IMG_1971 / 1976.
m,n,l,p,tc=shader('Pebbled black leatherette',(.011,.012,.013),0,.46)
p.inputs['Specular IOR Level'].default_value=.48
mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(.72,1.0,1.55);l.new(tc.outputs['Object'],mapping.inputs[0])
warp=noise(n,l,mapping.outputs['Vector'],1150,3)
v=n.new('ShaderNodeVectorMath');v.operation='SCALE';v.inputs['Scale'].default_value=.00042;l.new(warp.outputs['Color'],v.inputs[0])
add=n.new('ShaderNodeVectorMath');add.operation='ADD';l.new(mapping.outputs[0],add.inputs[0]);l.new(v.outputs[0],add.inputs[1])
grain=n.new('ShaderNodeTexVoronoi');grain.feature='DISTANCE_TO_EDGE';grain.inputs['Scale'].default_value=1050;l.new(add.outputs[0],grain.inputs['Vector'])
height=ramp(n,l,grain.outputs['Distance'],[(0,(0,0,0)),(.045,(.12,.12,.12)),(.16,(.83,.83,.83)),(.32,(1,1,1))])
fine=noise(n,l,tc.outputs['Object'],9500,2)
normal=bump(n,l,fine.outputs['Fac'],.000028,.32)
normal=bump(n,l,height,.00062,.78,normal);l.new(normal,p.inputs['Normal'])
col=ramp(n,l,grain.outputs['Distance'],[(0,(.003,.0035,.004)),(.15,(.014,.015,.016)),(.4,(.018,.019,.020))]);l.new(col,p.inputs['Base Color'])
rough=ramp(n,l,grain.outputs['Distance'],[(0,(.61,.61,.61)),(.18,(.35,.35,.35)),(.4,(.31,.31,.31))]);l.new(rough,p.inputs['Roughness'])

# Enamel: broad polish variation over fine orange-peel, without uniform grey dust.
m,n,l,p,tc=shader('Black enamel | satin edge highlights',(.009,.010,.012),.38,.27)
t=noise(n,l,tc.outputs['Object'],170,3)
l.new(ramp(n,l,t.outputs['Fac'],[(.2,(.21,.21,.21)),(.8,(.33,.33,.33))]),p.inputs['Roughness'])
fine=noise(n,l,tc.outputs['Object'],5200,2)
l.new(bump(n,l,fine.outputs['Fac'],.000014,.27),p.inputs['Normal'])
p.inputs['Coat Weight'].default_value=.22;p.inputs['Coat Roughness'].default_value=.22

# Turned black aluminum, with fine circumferential tool marks in object-space Y.
m,n,l,p,tc=shader('Black anodized machined aluminum',(.012,.014,.018),.72,.245)
t=noise(n,l,tc.outputs['Object'],240,2)
l.new(ramp(n,l,t.outputs['Fac'],[(.15,(.19,.19,.19)),(.85,(.32,.32,.32))]),p.inputs['Roughness'])
wave=n.new('ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction='Y';wave.inputs['Scale'].default_value=4800;l.new(tc.outputs['Object'],wave.inputs['Vector'])
l.new(bump(n,l,wave.outputs['Color'],.0000045,.2),p.inputs['Normal'])
p.inputs['Anisotropic'].default_value=.3

m,n,l,p,tc=shader('Brushed chrome fittings',(.44,.43,.39),.92,.26)
v=n.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=(1,1,35);l.new(tc.outputs['Object'],v.inputs[0])
t=noise(n,l,v.outputs[0],1450,2)
l.new(bump(n,l,t.outputs['Fac'],.000009,.35),p.inputs['Normal'])
l.new(ramp(n,l,t.outputs['Fac'],[(.2,(.19,.19,.19)),(.8,(.36,.36,.36))]),p.inputs['Roughness'])

m,n,l,p,tc=shader('Rubber | hood and eyecup',(.009,.0095,.010),0,.48)
t=noise(n,l,tc.outputs['Object'],320,3)
l.new(ramp(n,l,t.outputs['Fac'],[(.2,(.33,.33,.33)),(.8,(.57,.57,.57))]),p.inputs['Roughness'])
f=noise(n,l,tc.outputs['Object'],6000,2);l.new(bump(n,l,f.outputs['Fac'],.000028,.38),p.inputs['Normal'])

# Cloth uses authored physical-distance UV coordinates, one repeat per 0.5 mm.
m,n,l,p,tc=shader('Woven black nylon',(.012,.014,.016),0,.59)
waves=[]
for direction in ['X','Y']:
    w=n.new('ShaderNodeTexWave');w.wave_type='BANDS';w.bands_direction=direction;w.inputs['Scale'].default_value=380
    l.new(tc.outputs['UV'],w.inputs['Vector']);waves.append(w)
mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';l.new(waves[0].outputs['Fac'],mul.inputs[0]);l.new(waves[1].outputs['Fac'],mul.inputs[1])
l.new(bump(n,l,mul.outputs[0],.00017,.65),p.inputs['Normal'])
l.new(ramp(n,l,mul.outputs[0],[(.1,(.005,.007,.009)),(.8,(.023,.025,.028))]),p.inputs['Base Color'])
p.inputs['Sheen Weight'].default_value=.32;p.inputs['Sheen Roughness'].default_value=.5
o=bpy.data.objects['Continuous woven shoulder strap'];me=o.data
uv=me.uv_layers.get('Webbing physical UV') or me.uv_layers.new(name='Webbing physical UV')
dist=[0.0]
for i in range(1,len(me.vertices)//2):
    c=(me.vertices[2*i].co+me.vertices[2*i+1].co)*.5
    prev=(me.vertices[2*i-2].co+me.vertices[2*i-1].co)*.5
    dist.append(dist[-1]+(c-prev).length)
for poly in me.polygons:
    for li in poly.loop_indices:
        vi=me.loops[li].vertex_index;row=vi//2
        width=(me.vertices[2*row+1].co-me.vertices[2*row].co).length
        uv.data[li].uv=(width*(vi%2),dist[row])
me.uv_layers.active=uv

# Optical surfaces are clean, with subtle coating; curvature supplies reflections.
m,n,l,p,tc=shader('Coated optical glass | blue amber',(.83,.76,.66),0,.026)
p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.52
if 'Thin Film Thickness' in p.inputs:
    p.inputs['Thin Film Thickness'].default_value=320;p.inputs['Thin Film IOR'].default_value=1.38
m,n,l,p,tc=shader('Finder glass | smoked violet',(.17,.19,.25),0,.065)
p.inputs['Transmission Weight'].default_value=.8;p.inputs['IOR'].default_value=1.5

# Directional micro-grooves visible on the nameplate in the new photographs.
m,n,l,p,tc=shader('Nameplate fine horizontal ribs',(.007,.008,.010),.68,.30)
w=n.new('ShaderNodeTexWave');w.bands_direction='Z';w.inputs['Scale'].default_value=2400;l.new(tc.outputs['Object'],w.inputs['Vector'])
l.new(bump(n,l,w.outputs['Color'],.000055,.65),p.inputs['Normal'])
bpy.data.objects['Brand engraved strip'].data.materials.clear();bpy.data.objects['Brand engraved strip'].data.materials.append(m)
for name in ['UNIVERSAL badge','MAMIYA badge']:
    o=bpy.data.objects[name];o.data.extrude=.00013;o.data.bevel_depth=.000035;o.data.bevel_resolution=2
    o.data.materials.clear();o.data.materials.append(bpy.data.materials['Brushed chrome fittings'])
bpy.data.objects['UNIVERSAL badge'].data.shear=.14
scene['detail_reference']='IMG_1971–1977: coarse directional leather, ribbed nameplate, 100mm f/2.8, aged memo insert, asymmetric eyecup'
result={'materials_updated':True,'references':7}
