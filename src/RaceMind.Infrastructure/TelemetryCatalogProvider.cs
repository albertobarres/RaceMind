using System.Globalization;
using RaceMind.Application;

namespace RaceMind.Infrastructure;

public sealed class TelemetryCatalogProvider(string dataRoot) : ITelemetryCatalogProvider
{
    private readonly string _telemetryRoot = ResolveTelemetryRoot(Path.GetFullPath(dataRoot));

    public Task<TelemetryCatalog> GetCatalogAsync(CancellationToken cancellationToken)
    {
        var cars = BuildCars();
        var motorcycles = BuildMotorcycles();
        var simulators = BuildSimulators();

        return Task.FromResult(new TelemetryCatalog(new[]
        {
            new TelemetryCategory("cars", "Coches", cars),
            new TelemetryCategory("motorcycles", "Motos", motorcycles),
            new TelemetryCategory("simulators", "Simuladores", simulators)
        }));
    }

    private IReadOnlyList<TelemetrySeries> BuildCars()
    {
        var f1Root = Path.Combine(_telemetryRoot, "Coches", "F1");
        var years = Directory.Exists(f1Root)
            ? Directory.EnumerateDirectories(f1Root)
                .Select(path => (Path: path, Year: ParseYear(Path.GetFileName(path))))
                .Where(item => item.Year.HasValue)
                .OrderByDescending(item => item.Year)
                .Select(item => BuildYear(item.Path, item.Year!.Value))
                .ToArray()
            : Array.Empty<TelemetryYear>();

        return new[]
        {
            new TelemetrySeries("f1", "F1", years, Array.Empty<TelemetryDataset>())
        };
    }

    private IReadOnlyList<TelemetrySeries> BuildMotorcycles()
    {
        var motorcycleRoot = Path.Combine(_telemetryRoot, "Motos");
        var motoGpRoot = Path.Combine(motorcycleRoot, "MotoGP");
        var worldSbkRoot = Path.Combine(motorcycleRoot, "WorldSBK");
        var motoGpYears = BuildYears(motoGpRoot);
        var motoGpDatasets = BuildDatasets(motoGpRoot);
        var worldSbkDatasets = Directory.Exists(worldSbkRoot)
            ? BuildDatasets(worldSbkRoot)
            : Directory.Exists(motorcycleRoot)
                ? Directory.EnumerateDirectories(motorcycleRoot)
                    .Where(path => !Path.GetFileName(path).Equals("MotoGP", StringComparison.OrdinalIgnoreCase))
                    .SelectMany(path => Directory.EnumerateDirectories(path)
                        .Select(BuildDirectoryDataset)
                        .DefaultIfEmpty(BuildDirectoryDataset(path)))
                    .OrderBy(dataset => dataset.Name, StringComparer.OrdinalIgnoreCase)
                    .ToArray()
                : Array.Empty<TelemetryDataset>();

        return new[]
        {
            new TelemetrySeries("motogp", "MotoGP", motoGpYears, motoGpDatasets),
            new TelemetrySeries("worldsbk", "WorldSBK", Array.Empty<TelemetryYear>(), worldSbkDatasets)
        };
    }

    private IReadOnlyList<TelemetrySeries> BuildSimulators()
    {
        var simulatorRoot = Path.Combine(_telemetryRoot, "Simuladores");
        if (!Directory.Exists(simulatorRoot))
        {
            return Array.Empty<TelemetrySeries>();
        }

        return Directory.EnumerateDirectories(simulatorRoot)
            .Select(path =>
            {
                var name = Path.GetFileName(path);
                return new TelemetrySeries(ToKey(name), name, BuildYears(path), BuildSimulatorDatasets(path));
            })
            .OrderBy(series => series.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static IReadOnlyList<TelemetryYear> BuildYears(string root)
    {
        if (!Directory.Exists(root))
        {
            return Array.Empty<TelemetryYear>();
        }

        return Directory.EnumerateDirectories(root)
            .Select(path => (Path: path, Year: ParseYear(Path.GetFileName(path))))
            .Where(item => item.Year.HasValue)
            .OrderByDescending(item => item.Year)
            .Select(item => BuildYear(item.Path, item.Year!.Value))
            .ToArray();
    }

    private IReadOnlyList<TelemetryDataset> BuildDatasets(string root)
    {
        if (!Directory.Exists(root))
        {
            return Array.Empty<TelemetryDataset>();
        }

        return Directory.EnumerateDirectories(root)
            .Where(path => !ParseYear(Path.GetFileName(path)).HasValue)
            .Select(path => BuildDirectoryDataset(path))
            .Concat(Directory.EnumerateFiles(root).Select(path => BuildFileDataset(path)))
            .OrderBy(dataset => dataset.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private IReadOnlyList<TelemetryDataset> BuildSimulatorDatasets(string root)
    {
        var datasetDirectories = Directory.EnumerateDirectories(root)
            .Where(path => !ParseYear(Path.GetFileName(path)).HasValue)
            .ToArray();
        if (datasetDirectories.Length > 0)
        {
            return datasetDirectories
                .Select(path => BuildSimulatorDataset(path))
                .OrderBy(dataset => dataset.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        return Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
            .Select(file => new TelemetryDataset(
                ToKey(Path.GetRelativePath(root, file)),
                FormatRelativeName(Path.GetRelativePath(root, file)),
                RelativeLocation(file),
                false))
            .OrderBy(dataset => dataset.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private TelemetryDataset BuildSimulatorDataset(string path)
    {
        var dataFiles = Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories).ToArray();
        var firstFile = dataFiles.FirstOrDefault();
        var label = FormatRelativeName(firstFile is null
            ? Path.GetFileName(path)
            : Path.GetRelativePath(Path.Combine(_telemetryRoot, "Simuladores"), firstFile));
        return new TelemetryDataset(ToKey(Path.GetRelativePath(_telemetryRoot, path)), label,
            RelativeLocation(path), false);
    }

    private static TelemetryYear BuildYear(string yearDirectory, int year)
    {
        var sessions = new List<SessionSummary>();
        foreach (var grandPrixDirectory in Directory.EnumerateDirectories(yearDirectory))
        {
            foreach (var sessionDirectory in Directory.EnumerateDirectories(grandPrixDirectory))
            {
                if (!File.Exists(Path.Combine(sessionDirectory, "session_laptimes.json")))
                {
                    continue;
                }

                sessions.Add(new SessionSummary(
                    year,
                    $"{year}/{Path.GetFileName(grandPrixDirectory)}/{Path.GetFileName(sessionDirectory)}",
                    Path.GetFileName(grandPrixDirectory),
                    Path.GetFileName(sessionDirectory),
                    null,
                    null));
            }
        }

        return new TelemetryYear(year, sessions
            .OrderBy(session => session.GrandPrix, StringComparer.OrdinalIgnoreCase)
            .ThenBy(session => session.SessionName, StringComparer.OrdinalIgnoreCase)
            .ToArray());
    }

    private TelemetryDataset BuildDirectoryDataset(string path)
    {
        var name = Path.GetFileName(path);
        var hasSessionData = File.Exists(Path.Combine(path, "session_laptimes.json")) ||
                             Directory.EnumerateFiles(path, "*.csv", SearchOption.AllDirectories).Any() ||
                             Directory.EnumerateFiles(path, "*.txt", SearchOption.AllDirectories).Any();
        return new TelemetryDataset(ToKey(name), name, RelativeLocation(path), hasSessionData);
    }

    private TelemetryDataset BuildFileDataset(string path)
    {
        var name = Path.GetFileName(path);
        return new TelemetryDataset(ToKey(Path.GetFileNameWithoutExtension(path)), name, RelativeLocation(path), false);
    }

    private string RelativeLocation(string path) =>
        Path.GetRelativePath(_telemetryRoot, path).Replace(Path.DirectorySeparatorChar, '/');

    private static string FormatRelativeName(string path) =>
        path.Replace(Path.DirectorySeparatorChar, ' ').Replace(Path.AltDirectorySeparatorChar, ' ');

    private static int? ParseYear(string name) =>
        int.TryParse(name, NumberStyles.None, CultureInfo.InvariantCulture, out var year) ? year : null;

    private static string ToKey(string value)
    {
        var chars = value.ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-');
        return string.Join('-', new string(chars.ToArray()).Split('-', StringSplitOptions.RemoveEmptyEntries));
    }

    private static string ResolveTelemetryRoot(string configuredRoot)
    {
        var last = Path.GetFileName(configuredRoot);
        var parent = Directory.GetParent(configuredRoot);
        if (last.Equals("F1", StringComparison.OrdinalIgnoreCase) &&
            parent?.Name.Equals("Coches", StringComparison.OrdinalIgnoreCase) == true)
        {
            return parent.Parent?.FullName ?? configuredRoot;
        }

        if (last.Equals("F1", StringComparison.OrdinalIgnoreCase))
        {
            return parent?.FullName ?? configuredRoot;
        }

        return configuredRoot;
    }
}
