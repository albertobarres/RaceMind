using System.Globalization;
using System.Text.Json;
using RaceMind.Application;
using RaceMind.Domain;

namespace RaceMind.Infrastructure;

public sealed class TracingInsightsF1DataProvider(string dataRoot) : IF1DataProvider
{
    private readonly string _dataRoot = ResolveF1Root(Path.GetFullPath(dataRoot));
    private readonly Dictionary<int, IReadOnlyList<SessionLocation>> _sessionsByYear = [];

    public Task<IReadOnlyList<SessionSummary>> GetSessionsAsync(int year, CancellationToken _)
    {
        var result = new List<SessionSummary>();
        foreach (var location in GetSessionLocations(year))
        {
            result.Add(new SessionSummary(
                year,
                $"{year}/{location.GrandPrix}/{location.SessionName}",
                location.GrandPrix,
                location.SessionName,
                null,
                null));
        }

        IReadOnlyList<SessionSummary> sorted = result
            .OrderBy(summary => summary.GrandPrix, StringComparer.OrdinalIgnoreCase)
            .ThenBy(summary => summary.SessionName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return Task.FromResult(sorted);
    }

    public Task<SessionDetails?> GetSessionAsync(int year, string grandPrix, string sessionName, CancellationToken _)
    {
        var location = FindSession(year, grandPrix, sessionName);
        return Task.FromResult(location is null ? null : ReadSession(year, location));
    }

    public Task<IReadOnlyList<CornerSummary>?> GetCornersAsync(int year, string grandPrix, string sessionName, CancellationToken _)
    {
        var location = FindSession(year, grandPrix, sessionName);
        if (location is null)
        {
            return Task.FromResult<IReadOnlyList<CornerSummary>?>(null);
        }

        var path = Path.Combine(location.Directory, "corners.json");
        if (!File.Exists(path))
        {
            return Task.FromResult<IReadOnlyList<CornerSummary>?>(Array.Empty<CornerSummary>());
        }

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var numbers = NumberArray(root, "CornerNumber");
        var xs = NumberArray(root, "X");
        var ys = NumberArray(root, "Y");
        var angles = NumberArray(root, "Angle");
        var distances = NumberArray(root, "Distance");
        var count = new[] { numbers.Length, xs.Length, ys.Length, angles.Length, distances.Length }.Min();
        var result = new CornerSummary[count];
        for (var index = 0; index < count; index++)
        {
            result[index] = new CornerSummary((int)numbers[index], distances[index], xs[index], ys[index], angles[index]);
        }

        return Task.FromResult<IReadOnlyList<CornerSummary>?>(result);
    }

    public Task<IReadOnlyList<DriverSummary>?> GetDriversAsync(int year, string grandPrix, string sessionName, CancellationToken _)
    {
        var location = FindSession(year, grandPrix, sessionName);
        if (location is null)
        {
            return Task.FromResult<IReadOnlyList<DriverSummary>?>(null);
        }

        var drivers = ReadSession(year, location)?.Drivers ?? Array.Empty<DriverSummary>();
        return Task.FromResult<IReadOnlyList<DriverSummary>?>(drivers);
    }

    public Task<IReadOnlyList<LapSummary>?> GetLapsAsync(int year, string grandPrix, string sessionName, string driverCode, CancellationToken _)
    {
        var directory = FindDriverDirectory(year, grandPrix, sessionName, driverCode);
        return Task.FromResult(directory is null ? null : ReadLapSummaries(directory));
    }

    public Task<LapTelemetry?> GetLapTelemetryAsync(int year, string grandPrix, string sessionName, string driverCode, int lapNumber, CancellationToken _)
    {
        var directory = FindDriverDirectory(year, grandPrix, sessionName, driverCode);
        if (directory is null)
        {
            return Task.FromResult<LapTelemetry?>(null);
        }

        var path = Path.Combine(directory, $"{lapNumber}_tel.json");
        return Task.FromResult(File.Exists(path) ? ReadLapTelemetry(path, lapNumber, directory) : null);
    }

    private IReadOnlyList<SessionLocation> GetSessionLocations(int year)
    {
        var path = Path.Combine(_dataRoot, year.ToString(CultureInfo.InvariantCulture));

        if (_sessionsByYear.TryGetValue(year, out var cached))
        {
            return cached;
        }

        if (!Directory.Exists(path))
        {
            _sessionsByYear[year] = Array.Empty<SessionLocation>();
            return _sessionsByYear[year];
        }

        var result = new List<SessionLocation>();
        foreach (var grandPrixDirectory in Directory.EnumerateDirectories(path))
        {
            foreach (var sessionDirectory in Directory.EnumerateDirectories(grandPrixDirectory))
            {
                if (File.Exists(Path.Combine(sessionDirectory, "session_laptimes.json")))
                {
                    result.Add(new SessionLocation(Path.GetFileName(grandPrixDirectory),
                        Path.GetFileName(sessionDirectory), sessionDirectory));
                }
            }
        }

        _sessionsByYear[year] = result;
        return result;
    }

    private static string ResolveF1Root(string dataRoot)
    {
        var nestedF1Root = Path.Combine(dataRoot, "Coches", "F1");
        if (Directory.Exists(nestedF1Root))
        {
            return nestedF1Root;
        }

        if (Path.GetFileName(dataRoot).Equals("F1", StringComparison.OrdinalIgnoreCase))
        {
            return dataRoot;
        }

        var nested = Path.Combine(dataRoot, "Coches", "F1");
        return Directory.Exists(nested) ? nested : dataRoot;
    }

    private SessionLocation? FindSession(int year, string grandPrix, string sessionName) =>
        GetSessionLocations(year).FirstOrDefault(location =>
            string.Equals(location.GrandPrix, grandPrix, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(location.SessionName, sessionName, StringComparison.OrdinalIgnoreCase));

    private string? FindDriverDirectory(int year, string grandPrix, string sessionName, string driverCode)
    {
        var location = FindSession(year, grandPrix, sessionName);
        if (location is null)
        {
            return null;
        }

        var directory = Path.Combine(location.Directory, driverCode.ToUpperInvariant());
        return File.Exists(Path.Combine(directory, "laptimes.json")) ? directory : null;
    }

    private static SessionDetails? ReadSession(int year, SessionLocation location)
    {
        if (!File.Exists(Path.Combine(location.Directory, "session_laptimes.json")))
        {
            return null;
        }

        var driverMetadata = ReadDriverMetadata(Path.Combine(location.Directory, "drivers.json"));
        var drivers = new List<DriverSummary>();
        foreach (var directory in Directory.EnumerateDirectories(location.Directory))
        {
            if (!File.Exists(Path.Combine(directory, "laptimes.json")))
            {
                continue;
            }

            var code = Path.GetFileName(directory);
            driverMetadata.TryGetValue(code, out var metadata);
            drivers.Add(new DriverSummary(code, metadata?.FullName, metadata?.Team, metadata?.TeamColour,
                null, null));
        }

        return new SessionDetails(year, $"{year}/{location.GrandPrix}/{location.SessionName}", location.GrandPrix,
            location.SessionName, drivers.OrderBy(driver => driver.Code, StringComparer.OrdinalIgnoreCase).ToArray(),
            ReadCornerCount(Path.Combine(location.Directory, "corners.json")),
            ReadWeather(Path.Combine(location.Directory, "weather.json")));
    }

    private static Dictionary<string, DriverMetadata> ReadDriverMetadata(string path)
    {
        var result = new Dictionary<string, DriverMetadata>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(path))
        {
            return result;
        }

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        if (!document.RootElement.TryGetProperty("drivers", out var drivers) || drivers.ValueKind != JsonValueKind.Array)
        {
            return result;
        }

        foreach (var driver in drivers.EnumerateArray())
        {
            var code = StringValue(driver, "driver");
            if (!string.IsNullOrWhiteSpace(code))
            {
                result[code] = new DriverMetadata(
                    JoinName(StringValue(driver, "fn"), StringValue(driver, "ln")),
                    StringValue(driver, "team"), StringValue(driver, "tc"));
            }
        }

        return result;
    }

    private static IReadOnlyList<LapSummary> ReadLapSummaries(string driverDirectory)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(driverDirectory, "laptimes.json")));
        var root = document.RootElement;
        var laps = NumberArray(root, "lap");
        var times = NumberArray(root, "time");
        var sector1 = NumberArray(root, "s1");
        var sector2 = NumberArray(root, "s2");
        var sector3 = NumberArray(root, "s3");
        var compounds = StringArray(root, "compound");
        var stints = NumberArray(root, "stint");
        var personalBests = BooleanArray(root, "pb");
        var result = new List<LapSummary>(laps.Length);

        for (var index = 0; index < laps.Length; index++)
        {
            var number = (int)laps[index];
            result.Add(new LapSummary(number, At(times, index), At(sector1, index), At(sector2, index),
                At(sector3, index), At(compounds, index), ToInt(At(stints, index)),
                File.Exists(Path.Combine(driverDirectory, $"{number}_tel.json")), At(personalBests, index) ?? false));
        }

        return result;
    }

    private static LapTelemetry? ReadLapTelemetry(string path, int lapNumber, string driverDirectory)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        if (!document.RootElement.TryGetProperty("tel", out var telemetry))
        {
            return null;
        }

        var times = NumberArray(telemetry, "time");
        var distances = NumberArray(telemetry, "distance");
        var relativeDistances = NumberArray(telemetry, "rel_distance");
        var speeds = NumberArray(telemetry, "speed");
        var throttles = NumberArray(telemetry, "throttle");
        var brakes = NumberArray(telemetry, "brake");
        var count = new[] { times.Length, distances.Length, relativeDistances.Length,
            speeds.Length, throttles.Length, brakes.Length }.Min();
        if (count < 20)
        {
            return null;
        }

        var samples = new List<TelemetrySample>(count);
        for (var index = 0; index < count; index++)
        {
            samples.Add(new TelemetrySample(times[index], distances[index], relativeDistances[index], speeds[index],
                Math.Clamp(throttles[index], 0d, 100d), Math.Clamp(brakes[index], 0d, 1d)));
        }

        samples = samples
            .Where(sample => double.IsFinite(sample.ElapsedSeconds) && double.IsFinite(sample.DistanceMeters) &&
                             double.IsFinite(sample.RelativeDistance) && double.IsFinite(sample.SpeedKph) &&
                             double.IsFinite(sample.ThrottlePercent) && double.IsFinite(sample.BrakeFraction))
            .OrderBy(sample => sample.RelativeDistance)
            .Aggregate(new List<TelemetrySample>(), (unique, sample) =>
            {
                if (unique.Count == 0 || sample.RelativeDistance > unique[^1].RelativeDistance)
                {
                    unique.Add(sample);
                }

                return unique;
            });

        if (samples.Count < 20)
        {
            return null;
        }

        var lap = ReadLapSummaries(driverDirectory).FirstOrDefault(item => item.Number == lapNumber);
        return new LapTelemetry(lapNumber, lap?.LapTimeSeconds, lap?.Sector1Seconds, lap?.Sector2Seconds,
            lap?.Sector3Seconds, lap?.TyreCompound, lap?.Stint, samples);
    }

    private static WeatherSummary? ReadWeather(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var times = NumberArray(root, "wT");
        if (times.Length == 0)
        {
            return null;
        }

        var index = times.Length - 1;
        return new WeatherSummary(At(NumberArray(root, "wAT"), index), At(NumberArray(root, "wTT"), index),
            At(NumberArray(root, "wH"), index), At(NumberArray(root, "wP"), index),
            At(NumberArray(root, "wWS"), index), At(BooleanArray(root, "wR"), index), times[index]);
    }

    private static int ReadCornerCount(string path)
    {
        if (!File.Exists(path))
        {
            return 0;
        }

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return NumberArray(document.RootElement, "CornerNumber").Length;
    }

    private static double[] NumberArray(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<double>();
        }

        return values.EnumerateArray().Select(NumberValue).ToArray();
    }

    private static string?[] StringArray(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string?>();
        }

        return values.EnumerateArray().Select(value => value.ValueKind == JsonValueKind.String ? value.GetString() : null).ToArray();
    }

    private static bool?[] BooleanArray(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<bool?>();
        }

        return values.EnumerateArray().Select(value => value.ValueKind switch
        {
            JsonValueKind.True => (bool?)true,
            JsonValueKind.False => false,
            _ => null
        }).ToArray();
    }

    private static bool? At(bool?[] values, int index) => index < values.Length ? values[index] : null;

    private static double NumberValue(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number))
        {
            return number;
        }

        if (value.ValueKind == JsonValueKind.String &&
            double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out number) &&
            double.IsFinite(number))
        {
            return number;
        }

        return double.NaN;
    }

    private static double? At(double[] values, int index) => index < values.Length && double.IsFinite(values[index]) ? values[index] : null;
    private static T? At<T>(T?[] values, int index) => index < values.Length ? values[index] : default;
    private static int? ToInt(double? value) => value.HasValue && double.IsFinite(value.Value) ? (int)value.Value : null;
    private static string? StringValue(JsonElement root, string property) =>
        root.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static string? JoinName(string? first, string? last) =>
        string.Join(' ', new[] { first, last }.Where(part => !string.IsNullOrWhiteSpace(part)));

    private sealed record SessionLocation(string GrandPrix, string SessionName, string Directory);
    private sealed record DriverMetadata(string? FullName, string? Team, string? TeamColour);
}
