"""Build an A301 plate study using byte-verified references into the assembled SDT.

Run from the project root: python tools/prepare_semantic_study.py
"""
import gzip
import hashlib
import json
import struct
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from prepare_geometry import QUANTIZATION, classify, clean_segments, display_coordinates, feature_edges

ASSETS = Path("assets")
SOURCE = ASSETS / "revit-source"
# R2's walking surface has its own source datum. L1 blocks keep their actual offsets.
BANDS = {
    593176: ("L1 · B35", 0), 633454: ("L1 · B37", 0), 593142: ("L1 · B43", 0),
    828874: ("M1", 12), 593177: ("L2", 23), 593147: ("L3", 35),
    593178: ("L4", 48), 593179: ("L5", 61), 964417: ("R1", 74),
    613075: ("R2", 88), 1925045: ("Roof hardscape", 88), 696520: ("R3", 101),
}
NEXT_FLOOR = {593176: 8.08333, 633454: 8.08333, 593142: 8.08333, 828874: 8.08333,
              593177: 18.83333, 593147: 32.16667, 593178: 45.5, 593179: 58.83333}


def eligible(row, kind, datum, bounds):
    level = row["level"]
    if level not in BANDS:
        return False
    if row["category"] in {"OST_Floors", "OST_Roofs"}:
        return True
    # Only a named interior partition whose entire source extent fits the storey.
    low, high = bounds[row["id"]]
    return (kind == "wall" and "partition" in row["name"].lower() and level in NEXT_FLOOR
            and low >= datum - 0.55 and high <= NEXT_FLOOR[level] + 0.1)


def match_roof_supports(plates):
    """Check all low foot vertices against the retained plate triangles in Web feet."""
    garden = json.loads(gzip.decompress((ASSETS / "landscape.sdl").read_bytes()))
    triangles = np.concatenate([points for _, points in plates])
    owners = np.concatenate([np.full(len(points), level) for level, points in plates])
    a, b, c = triangles.transpose(1, 0, 2)
    u, v = b - a, c - a
    det = u[:, 0] * v[:, 2] - u[:, 2] * v[:, 0]
    valid = np.abs(det) > 1e-6
    det = np.where(valid, det, 1)
    result = {}
    for item in garden["details"]:
        points = np.reshape(item["positions"], (-1, 3))
        feet = np.unique(points[points[:, 1] < points[:, 1].min() + .10], axis=0)
        matches = set()
        for x, y, z in feet:
            dx, dz = x - a[:, 0], z - a[:, 2]
            t = (dx * v[:, 2] - dz * v[:, 0]) / det
            w = (dz * u[:, 0] - dx * u[:, 2]) / det
            gap = y - (a[:, 1] + t * u[:, 1] + w * v[:, 1])
            hit = valid & (t >= -.0001) & (w >= -.0001) & (t + w <= 1.0001) & (gap >= -.12) & (gap <= .35)
            if not np.any(hit):
                break
            matches.update(owners[hit].tolist())
        else:
            # Adjacent finish and structural plates can have different source
            # datums but must agree on the SAME motion at every support vertex.
            lifts = {BANDS[level][1] for level in matches}
            if len(lifts) == 1:
                result[item["ids"][0]] = {"levelIds": sorted(matches), "liftFt": lifts.pop(),
                                         "footSamples": len(feet)}
    return result


def main():
    data = json.loads((SOURCE / "geometry.json").read_bytes())
    scope = json.loads((SOURCE / "assembled-view.json").read_bytes())
    assert scope["view"] == "3D (Shaded) Uncropped"
    visible = set(scope["ids"])
    raw = np.frombuffer(gzip.decompress((SOURCE / "triangles.f32.gz").read_bytes()), "<f4")
    sdt = gzip.decompress((ASSETS / "snowdon.sdt").read_bytes())
    size, = struct.unpack_from("<I", sdt)
    baseline = json.loads(sdt[4:4 + size])
    payload = np.frombuffer(sdt[4 + size:], "<i2")
    parts = {(r["group"], r["finish"], r["floor"]): r["range"] for r in baseline["parts"]}
    cursors = Counter()
    datums = {d["id"]: d["z"] for d in data["levels"]}
    bounds = defaultdict(lambda: [float("inf"), -float("inf")])
    for row in data["records"]:
        box = bounds[row["id"]]
        box[0] = min(box[0], row["min"][2])
        box[1] = max(box[1], row["max"][2])

    roof_plates = []
    batches, strokes = defaultdict(list), defaultdict(list)
    for row in data["records"]:
        if row["id"] not in visible:
            continue
        material = data["materials"].get(str(row["material"]), {}).get("name", "").lower()
        key = classify(row, material, datums)
        if key is None:
            continue
        start = row["offset"]
        pts = display_coordinates(raw[start:start+row["size"]].reshape(-1, 3, 3))
        pts = pts[(pts[:, :, 1].min(1) > -2.25) & (np.abs(pts[:, :, 2]).max(1) < 53)]
        if not pts.size:
            continue
        offset = parts[key][0] + cursors[key]
        cursors[key] += pts.size
        if not np.array_equal(np.rint(pts * QUANTIZATION).astype("<i2").ravel(),
                              payload[offset:offset+pts.size]):
            raise ValueError(f"SDT triangle registration failed at element {row['id']}")
        kind, _, floor = key
        level = row["level"]
        if eligible(row, kind, datums.get(level), bounds):
            if level in (593179, 964417, 613075, 1925045, 696520) and row["category"] in {"OST_Floors", "OST_Roofs"}:
                roof_plates.append((level, pts))
            owner = (level, kind, floor)
            batches[owner].append([row["id"], row["material"], start, offset, pts.size])
            strokes[owner].append(feature_edges(pts))
    assert all(cursors[key] == span[1] for key, span in parts.items())
    meta = {"version": 1, "sourceView": scope["view"], "triangles": baseline["triangles"],
            "sdtSha256": hashlib.sha256((ASSETS / "snowdon.sdt").read_bytes()).hexdigest(),
            "datums": {level: {"label": label, "zFt": datums[level], "liftFt": lift}
                       for level, (label, lift) in BANDS.items()},
            "roofSupports": match_roof_supports(roof_plates),
            "rangeUnits": "int16 scalar coordinates", "recordFields":
            ["elementId", "materialId", "sourceFloatOffset", "sdtOffset", "sdtLength"], "batches": []}
    edges = bytearray()
    for (level, kind, floor), records in sorted(batches.items()):
        points = clean_segments(np.concatenate(strokes[level, kind, floor]), .10)
        meta["batches"].append({"level": level, "kind": kind, "floor": floor, "records": records,
                                "edgeRange": [len(edges)//2, points.size]})
        edges.extend(np.rint(points * QUANTIZATION).astype("<i2").tobytes())
    header = json.dumps(meta, ensure_ascii=True, separators=(",", ":")).encode()
    output = ASSETS / "semantic-plates.sdt"
    output.write_bytes(gzip.compress(struct.pack("<I", len(header)) + header + edges, mtime=0))
    for level, (label, _) in BANDS.items():
        rows = [r for b in meta["batches"] if b["level"] == level for r in b["records"]]
        print(label, len({r[0] for r in rows}), sum(r[-1]//9 for r in rows))
    print("Total verified triangles", baseline["triangles"], "study bytes", output.stat().st_size)


if __name__ == "__main__":
    main()
