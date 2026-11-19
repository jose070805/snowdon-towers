"""Prepare editable Revit triangles for the browser (Python 3 + NumPy)."""

import argparse
import gzip
import json
import struct
from collections import defaultdict
from pathlib import Path

import numpy as np


ORIGIN = np.array([-18.0, 5.0, -6.0])
QUANTIZATION = 128
FLOORS = np.array([-5.92, 5.50, 8.08, 18.83, 32.17, 45.50, 52.66, 58.83, 68.83])
VISIBLE_BASE = -6.5
HISTORIC_LIMIT = -24.5


def display_coordinates(points):
    shifted = points - ORIGIN
    return np.stack((shifted[..., 0], shifted[..., 2], -shifted[..., 1]), axis=-1)


def is_historic(record, material):
    category = record["category"]
    desc = (record["name"] + " " + record["family"]).lower()
    center = (np.array(record["min"]) + np.array(record["max"])) / 2
    if not (-52 < center[0] < 74 and record["min"][1] < HISTORIC_LIMIT):
        return False
    details = ("arch", "corbel", "cresting", "dentil", "keystone", "banding", "medallion", "sill")
    if category == "OST_Walls":
        return center[1] < -20 and (
            any(f"block {n}" in desc for n in (37, 39, 43))
            or ("brick" in material and "partition" not in desc)
        )
    if category in ("OST_Windows", "OST_Doors"):
        return center[1] < -25 and record["min"][2] > 6.0
    return category in ("OST_GenericModel", "OST_Cornices", "OST_StairsRailing") and (
        any(key in desc for key in details) or "balustrade" in desc
    )


def classify(record, material, elevations):
    category = record["category"]
    desc = (record["name"] + " " + record["family"]).lower()
    historic = is_historic(record, material)
    if record["max"][2] < VISIBLE_BASE or record["min"][1] > 46:
        return None
    if category == "OST_Walls" and record["min"][2] >= 45 and "planter wall - steel plate" in desc:
        # These non-structural walls grow in the supplemental G106 landscape layer.
        return None
    terrace_surface = category == "OST_Floors" and record["min"][2] > 45 and desc.startswith("roof - ") and any(
        name in desc for name in ("decking", "porcelain", "turf", "brick border")
    )
    forecourt_path = (
        category == "OST_Floors" and "hardscape - brick walk" in desc
        and record["max"][0] < -49.75 and record["max"][1] < -8 and record["max"][2] < 0
    )
    if category == "OST_Floors" and not (terrace_surface or forecourt_path) and any(name in desc for name in (
        "sidewalk", "hardscape", "stair landing", "sculpture", "planting bed", "porcelain", "turf",
        "decking", "brick border", "finish floor - laminate",
    )):
        return None
    if category == "OST_GenericModel" and not historic:
        if not any(name in desc for name in ("exterior", "window", "trim", "pavilion", "screen")):
            return None
    if category == "OST_Parts":
        return None

    if historic:
        group = "heritage"
    elif terrace_surface or category == "OST_Roofs" or (
        record["min"][2] >= 58.3 and category in (
            "OST_Walls", "OST_Doors", "OST_Windows", "OST_StairsRailing", "OST_Cornices", "OST_Floors",
        )
    ):
        group = "roof"
    elif category == "OST_Floors":
        group = "slab"
    elif category in ("OST_CurtainWallMullions", "OST_CurtainWallPanels", "OST_Windows", "OST_Doors", "OST_Cornices"):
        group = "envelope"
    elif category == "OST_Walls" and any(name in desc for name in ("exterior", "storefront", "rainscreen", "parapet", "solar wall")):
        group = "envelope"
    elif category == "OST_Walls":
        group = "wall"
    else:
        group = "frame"

    if material.startswith("solar") or (category == "OST_CurtainWallPanels" and desc.startswith("solar wall")):
        finish = "solar"
    elif ("glass" in material or "glazing" in material or desc.startswith("glazed")) and "fiberglass" not in material:
        warm = (record["id"] * 13) % 29 < (7 if historic else 5)
        finish = "amber" if warm else "glass"
    elif historic:
        if any(name in material for name in ("brick", "arch")) and "stone" not in material:
            finish = "brick-light" if record["id"] % 9 < 3 else "brick"
        elif any(name in material for name in ("metal", "black", "bronze")):
            finish = "metal"
        else:
            finish = "stone"
    elif category == "OST_CurtainWallMullions" or any(name in material for name in ("anodized", "steel", "black", "aluminum")):
        finish = "metal"
    elif "wood" in material or "orange" in desc:
        finish = "wood"
    elif group == "roof":
        finish = "roof"
    elif group == "wall":
        finish = "partition"
    else:
        finish = "ivory" if record["id"] % 7 else "concrete"
    base = record["min"][2]
    if terrace_surface:
        # Keep the outdoor floor finish with the underlying roof when the model is exploded.
        base = 58.83 if base > 58 else 53.37 if base > 52 else 45.50
    level = elevations.get(record["level"], base)
    reference = level if abs(level - base) <= 4.5 and group not in ("heritage", "roof") else base
    index = int(np.clip(np.searchsorted(FLOORS + 1.4, reference, side="right") - 1, 0, len(FLOORS)-1))
    return group, finish, index


def feature_edges(triangles, threshold=0.875):
    if len(triangles) == 0:
        return np.empty((0, 2, 3))
    quant = np.rint(triangles * QUANTIZATION).astype(np.int32)
    verts, inverse = np.unique(quant.reshape(-1, 3), axis=0, return_inverse=True)
    idx = inverse.reshape(-1, 3)
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = normals / np.maximum(norms, 1e-7)
    pairs = np.sort(np.concatenate((idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]])), axis=1)
    paired_normals = np.tile(normals, (3, 1))
    keys = pairs[:, 0].astype(np.int64) * len(verts) + pairs[:, 1]
    order = np.argsort(keys)
    keys = keys[order]
    _, start, counts = np.unique(keys, return_index=True, return_counts=True)
    selected = counts == 1
    multiple = counts > 1
    first = paired_normals[order[start[multiple]]]
    last = paired_normals[order[start[multiple] + counts[multiple] - 1]]
    selected[multiple] = np.einsum("ij,ij->i", first, last) < threshold
    result = verts[pairs[order[start[selected]]]] / QUANTIZATION
    return result[np.linalg.norm(result[:, 1] - result[:, 0], axis=1) > 0.085]


def section(triangles, height):
    result = []
    candidates = triangles[(triangles[:, :, 1].min(1) < height) & (triangles[:, :, 1].max(1) > height)]
    for tri in candidates:
        points = []
        for start, end in zip(tri, np.roll(tri, -1, axis=0)):
            if (start[1] < height) == (end[1] < height):
                continue
            ratio = (height - start[1]) / (end[1] - start[1])
            points.append(start + (end - start) * ratio)
        if len(points) == 2:
            pa, pb = points
            if np.linalg.norm(pa - pb) > 0.02:
                result.append([[pa[0], -0.26, pa[2]], [pb[0], -0.26, pb[2]]])
    return result


def clean_segments(segments, min_length=0.17):
    if not len(segments):
        return np.empty((0, 2, 3))
    quant = np.rint(np.reshape(segments, (-1, 2, 3)) * QUANTIZATION).astype(np.int16)
    needs_reversal = (quant[:, 0, 0] > quant[:, 1, 0]) | (
        (quant[:, 0, 0] == quant[:, 1, 0]) & (quant[:, 0, 2] > quant[:, 1, 2])
    )
    quant[needs_reversal] = quant[needs_reversal, ::-1]
    clean = np.unique(quant, axis=0).astype(np.float32) / QUANTIZATION
    return clean[np.linalg.norm(clean[:, 1] - clean[:, 0], axis=1) >= min_length]


def flattened(points, y):
    points = points.copy()
    points[..., 1] = y
    return points


def prepare(source, output):
    data = json.loads((source / "geometry.json").read_bytes())
    assembled = json.loads((source / "assembled-view.json").read_bytes())
    visible_ids = set(assembled["ids"])
    if assembled["view"] != "3D (Shaded) Uncropped" or not visible_ids:
        raise ValueError("Expected visibility from Revit's uncropped assembled view.")
    triangles = np.frombuffer(gzip.decompress((source / "triangles.f32.gz").read_bytes()), dtype="<f4")
    meshes, outlines = defaultdict(list), defaultdict(list)
    plan_shell, plan_interior, plan_slab, plan_openings = [], [], [], []
    facades = []
    used_elements = set()
    elevations = {level["id"]: level["z"] for level in data["levels"]}
    for record in data["records"]:
        if record["id"] not in visible_ids:
            continue
        material = data["materials"].get(str(record["material"]), {}).get("name", "").lower()
        key = classify(record, material, elevations)
        if key is None:
            continue
        offset, size = record["offset"], record["size"]
        points = display_coordinates(triangles[offset:offset + size].reshape(-1, 3, 3))
        # Remove hidden underground returns and long site elements.
        points = points[(points[:, :, 1].min(1) > -2.25) & (np.abs(points[:, :, 2]).max(1) < 53)]
        if not len(points):
            continue
        used_elements.add(record["id"])
        group, finish, floor = key
        meshes[key].append(points)
        edges = feature_edges(points)
        outline_grade = "trim" if finish in ("glass", "amber", "metal", "solar") else "mass"
        outlines[(group, floor, outline_grade)].append(edges)
        if group == "heritage":
            facades.extend((points.reshape(-1, 3).min(0), points.reshape(-1, 3).max(0)))
        center_x = (record["min"][0] + record["max"][0]) / 2
        ground_ft = -5.92 if center_x < -49.5 else (-3.46 if center_x < 12 else 0)
        cut_y = ground_ft - ORIGIN[2] + 3.5
        name = record["name"].lower()
        category = record["category"]
        if category in ("OST_Walls", "OST_Columns") and not any(s in name for s in ("chase", "wrap", "plaster")):
            lines = section(points, cut_y)
            if lines:
                target = plan_shell if group in ("heritage", "envelope") else plan_interior
                target.extend(lines)
        if category in ("OST_Doors", "OST_Windows", "OST_CurtainWallPanels") and group in ("heritage", "envelope"):
            plan_openings.extend(section(points, cut_y))
        if group == "slab" and floor == 0:
            horizontal = edges[np.abs(edges[:, 0, 1] - edges[:, 1, 1]) < 0.12]
            plan_slab.extend(flattened(horizontal, -.27))

    metadata = {"version": 1, "quantization": QUANTIZATION, "source": data["title"], "sourceView": assembled["view"], "origin": ORIGIN.tolist(),
                "levelY": (FLOORS - ORIGIN[2]).tolist(), "parts": [], "edges": [], "plan": {}, "grids": [],
                "elementCount": len(used_elements), "exportTriangles": data["triangles"]}
    payload = bytearray()

    def write_chunk(points):
        quantized = np.rint(points * QUANTIZATION).astype("<i2").reshape(-1)
        offset = len(payload) // 2
        payload.extend(quantized.tobytes())
        return [offset, len(quantized)]

    flat_meshes = []
    for (group, finish, floor), chunks in sorted(meshes.items()):
        points = np.concatenate(chunks)
        flat_meshes.append(points)
        metadata["parts"].append({"group": group, "finish": finish, "floor": floor, "range": write_chunk(points)})
    for (group, floor, grade), chunks in sorted(outlines.items()):
        points = clean_segments(np.concatenate(chunks), .10 if grade == "mass" else .14)
        if len(points):
            metadata["edges"].append({"group": group, "floor": floor, "grade": grade, "range": write_chunk(points)})

    all_points = np.concatenate(flat_meshes).reshape(-1, 3)
    metadata["bounds"] = [all_points.min(0).tolist(), all_points.max(0).tolist()]
    metadata["triangles"] = len(all_points) // 3
    metadata["heritageBounds"] = [np.min(facades, 0).tolist(), np.max(facades, 0).tolist()]
    for name, lines in [("slab", plan_slab), ("shell", plan_shell), ("interior", plan_interior), ("openings", plan_openings)]:
        points = clean_segments(lines, 0.20 if name != "shell" else 0.09)
        # Spatial sort sweeps from the west end of the street frontage.
        points = points[np.argsort(points[:, :, 0].mean(1) - points[:, :, 2].mean(1)*.45)] if len(points) else points
        metadata["plan"][name] = write_chunk(points)
    for grid in data["grids"]:
        points = np.array([[x, y, ORIGIN[2] - 0.3] for x, y in grid["points"]])
        points = display_coordinates(points)
        if len(points) > 1:
            metadata["grids"].append({"name": grid["name"], "points": points.tolist()})
    encoded = json.dumps(metadata, separators=(",", ":"), ensure_ascii=True).encode()
    output.write_bytes(gzip.compress(struct.pack("<I", len(encoded)) + encoded + payload, compresslevel=8, mtime=0))
    print(json.dumps({key: metadata[key] for key in ("triangles", "exportTriangles", "elementCount", "bounds", "heritageBounds")}))
    print(f"{len(metadata['parts'])} surface batches, {len(metadata['edges'])} edge batches, {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    prepare(args.source, args.output)
