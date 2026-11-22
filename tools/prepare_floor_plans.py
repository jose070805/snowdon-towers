"""Extract registered floor plans from the two locally exported drawing sets."""
import argparse
import gzip
import json
from pathlib import Path
from collections import defaultdict

import fitz

from prepare_south_elevations import path_segments


ROOT = Path(__file__).resolve().parents[1]
# Shared 1/8-inch viewport, as registered in the drawing review spatial map.
ORIGIN = (1363.57398, 1058.10869)
SCALE = 9


def convert(point):
    return ((point.x - ORIGIN[0]) / SCALE + 18, (point.y - ORIGIN[1]) / SCALE + 5)


def check_registration(page, sheet, grids):
    words = page.get_text("words")
    assert sheet in {w[4] for w in words}, f"Missing {sheet} on expected page"
    for key, axis in (("1", 0), ("8", 0), ("A", 1), ("E", 1)):
        coord = grids[key]["points"][0][axis]
        target = ORIGIN[axis] + (1 if axis == 0 else -1) * SCALE * coord
        assert any(w[4] == key and abs((w[axis] + w[axis+2]) / 2 - target) < 1.0
                   for w in words), f"{sheet}: grid {key} did not register"
def extract(page, sheet, grids, *, overview=False):
    check_registration(page, sheet, grids)
    # Skip engineering axes when a thin stroke coincides with a project grid.
    xs = [g["points"][0][0] + 18 for g in grids.values()
          if abs(g["points"][0][0] - g["points"][-1][0]) < .001]
    zs = [5 - g["points"][0][1] for g in grids.values()
          if abs(g["points"][0][1] - g["points"][-1][1]) < .001]
    lines = {}
    max_gray, max_weight, min_detail = (.69, 1.85, .14) if overview else (.55, 1.34, .45)
    west, east, north, south = (-95, 92, -54, 43) if overview else (-95, 92, -44, 49 if sheet == "A100" else 39)
    for path in page.get_drawings():
        color = path.get("color")
        width = path.get("width") or 0
        if not color or max(color) > max_gray or max(color)-min(color) > .02 or not .23 <= width <= max_weight:
            continue
        for a, b in path_segments(path):
            pair = [convert(a), convert(b)]
            if not all(west < x < east and north < z < south for x, z in pair):
                continue
            if width < .30:
                (x, z), (xx, zz) = pair
                length = ((xx-x)**2 + (zz-z)**2)**.5
                if not min_detail <= length <= 24:
                    continue
                if abs(x-xx) < .01 and any(abs(x-g) < .02 for g in xs):
                    continue
                if abs(z-zz) < .01 and any(abs(z-g) < .02 for g in zs):
                    continue
            start, end = sorted(tuple(round(v * 64) for v in pt) for pt in pair)
            if start != end:
                lines[start + end] = max(lines.get(start + end, 0), int(width >= .3) + int(width >= .8))
    # Revit also prints grid/section dash trains as independent solid strokes.
    # Remove repeated 4-ft / 1-ft runs on a common axis, retaining isolated details.
    runs = defaultdict(list)
    for edge, grade in lines.items():
        x, z, xx, zz = edge
        if grade == 0 and (x == xx or z == zz):
            length = abs(xx-x) + abs(zz-z)
            if min(abs(length-64), abs(length-256)) <= 1:
                runs[(0, x) if x == xx else (1, z)].append((edge, length))
    for run in runs.values():
        if len(run) >= 5 and min(n for _, n in run) < 66 and max(n for _, n in run) > 254:
            for edge, _ in run:
                del lines[edge]
    assert lines
    return {"sheet": sheet, "page": page.number + 1,
            "ink": [[v for edge, g in lines.items() if g == grade for v in edge] for grade in (0, 1, 2)]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reference_pdf", type=Path, help="Architectural1.pdf, pages 7–12")
    parser.add_argument("baseline_pdf", type=Path, help="Architectural2.pdf, unchanged A100 and A102")
    args = parser.parse_args()
    grids = {g["name"]: g for g in json.loads((ROOT/"assets/revit-source/geometry.json").read_bytes())["grids"]}
    with fitz.open(args.baseline_pdf) as doc:
        plans = {"P": extract(doc[0], "A100", grids), "L2": extract(doc[2], "A102", grids)}
    reference = {
        "L1": (7, "A101", "First Floor Plan"),
        "L3": (9, "A103", "Third Floor Plan"),
        "L4": (10, "A104", "Fourth Floor Plan"),
        "L5": (11, "A105", "Fifth Floor Plan"),
        "ROOF": (12, "A106", "Roof Plan"),
    }
    with fitz.open(args.reference_pdf) as doc:
        check_registration(doc[7], "A102", grids)
        for code, (page, sheet, title) in reference.items():
            source = doc[page - 1]
            assert title in source.get_text().splitlines()
            plans[code] = extract(source, sheet, grids, overview=True)
            plans[code]["source"] = args.reference_pdf.name
    out = ROOT/"assets/floor-plans.sdp"
    out.write_bytes(gzip.compress(json.dumps({"unitsPerFoot": 64, "plans": plans},
                                              separators=(",", ":")).encode(), mtime=0))
    print({k: sum(map(len, p["ink"]))//4 for k, p in plans.items()}, out.stat().st_size)


if __name__ == "__main__":
    main()
