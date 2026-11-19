"""Build a presentation layer from named-view roof and planting geometry."""

import argparse
from collections import defaultdict
import gzip
import json
from pathlib import Path

import numpy as np

from prepare_geometry import clean_segments, display_coordinates, feature_edges


def support_band(elevation):
    # Match the supporting roof's explosion group, including the ground-level forecourt.
    return 6 if elevation >= 58 else 5 if elevation >= 52 else 4 if elevation >= 45 else -1


def landscape_type(record):
    name = record["name"].lower()
    category = record["category"]
    if category == "OST_Floors":
        if "landscape - lawn" in name or "roof - turf" in name:
            return "lawn"
        if record["min"][2] >= 45 and name.startswith("roof - "):
            for keyword, surface in [
                ("decking", "deck"), ("porcelain", "paving"), ("brick border", "paving"),
                ("planting bed", "soil"), ("sculpture bed", "soil"),
            ]:
                if keyword in name:
                    return surface
        if "hardscape - brick walk" in name and record["max"][0] < -49.75 and record["min"][1] < -12:
            return "paving"
    if category == "OST_Walls" and "planter wall - steel plate" in name and record["min"][2] >= 45:
        return "planter"
    return None


def collect(folder, gate, supplemental=False):
    meta = json.loads((folder / "geometry.json").read_bytes())
    coordinates = np.frombuffer(gzip.decompress((folder / "triangles.f32.gz").read_bytes()), "<f4")
    records = defaultdict(list)
    plants = {}
    for item in meta["records"]:
        id = item["id"]
        if id not in gate:
            continue
        if supplemental and item["category"] == "OST_Planting":
            corner, opposite = np.array(item["min"]), np.array(item["max"])
            center = (corner + opposite) / 2
            if (corner[2] < 45 and not (center[0] < -49.5 and center[1] < -6)) or center[1] > 43:
                continue
            if id not in plants:
                point = display_coordinates(np.array([center[0], center[1], corner[2]]))
                plants[id] = {
                    "id": id, "kind": "tree" if "Tree -" in item["family"] else "shrub",
                    "at": np.round(point, 3).tolist(),
                    "size": np.round(opposite-corner, 3)[[0, 2, 1]].tolist(),
                    "band": support_band(corner[2]),
                }
            continue

        kind = landscape_type(item)
        if supplemental:
            family = item["family"]
            kind = "pergola" if family.startswith("Pergola") and item["category"] == "OST_Furniture" else (
                "umbrella" if family == "TableWithUmbrella" else None
            )
        if kind is None:
            continue
        start, count = item["offset"], item["size"]
        mesh = display_coordinates(coordinates[start:start+count].reshape(-1, 3, 3))
        if not supplemental and kind != "planter":
            normal = np.cross(mesh[:, 1] - mesh[:, 0], mesh[:, 2] - mesh[:, 0])
            mesh = mesh[normal[:, 1] > .001]
            mesh[:, :, 1] += .052
        if len(mesh):
            key = (id, kind, support_band(item["min"][2]))
            records[key].append(mesh)
    entries = []
    if not supplemental:
        groups, ids = defaultdict(list), defaultdict(list)
        for (id, kind, band), chunks in records.items():
            center = np.concatenate(chunks)[:, :, 0].mean()
            region = "west" if center < -29 else "east" if center > 30 else "center"
            key = (kind, band, region)
            groups[key].extend(chunks)
            ids[key].append(id)
    else:
        groups = {(kind, band, str(id)): chunks for (id, kind, band), chunks in records.items()}
        ids = {(kind, band, str(id)): [id] for id, kind, band in records}

    for (kind, band, region), chunks in groups.items():
        mesh = np.concatenate(chunks)
        edges = clean_segments(feature_edges(mesh), .18)
        entries.append({
            "ids": ids[(kind, band, region)], "kind": kind, "band": band, "region": region,
            "positions": np.round(mesh, 3).flatten().tolist(),
            "outline": np.round(edges, 3).flatten().tolist(),
        })
    return entries, list(plants.values())


def main(architecture, native_garden, output):
    view = json.loads((architecture / "assembled-view.json").read_bytes())
    visible = set(view["ids"])
    assert view["view"] == "3D (Shaded) Uncropped"
    surfaces, _ = collect(architecture, visible)
    details, plants = collect(native_garden, visible, supplemental=True)
    result = {"sheet": "G106", "sourceView": view["view"], "surfaces": surfaces, "details": details, "plants": plants}
    for key in ("surfaces", "details", "plants"):
        assert result[key]
        print(key, len(result[key]))
    output.write_bytes(gzip.compress(json.dumps(result, separators=(",", ":")).encode(), mtime=0))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("architecture", type=Path)
    parser.add_argument("native_garden", type=Path)
    parser.add_argument("output", type=Path)
    main(**vars(parser.parse_args()))
