"""Create a grouped Blender copy from snowdon.sdt using bundled Blender Python."""

from array import array
from pathlib import Path
import gzip
import json
import math
import sys

import bpy
from mathutils import Euler, Vector


asset, destination = map(Path, sys.argv[sys.argv.index("--") + 1:])
binary = gzip.decompress(asset.read_bytes())
header = int.from_bytes(binary[:4], "little")
meta = json.loads(binary[4:header + 4])
coordinates = array("h", binary[header + 4:])
if sys.byteorder != "little":
    coordinates.byteswap()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 0.3048
scene["Geometry source"] = meta["source"]
scene["Revit project origin in feet"] = meta["origin"]

palette = {
    "ivory": "E9DECA", "concrete": "B7ADB0", "stone": "D6B692", "brick": "AA6A58",
    "brick-light": "BD8166", "glass": "355887", "amber": "D9A34C", "metal": "354356",
    "wood": "A85E4C", "roof": "A6AEB3", "partition": "CBBDA8", "solar": "243A64",
}
names = {
    "roof": "Roof assemblies", "slab": "Floor plates", "heritage": "Historic street elevation",
    "envelope": "Modern envelope", "wall": "Interior walls", "frame": "Columns, stairs and details",
}


def material(name, hex_color):
    item = bpy.data.materials.new(name)
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb]
    item.diffuse_color = (*linear, 1.0)
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = item.diffuse_color
    shader.inputs["Roughness"].default_value = 0.69
    return item


materials = {name: material(name, value) for name, value in palette.items()}
plan_material = material("Drawing ink", "D9A34C")


def collection(name, parent=scene.collection):
    result = bpy.data.collections.new(name)
    parent.children.link(result)
    return result


def make_object(name, vertices, edges, faces, target, finish):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, edges, faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    mesh.materials.append(finish)
    return obj


def decode(interval, polygon_size):
    start, count = interval
    scale = meta["quantization"]
    lookup, verts, shapes = {}, [], []
    for i in range(start, start + count, polygon_size * 3):
        shape = []
        for j in range(i, i + polygon_size * 3, 3):
            x, y, z = coordinates[j:j + 3]
            key = (x, -z, y)
            index = lookup.get(key)
            if index is None:
                index = len(verts)
                verts.append((x / scale, -z / scale, y / scale))
                lookup[key] = index
            shape.append(index)
        if len(set(shape)) == polygon_size:
            shapes.append(shape)
    return verts, shapes


group_root = collection("Snowdon Towers")
groups = {key: collection(value, group_root) for key, value in names.items()}
storeys = {}
for chunk in meta["parts"]:
    kind, finish, floor = (chunk[key] for key in ("group", "finish", "floor"))
    key = (kind, floor)
    if key not in storeys:
        storeys[key] = collection(f"Level band {floor + 1:02}", groups[kind])
    vertices, faces = decode(chunk["range"], 3)
    obj = make_object(f"{kind} · {floor + 1:02} · {finish}", vertices, [], faces, storeys[key], materials[finish])
    obj["Web group"] = kind
    obj["Revit level band"] = floor

drawing = collection("Plan cuts and Revit grids")
for key, interval in meta["plan"].items():
    vertices, edges = decode(interval, 2)
    make_object(f"Plan · {key}", vertices, edges, [], drawing, plan_material)
for grid in meta["grids"]:
    vertices = [(x, -z, y) for x, y, z in grid["points"]]
    edges = [(i, i + 1) for i in range(len(vertices) - 1)]
    make_object(grid["name"], vertices, edges, [], drawing, plan_material)

for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.clip_end = 2500
            space.shading.color_type = "MATERIAL"
            space.overlay.show_floor = False
            space.region_3d.view_distance = 245
            space.region_3d.view_perspective = "ORTHO"
            space.region_3d.view_location = Vector((0, 0, 27))
            space.region_3d.view_rotation = Euler((math.radians(56), 0, math.radians(152))).to_quaternion()

destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(destination.resolve()), compress=True)
