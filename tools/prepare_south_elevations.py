"""Extract the South views from the local Architectural2.pdf with PyMuPDF.

Run from any directory: python tools/prepare_south_elevations.py <original.pdf>
"""

import argparse
import json
import math
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
PDF_SCALE = 9  # 72 PDF pt/in × 1/8 in per Revit foot
WEB_OFFSET = (18, 6)
VIEW_BOUNDS = (346.7, 163, 2005.4, 913)
PARAPET_2_DATUM = 205.698
MIN_SEGMENT_PDF_POINTS = 0.72

# PDF point coordinates of the rising street grade, measured from the common
# building-facing edge of the terrain paths on A200 and A201.
GRADE = (
    (346.7, 908.7), (452.57, 906.198), (490.214, 906.198),
    (957.466, 888.198), (1004.704, 888.198), (1301.078, 882.322),
    (1462.575, 876.501), (1542.603, 874.577), (1625.858, 871.825),
    (1853.682, 862.262), (2005.4, 858.957),
)

X_CONTROLS = (
    ("Block 35 Left", 350.214, ("proposed",)),
    ("Block 37 Left", 905.964, ("existing", "proposed")),
    ("Block 39 Left", 1166.964, ("existing", "proposed")),
    ("Block 43 Left", 1390.464, ("existing", "proposed")),
)
Y_CONTROLS = (
    ("L1 - Block 35", 896.448), ("L1 - Block 43", 843.198),
    ("M1", 793.698), ("L2", 770.448), ("L3", 673.698),
    ("L4", 553.698), ("L5", 433.698), ("R1", 369.198),
    ("R2", 313.698), ("Parapet", 271.698), ("R3", 223.698),
)
SHARED_CORNICES = (
    (1159.877, 416.448, 1396.427, 416.448),
    (1388.964, 383.448, 1726.472, 383.448),
    (1726.472, 383.448, 2004.646, 383.448),
)


def measure(paths, predicate, axis, expected):
    observations = [p["rect"][axis] for p in paths if predicate(p["rect"])]
    if not observations:
        raise ValueError(f"Could not locate PDF vector control near {expected}")
    return min(observations, key=lambda value: abs(value - expected))


def register(paths_by_phase, grids, levels):
    horizontal = []
    vertical = []
    for name, u, phases in X_CONTROLS:
        for phase in phases:
            observed = measure(paths_by_phase[phase], lambda r: abs(r.x0 - u) < 0.05
                               and r.width < 0.03 and r.height > 25, 0, u)
            horizontal.append({"name": name, "view": phase, "point": observed, "feet": grids[name]})
    for name, v in Y_CONTROLS:
        observed = measure(paths_by_phase["proposed"], lambda r: abs(r.y0 - v) < 0.05
                           and r.height < 0.02 and abs(r.x0 - 133.053) < 0.02
                           and abs(r.x1 - 170.979) < 0.02, 1, v)
        vertical.append({"name": name, "view": "proposed", "point": observed, "feet": levels[name]})
    u_origin = math.fsum(c["point"] - PDF_SCALE * c["feet"] for c in horizontal) / len(horizontal)
    v_origin = math.fsum(c["point"] + PDF_SCALE * c["feet"] for c in vertical) / len(vertical)
    residuals = []
    for control, origin, sign in [(c, u_origin, 1) for c in horizontal] + [(c, v_origin, -1) for c in vertical]:
        residuals.append(abs(control["point"] - (origin + sign * PDF_SCALE * control["feet"])))
        control["point"] = round(control["point"], 5)
        control["feet"] = round(control["feet"], 6)

    cornices = []
    for target in SHARED_CORNICES:
        matches = {}
        for phase, paths in paths_by_phase.items():
            near = (p["rect"] for p in paths if max(p["color"]) < 0.2
                    and all(abs(x - y) < 0.03 for x, y in zip(p["rect"], target)))
            matches[phase] = list(min(near, key=lambda rect: math.dist(rect, target)))
        cornices.append(max(abs(a - b) for a, b in zip(matches["existing"], matches["proposed"])))

    return {
        "originPdfPoints": [round(u_origin, 6), round(v_origin, 6)],
        "pdfPointsPerFoot": PDF_SCALE,
        "webOffset": list(WEB_OFFSET),
        "mapping": ["x = (u - uOrigin) / 9 + 18", "y = (vOrigin - v) / 9 + 6"],
        "modelControlSource": "assets/revit-source/geometry.json, named wall/block grids and levels",
        "horizontalControls": horizontal,
        "verticalControls": vertical,
        "sharedCorniceChecks": len(cornices),
        "maxSharedCorniceResidualPdfPoints": max(cornices),
        "maxModelControlResidualPdfPoints": round(max(residuals), 6),
    }


def curve_segments(points):
    a, b, c, d = points
    chord = max(math.dist(a, d), 0.05)
    flatness = max(abs((d.x - a.x) * (p.y - a.y) - (d.y - a.y) * (p.x - a.x)) / chord
                   for p in (b, c))
    count = min(18, max(2, math.ceil(math.sqrt(flatness / 0.18))))
    start = a
    for index in range(1, count + 1):
        t = index / count
        s = 1 - t
        end = a * (s ** 3) + b * (3 * s * s * t) + c * (3 * s * t * t) + d * (t ** 3)
        yield start, end
        start = end


def path_segments(path):
    for kind, *points in path["items"]:
        if kind == "l":
            yield points[0], points[1]
        elif kind == "c":
            yield from curve_segments(points)
        elif kind in ("re", "qu"):
            shape = points[0]
            loop = [shape.tl, shape.tr, shape.br, shape.bl, shape.tl] if kind == "re" else [
                shape.ul, shape.ur, shape.lr, shape.ll, shape.ul,
            ]
            yield from zip(loop, loop[1:])


def inside(point):
    left, top, right, bottom = VIEW_BOUNDS
    if not (left <= point.x <= right and top <= point.y <= bottom):
        return False
    if point.y < 850:
        return True
    for (x0, y0), (x1, y1) in zip(GRADE, GRADE[1:]):
        if point.x <= x1:
            return point.y <= y0 + (y1 - y0) * (point.x - x0) / (x1 - x0) + 3.5
    return False


def is_datum(start, end, datum_y):
    if abs(start.y - end.y) > 0.005 or not any(abs(start.y - y) < 0.03 for y in datum_y):
        return False
    left, right = sorted((start.x, end.x))
    # The uppermost level has an elbow, shifting the start of its dash train.
    first_dash = 271.245 if abs(start.y - PARAPET_2_DATUM) < 0.03 else 179.979
    for length, origin in ((9, first_dash), (36, first_dash + 18)):
        repeat = (left - origin) / 63
        if abs(right - left - length) < 0.05 and abs(repeat - round(repeat)) < 0.001:
            return True
    return False


def extract(paths, registration, phase):
    u_origin, v_origin = registration["originPdfPoints"]
    datum_y = [c["point"] for c in registration["verticalControls"]]
    datum_y.append(PARAPET_2_DATUM)
    left, top, right, bottom = VIEW_BOUNDS
    segments = {}
    for path in paths:
        red, green, blue = path["color"]
        if abs(red - blue) > 0.01 or abs(red - green) > 0.01 or red > 0.53:
            continue
        width = path["width"]
        # 1.80 pt is the coordination box, 0.24 pt near 10% grey is masonry hatch.
        if width > 1 or (0.095 < red < 0.105 and width < 0.3):
            continue
        rect = path["rect"]
        if rect.x1 < left or rect.x0 > right or rect.y1 < top or rect.y0 > bottom:
            continue
        length = math.hypot(rect.width, rect.height)
        if length < (1.7 if red < 0.01 else 3.15):
            continue
        if red > 0.45 and width < 0.3:
            continue
        for a, b in path_segments(path):
            if not inside(a) or not inside(b) or math.dist(a, b) < MIN_SEGMENT_PDF_POINTS:
                continue
            if phase == "proposed" and is_datum(a, b, datum_y):
                continue
            p, q = sorted((a, b), key=lambda t: (t.x, t.y))
            key = tuple(round(value / 0.24) for value in (*p, *q))
            if key not in segments:
                segments[key] = (
                    round((p.x - u_origin) / PDF_SCALE + WEB_OFFSET[0], 3),
                    round((v_origin - p.y) / PDF_SCALE + WEB_OFFSET[1], 3),
                    round((q.x - u_origin) / PDF_SCALE + WEB_OFFSET[0], 3),
                    round((v_origin - q.y) / PDF_SCALE + WEB_OFFSET[1], 3),
                )
    return [coordinate for segment in segments.values() for coordinate in segment]


def bounds(values):
    x, y = values[::2], values[1::2]
    return {"min": [min(x), min(y)], "max": [max(x), max(y)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "assets" / "south-elevations.json")
    args = parser.parse_args()
    sources = {
        "existing": {"pdf": args.pdf.name, "page": 14, "sheet": "A200", "view": "1 · Existing Conditions - South Elevation"},
        "proposed": {"pdf": args.pdf.name, "page": 15, "sheet": "A201", "view": "1 · South"},
    }
    with fitz.open(args.pdf) as doc:
        paths_by_phase = {phase: [path for path in doc[source["page"] - 1].get_drawings()
                                 if path["color"] is not None]
                          for phase, source in sources.items()}
    geometry = json.loads((ROOT / "assets" / "revit-source" / "geometry.json").read_text(encoding="utf-8-sig"))
    registration = register(paths_by_phase, {g["name"]: g["points"][0][0] for g in geometry["grids"]},
                            {level["name"]: level["z"] for level in geometry["levels"]})
    existing = extract(paths_by_phase["existing"], registration, "existing")
    proposed = extract(paths_by_phase["proposed"], registration, "proposed")
    result = {
        "format": "Four coordinates x0, y0, x1, y1 per segment in model-world feet. Positive model-world Z faces the street.",
        "bounds": bounds(existing + proposed),
        "sources": sources,
        "registration": registration,
        "limits": [
            "Extracted and filtered native vector strokes above the street grade. Sheet frames, fills, text, context and fine surface hatch are omitted.",
            "The A200 dashed western part records drawing information only. This data contains no reconstructed historical volume.",
            "Controls register the X/Y plane. The line data does not identify component depth or correspondence to individual 3D elements.",
            "A201 is a sheet projection. Thin rooftop equipment and street-level elements may differ from the visible-model export.",
        ],
        "existing": existing,
        "proposed": proposed,
    }
    args.output.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"A200: {len(existing) // 4} / A201: {len(proposed) // 4} segments; {result['bounds']}")


if __name__ == "__main__":
    main()
