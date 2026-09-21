"""Export a compact browser derivative from the accepted Autocord master.

Run through Blender MCP with the editable master open. The source scene and
master file remain unchanged; all evaluated copies live in a temporary scene.
"""
from pathlib import Path
import bpy
import hashlib
import json
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from shared_assets import output_dir

out = output_dir("blender/autocord/browser_preview")
source = Path(bpy.data.filepath)
source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
source_scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()
scene = bpy.data.scenes.new("Minolta Autocord | browser derivative")
objects = []

for original in source_scene.objects:
    if original.type != "MESH" or original.hide_render:
        continue
    mesh = bpy.data.meshes.new_from_object(
        original.evaluated_get(depsgraph),
        preserve_all_data_layers=True,
        depsgraph=depsgraph,
    )
    copy = bpy.data.objects.new(original.name, mesh)
    copy.matrix_world = original.matrix_world.copy()
    scene.collection.objects.link(copy)
    objects.append(copy)

bpy.context.window.scene = scene
source_triangles = sum(len(obj.data.polygons) for obj in objects)
decimated = {}
for obj in objects:
    triangles = len(obj.data.polygons)
    if triangles < 100_000:
        continue
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("Browser mesh budget", "DECIMATE")
    modifier.ratio = 0.20
    modifier.delimit = {"MATERIAL", "UV"}
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    decimated[obj.name] = {"before": triangles, "after": len(obj.data.polygons)}

# Copy materials and images before resizing so the accepted master datablocks
# remain byte-for-byte and in-memory unchanged. Preserve aspect ratio and never
# upscale the small inscription maps.
images = {}
materials = {}
for obj in objects:
    for slot in obj.material_slots:
        original = slot.material
        if original is None:
            continue
        if original not in materials:
            material = original.copy()
            material.name = "Browser | " + original.name
            if material.use_nodes:
                for node in material.node_tree.nodes:
                    if node.type != "TEX_IMAGE" or node.image is None:
                        continue
                    image = node.image
                    if image not in images:
                        width, height = image.size
                        scale = min(1.0, 2048 / max(width, height))
                        compact = image.copy()
                        compact.name = "Browser | " + image.name
                        if scale < 1:
                            compact.scale(max(1, round(width * scale)), max(1, round(height * scale)))
                        compact.pack()
                        images[image] = compact
                    node.image = images[image]
            materials[original] = material
        slot.material = materials[original]

export = out / "minolta-autocord-browser.glb"
bpy.ops.export_scene.gltf(
    filepath=str(export),
    export_format="GLB",
    use_active_scene=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_extras=True,
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_yup=True,
    export_apply=False,
)

raw = export.read_bytes()
json_length = struct.unpack_from("<I", raw, 12)[0]
gltf = json.loads(raw[20:20 + json_length])
triangles = sum(
    gltf["accessors"][primitive["indices"]]["count"] // 3
    for mesh in gltf["meshes"]
    for primitive in mesh["primitives"]
)
uv_sets = {
    int(attribute.removeprefix("TEXCOORD_"))
    for mesh in gltf["meshes"]
    for primitive in mesh["primitives"]
    for attribute in primitive["attributes"]
    if attribute.startswith("TEXCOORD_")
}
assert all("uri" not in image for image in gltf.get("images", []))
assert max(uv_sets, default=0) <= 3
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_sha

report = {
    "status": "complete",
    "source": str(source),
    "source_sha256": source_sha,
    "output": str(export),
    "sha256": hashlib.sha256(raw).hexdigest(),
    "bytes": len(raw),
    "source_triangles": source_triangles,
    "triangles": triangles,
    "decimated_objects": decimated,
    "embedded_textures": len(gltf.get("images", [])),
    "maximum_texture_dimension": 2048,
    "texture_format": "JPEG",
    "jpeg_quality": 85,
    "maximum_texture_coordinate_set": max(uv_sets, default=0),
    "mesh_objects": len(objects),
    "note": "Browser derivative; accepted editable master and full-detail GLB unchanged.",
}
(out / "browser-export.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report), flush=True)
