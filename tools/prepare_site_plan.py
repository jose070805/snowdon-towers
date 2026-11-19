"""Convert the C101 Revit model-space DXF to registered Three.js line segments."""

import argparse
import gzip
import json
import math
from pathlib import Path

import ezdxf
from ezdxf.path import make_path


def segments(entities):
    for entity in entities:
        kind = entity.dxftype()
        if kind == "INSERT":
            yield from segments(entity.virtual_entities())
        elif kind == "LINE":
            yield entity.dxf.start, entity.dxf.end
        elif kind in ("ARC", "SPLINE", "ELLIPSE", "LWPOLYLINE", "POLYLINE", "CIRCLE"):
            points = list(make_path(entity).flattening(distance=1.7, segments=4))
            yield from zip(points, points[1:])


def export(dxf, transforms, output):
    if dxf.suffix == ".gz":
        with gzip.open(dxf, mode="rt", encoding="utf-8", errors="surrogateescape") as stream:
            drawing = ezdxf.read(stream)
    else:
        drawing = ezdxf.readfile(dxf)
    if drawing.units != ezdxf.units.IN:
        raise ValueError("Expected the C101 drawing to use inches.")
    coords = json.loads(transforms.read_bytes())
    right, up = coords["right"], coords["up"]
    model = drawing.modelspace()
    link = next(item for item in model.query("INSERT") if "Sample Site_rvt" in item.dxf.name)
    site = list(link.virtual_entities())

    def world(x, y):
        return (
            (right[0] * x + up[0] * y) / 12 + 18,
            5 - (right[1] * x + up[1] * y) / 12,
        )

    def collect(entities, min_feet):
        result = []
        seen = set()
        for a, b in segments(entities):
            if a.distance(b) < min_feet * 12:
                continue
            first, second = (tuple(round(v, 2) for v in world(p.x, p.y)) for p in (a, b))
            marker = tuple(sorted((first, second)))
            if marker not in seen:
                result.append([*first, *second])
                seen.add(marker)
        return sorted(result, key=lambda s: (s[0]+s[2]) * .38 - (s[1]+s[3]) * .62)

    def from_site(*names):
        return [element for element in site if element.dxf.layer in names]

    boundary = collect(model.query('*[layer=="C-PROP-LINE-OTLN"]'), .65)
    roads = collect(from_site("C-TOPO-____-OTLN", "L-SITE-WALL-OTLN"), 1.15)
    contours = collect(from_site("C-TOPO-MAJR-OTLN", "C-TOPO-MINR-OTLN"), .9)
    context = collect(from_site("L-SITE-____-OTLN", "A-GENM-____-OTLN", "C-PRKG-____-OTLN"), .9)
    ext_min, ext_max = (drawing.header[name] for name in ("$EXTMIN", "$EXTMAX"))
    center = world((ext_min[0]+ext_max[0])/2, (ext_min[1]+ext_max[1])/2)
    limits = [world(x, y) for x in (ext_min[0], ext_max[0]) for y in (ext_min[1], ext_max[1])]
    # Validate scale and alignment against the west exterior wall of the architectural export.
    host = collect(model.query('*[layer=="A-WALL-____-OTLN"]'), 30)
    assert any(abs(edge[0]+93.5) < .24 and abs(edge[2]+93.5) < .24 and abs(edge[1]-edge[3]) > 33 for edge in host)
    layers = {"boundary": boundary, "roads": roads, "contours": contours, "context": context}
    assert all(layers.values())
    result = {
        "sheet": "C101", "view": coords["name"], "registration": "Revit project coordinates",
        "camera": {"x": center[0], "z": center[1], "width": 980, "height": 830,
                   "bearing": -math.atan2(up[0], up[1])},
        "extents": limits, "layers": layers,
    }
    output.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print({name: len(values) for name, values in layers.items()}, result["camera"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("dxf", type=Path)
    parser.add_argument("transforms", type=Path)
    parser.add_argument("output", type=Path)
    export(**vars(parser.parse_args()))
