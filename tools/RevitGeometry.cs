using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;

namespace Snowdon;

public sealed class GeometryExport : IExternalApplication
{
    private const string AssembledViewName = "3D (Shaded) Uncropped";
    private static readonly string Folder = Path.GetDirectoryName(typeof(GeometryExport).Assembly.Location)!;
    private static readonly string Status = Path.Combine(Folder, "status.txt");

    public Result OnStartup(UIControlledApplication application)
    {
        File.WriteAllText(Status, "Waiting for Revit to initialize.\n");
        application.Idling += ExportOnIdle;
        return Result.Succeeded;
    }

    public Result OnShutdown(UIControlledApplication application) => Result.Succeeded;

    private static void ExportOnIdle(object sender, IdlingEventArgs args)
    {
        if (sender is not UIApplication ui) return;
        ui.Idling -= ExportOnIdle;
        try
        {
            var path = File.ReadAllText(Path.Combine(Folder, "input.txt")).Trim();
            File.AppendAllText(Status, "Opening scratch copy.\n");
            using var info = BasicFileInfo.Extract(path);
            using var options = new OpenOptions();
            if (info.IsWorkshared) options.DetachFromCentralOption = DetachFromCentralOption.DetachAndPreserveWorksets;
            var doc = ui.Application.OpenDocumentFile(ModelPathUtils.ConvertUserVisiblePathToModelPath(path), options);
            try { Export(doc); }
            finally { doc.Close(false); }
            File.AppendAllText(Status, "Complete.\n");
        }
        catch (Exception exception) { File.AppendAllText(Status, exception.ToString()); }
    }

    private static readonly BuiltInCategory[] Categories = {
        BuiltInCategory.OST_Walls, BuiltInCategory.OST_Floors, BuiltInCategory.OST_Roofs,
        BuiltInCategory.OST_Windows, BuiltInCategory.OST_Doors, BuiltInCategory.OST_CurtainWallPanels,
        BuiltInCategory.OST_CurtainWallMullions, BuiltInCategory.OST_Columns, BuiltInCategory.OST_StructuralColumns,
        BuiltInCategory.OST_StructuralFraming, BuiltInCategory.OST_Stairs, BuiltInCategory.OST_StairsRailing,
        BuiltInCategory.OST_Ramps, BuiltInCategory.OST_GenericModel, BuiltInCategory.OST_Cornices,
        BuiltInCategory.OST_Fascia, BuiltInCategory.OST_RoofSoffit,
        BuiltInCategory.OST_Parts, BuiltInCategory.OST_Mass
    };

    private static void Export(Document doc)
    {
        var assembledView = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>()
            .Single(view => !view.IsTemplate && view.Name == AssembledViewName && !view.IsSectionBoxActive);
        var assembledIds = new FilteredElementCollector(doc, assembledView.Id).WhereElementIsNotElementType()
            .ToElementIds().Select(id => id.Value).Order().ToArray();
        File.WriteAllText(Path.Combine(Folder, "assembled-view.json"),
            JsonSerializer.Serialize(new { view = assembledView.Name, ids = assembledIds }));
        var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
            .OrderBy(level => level.ProjectElevation)
            .Select(level => new { id = level.Id.Value, name = level.Name, z = level.ProjectElevation }).ToArray();
        var materials = new FilteredElementCollector(doc).OfClass(typeof(Material)).Cast<Material>()
            .ToDictionary(mat => mat.Id.Value, mat => new { name = mat.Name, r = mat.Color.Red, g = mat.Color.Green, b = mat.Color.Blue, alpha = mat.Transparency });
        var grids = new FilteredElementCollector(doc).OfClass(typeof(Grid)).Cast<Grid>()
            .Select(grid => new { name = grid.Name, points = grid.Curve.Tessellate().Select(p => new[] { p.X, p.Y }).ToArray() }).ToArray();
        var lastPhase = doc.Phases.Cast<Phase>().LastOrDefault();
        var found = new FilteredElementCollector(doc).WherePasses(new ElementMulticategoryFilter(Categories))
            .WhereElementIsNotElementType().ToElements();
        var records = new List<object>();
        var counts = new Dictionary<string, int>();
        var offset = 0;
        using var file = File.Create(Path.Combine(Folder, "triangles.f32.gz"));
        using var zip = new GZipStream(file, CompressionLevel.Fastest);
        using var writer = new BinaryWriter(zip);
        using var geoOptions = new Options { DetailLevel = ViewDetailLevel.Medium, IncludeNonVisibleObjects = false };
        File.AppendAllText(Status, $"Opened. {found.Count} candidate elements.\n");
        foreach (var element in found)
        {
            if (lastPhase != null && element.HasPhases())
            {
                var phase = element.GetPhaseStatus(lastPhase.Id);
                if (phase == ElementOnPhaseStatus.Demolished || phase == ElementOnPhaseStatus.Temporary ||
                    phase == ElementOnPhaseStatus.Future) continue;
            }
            if (element.DesignOption is { IsPrimary: false }) continue;
            var family = element is FamilyInstance instance ? instance.Symbol.FamilyName : "";
            var category = ((BuiltInCategory)element.Category.Id.Value).ToString();
            var name = element.Name;
            var type = doc.GetElement(element.GetTypeId())?.Name ?? "";
            var bounds = element.get_BoundingBox(null);
            if (bounds == null) continue;
            var meshes = new Dictionary<long, List<float>>();
            try
            {
                var geometries = element.get_Geometry(geoOptions);
                if (geometries == null) continue;
                Collect(geometries, Transform.Identity, meshes);
            }
            catch (Exception e)
            {
                File.AppendAllText(Status, $"Skipped {element.Id}: {e.Message}\n");
                continue;
            }
            foreach (var entry in meshes)
            {
                if (entry.Value.Count == 0) continue;
                foreach (var value in entry.Value) writer.Write(value);
                records.Add(new {
                    id = element.Id.Value, category, name, type, family, material = entry.Key,
                    level = element.LevelId.Value, offset, size = entry.Value.Count,
                    min = Point(bounds.Min), max = Point(bounds.Max)
                });
                offset += entry.Value.Count;
                counts[category] = counts.GetValueOrDefault(category) + 1;
            }
        }
        File.WriteAllText(Path.Combine(Folder, "geometry.json"),
            JsonSerializer.Serialize(new { title = doc.Title, levels, materials, grids, records, counts, triangles = offset / 9 }));
        File.AppendAllText(Status, $"Wrote {offset / 9} triangles.\n");
    }

    private static double[] Point(XYZ point) => new[] { point.X, point.Y, point.Z };

    private static void Collect(GeometryElement geometries, Transform transform, Dictionary<long, List<float>> meshes)
    {
        foreach (var geometry in geometries)
        {
            if (geometry is GeometryInstance instance)
            {
                Collect(instance.GetSymbolGeometry(), transform.Multiply(instance.Transform), meshes);
            }
            else if (geometry is Solid solid)
            {
                foreach (Face face in solid.Faces) CollectMesh(face.Triangulate(0.35), transform, face.MaterialElementId.Value, meshes);
            }
            else if (geometry is Mesh mesh) CollectMesh(mesh, transform, mesh.MaterialElementId.Value, meshes);
        }
    }

    private static void CollectMesh(Mesh mesh, Transform transform, long material, Dictionary<long, List<float>> meshes)
    {
        if (mesh.NumTriangles == 0) return;
        if (!meshes.TryGetValue(material, out var positions)) meshes.Add(material, positions = new List<float>());
        for (int i = 0; i < mesh.NumTriangles; i++)
        {
            var triangle = mesh.get_Triangle(i);
            for (int j = 0; j < 3; j++)
            {
                var point = transform.OfPoint(triangle.get_Vertex(transform.HasReflection && j > 0 ? 3 - j : j));
                positions.Add((float)point.X);
                positions.Add((float)point.Y);
                positions.Add((float)point.Z);
            }
        }
    }
}
