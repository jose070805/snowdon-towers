"""Trace C101 context for the miniature site's materials and schematic massing.

The source is a flattened linked Site Plan, in model feet after registration.
Long surface boundaries are simplified across gaps in the drawing. Heights
are display dimensions; the C101 export has no reliable building elevations.
"""
import argparse
import gzip
import json
from math import dist
from pathlib import Path

import ezdxf

from prepare_site_plan import segments


PLATE = [-226.28, -133, 253.72, 245.66]

# Edge samples are traced from the registered curb lines in site-plan.json.
# Close at the crop, or bridge very small gaps where linework is interrupted.
STREET_NORTH = [
    [-226.28, 41.47], [-178.56, 41.98], [-141.37, 42.26], [-113.6, 42.46],
    [-94, 42.6], [-61, 45], [-18, 47.16], [24, 45.5], [83, 43.2], [98.36, 40.9],
    [132.69, 36.2], [169.77, 26.68], [216.77, 9.68], [253.72, -3.68],
]
STREET_SOUTH = [
    [-226.28, 61.43], [-209.38, 61.97], [-186.89, 62.72], [-174.39, 63.13],
    [-150.87, 63.91], [-123.32, 64.82], [-109.1, 65.29], [-80.65, 66.24],
    [-66.24, 66.71], [-29.32, 67.93], [14.66, 69.39], [37.92, 70.16],
    [66.06, 71.09], [101.24, 72.26], [126.32, 73.23], [145.62, 75.98],
    [168.54, 81.68], [190.52, 87.29], [215.52, 93.67], [232.72, 97.9], [253.72, 102.03],
]
FRONT_CURB = [
    [-226.28, 69.38], [-211.7, 69.9], [-182.47, 70.87], [-156.34, 71.73],
    [-120.94, 72.91], [-77.93, 74.33], [-45.71, 75.35], [-20.02, 75.23],
    [4.34,79.03], [29.97,78.38], [43.64,79.34], [76.11,78.91],
    [112.54, 82.23], [147, 84.8], [180, 93.1], [218, 102.1], [253.72, 111.3],
]
RAMP_OUTSIDE = [
    [-73.71,74.53], [-73.71,125.55], [-73.09,131.82], [-71.27,137.8],
    [-68.33,143.3], [-64.34,148.18], [-59.46,152.17], [-53.95,155.11],
    [-47.98,156.93], [-41.71,157.55], [-30.45,157.55],
]
RAMP_INSIDE = [
    [-47.71,77.29], [-47.71,117.55], [-46.2,123.87], [-42.0,128.83],
    [-36.02,131.36], [-32.77,131.52], [-29.54,130.91], [-30.43,156.01],
]


def strip(north, south):
    return [*north, *reversed(south)]


def rect(x0, z0, x1, z1):
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]


def surface(kind, name, points):
    return {"kind": kind, "name": name, "points": points}


def building(kind, name, points, height):
    return {"kind": kind, "name": name, "points": points, "height": height}


def parking_markings(source):
    coords = json.loads((source / "C101-coords.json").read_text(encoding="utf-8"))
    right, up = coords["right"], coords["up"]
    with gzip.open(source / "C101-model.dxf.gz", "rt", encoding="utf-8", errors="surrogateescape") as stream:
        drawing = ezdxf.read(stream)
    link = next(item for item in drawing.modelspace().query("INSERT") if "Sample Site_rvt" in item.dxf.name)

    def world(p):
        return (
            round((right[0] * p.x + up[0] * p.y) / 12 + 18, 2),
            round(5 - (right[1] * p.x + up[1] * p.y) / 12, 2),
        )

    seen = set()
    result = []
    for a, b in segments(item for item in link.virtual_entities() if item.dxf.layer == "C-PRKG-____-OTLN"):
        start, end = world(a), world(b)
        if dist(start, end) < 0.7 or not all(
            PLATE[0] <= x <= -75 and 69 <= z <= PLATE[3] for x, z in (start, end)
        ):
            continue
        key = tuple(sorted((start, end)))
        if key not in seen:
            seen.add(key)
            result.append([*start, *end])
    return result


def prepare(source):
    # Layered fills are ordered from the broad site surfaces to smaller insets.
    # The base turf and front apron are schematic inferences from empty parcels.
    surfaces = [
        surface("green", "Base grass", rect(*PLATE)),
        surface("rear", "Back-of-site paved corridor", [
            [-226.28, -84.8], [-155, -88.1], [-91, -90.1], [-20, -94.5],
            [46, -101.8], [109, -106.9], [179, -111.8], [253.72, -116.4],
            [253.72, -92.2], [179, -87.5], [109, -82.4], [46, -76.5],
            [-20, -71.8], [-91, -67.4], [-155, -64.4], [-226.28, -61.1],
        ]),
        surface("walk", "Building platforms on the street front", [
            [-226.28,-38], [-103,-38], [-93.5,-57.75], [78,-57.75], [91,-52],
            [230,-49], [253.72,-23], *reversed(STREET_NORTH),
        ]),
        surface("walk", "Curb and frontage paving", strip(STREET_NORTH, FRONT_CURB)),
        surface("parking", "West surface parking and drive", [
            [-226.28, 71], [-195, 71], [-155, 73], [-106, 74], [-73.71, 76],
            [-73.71, 124.5], [-69.94,140.62], [-61.99,150.3], [-53.95,155.11],
            [-41.71,157.55], [-29.65,157.55], [-11.9,165], [-5,193.6],
            [-1.43,240.64], [-27.1,235.5], [-40.7,235], [-43.6,241.8],
            [-115,237.8], [-132,238], [-153.7,239], [-184.39,238.22], [-226.28,236.98],
        ]),
        surface("asphalt", "Main street", strip(STREET_NORTH, STREET_SOUTH)),
        surface("asphalt", "Lower site access drive", [
            [4.34,77], [13.2,76.9], [11.23,110.01], [10.3,136.29], [9.62,155.36],
            [7.93,202.73], [6.49,242.99], [6.36,245.66], [-1.61,245.66],
            [1.42,160.64], [3.11,113.33],
        ]),
        surface("walk", "Right-hand block forecourt", [
            [38.4,78.9], [106.0,81.6], [181.5,94.4], [242.0,118.2],
            [234.3,164.4], [190.1,159.6], [171.5,179.0], [155.0,178.2],
            [120.0,195.0], [38.5,189.4], [36.8,179.1],
        ]),
        surface("green", "Raised parking island", [
            [-194.5,95.5], [-180.8,95.8], [-172.6,104.2], [-172.8,135.6],
            [-173.7,179.5], [-174.4,222.7], [-183.7,226.1], [-196.7,227.1],
            [-195.7,196.1], [-195.0,143.1], [-194.1,115.2],
        ]),
        surface("green", "Inner ramp terrace", [
            [-44.71,78.59], [-30.4,78.91], [-30.46,128.2], [-34.2,130.35],
            [-41.8,126.1], [-44.7,119.5],
        ]),
        surface("ramp", "Linked curved ramp and wall", strip(RAMP_OUTSIDE, RAMP_INSIDE)),
    ]
    footprints = [
        building("west", "West street block 1", rect(-209.62,-37.83,-186.62,33.17), 36),
        building("west", "West street block 2", rect(-182.62,-37.83,-156.62,33.17), 42),
        building("west", "West street block 3", rect(-152.62,-37.83,-126.62,33.17), 40),
        building("west", "West street block 4", rect(-122.62,-37.83,-95.5,36.01), 33),
        building("east", "East street block", [
            [89.97,-34.83], [131.92,-40.35], [132.62,-35.06], [231.76,-48.11],
            [236.97,-8.56], [164.68,17.90], [132.86,28.14], [98.71,31.58],
        ], 43),
        building("south", "Southwest parking block", [
            [-110.91,188.43], [-35.59,193.44], [-38.61,243.85], [-114.26,238.82],
        ], 25),
        building("south", "South central block", [
            [44.64,83.42], [110.89,88.05], [96.48,166.25], [87.6,187.17], [39.63,183.81],
        ], 39),
        building("south", "Southeast large block", [
            [124.54,157], [131.45,130.41], [115.4,126.24], [121.92,87.63],
            [197.39,107.26], [184.27,144.15], [166.32,139.48],
            [158.67,168.88], [124.31,245.66], [83.45,245.66],
        ], 37),
        building("annex", "Far end foreground annex", [
            [206.83,110.31], [246.4,124.39], [230.36,163.52], [194.56,150.79],
        ], 26),
    ]
    return {
        "schema": 1,
        "source": "Linked Snowdon Towers Sample Site geometry in C101-model.dxf.gz",
        "notes": "Registered C101 footprints and curb samples closed at the crop. Surface classifications and model heights are diagrammatic. White masses are height studies, not surveyed building silhouettes.",
        "plate": PLATE,
        "surfaces": surfaces,
        "footprints": footprints,
        "markings": parking_markings(source),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="folder containing C101-model.dxf.gz and C101-coords.json")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = prepare(args.source)
    args.output.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    print({key: len(data[key]) for key in ("surfaces", "footprints", "markings")})
