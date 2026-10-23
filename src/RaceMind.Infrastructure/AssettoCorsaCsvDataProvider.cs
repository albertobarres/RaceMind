using System.Globalization;
using System.Text.Json;
using RaceMind.Application;

namespace RaceMind.Infrastructure;

public sealed class AssettoCorsaCsvDataProvider(string dataRoot) : IAssettoCorsaDataProvider
{
    private readonly string _assettoRoot = ResolveAssettoRoot(Path.GetFullPath(dataRoot));
    private readonly object _cacheLock = new();
    private string? _cachedDirectory;
    private SessionData? _cachedSession;
    private readonly Dictionary<string, (AssettoSessionDetails Details, IReadOnlyList<LapData> Laps)> _analysisCache = new(StringComparer.OrdinalIgnoreCase);

    public Task<IReadOnlyList<TelemetryDataset>> GetSessionsAsync(CancellationToken cancellationToken)
    {
        if (!Directory.Exists(_assettoRoot))
        {
            return Task.FromResult<IReadOnlyList<TelemetryDataset>>(Array.Empty<TelemetryDataset>());
        }

        var result = Directory.EnumerateFiles(_assettoRoot, "telemetry.csv", SearchOption.AllDirectories)
            .Select(path =>
            {
                var relative = Path.GetRelativePath(_assettoRoot, Path.GetDirectoryName(path)!);
                var parts = relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                var name = parts.Length > 1 ? $"{parts[^2]} · {parts[^1]}" : parts[0];
                var key = ToKey(relative);
                return new TelemetryDataset(key, name, key, true);
            })
            .OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return Task.FromResult<IReadOnlyList<TelemetryDataset>>(result);
    }

    public Task<AssettoSessionDetails?> GetSessionAsync(string sessionPath, CancellationToken cancellationToken)
    {
        var directory = ResolveSessionDirectory(sessionPath);
        if (directory is null)
        {
            return Task.FromResult<AssettoSessionDetails?>(null);
        }

        return Task.FromResult<AssettoSessionDetails?>(GetAnalysis(directory, sessionPath, cancellationToken).Details);
    }

    public Task<AssettoLapComparison?> CompareLapsAsync(string sessionPath, int referenceLap, int comparedLap, int pointCount, CancellationToken cancellationToken)
    {
        if (referenceLap <= 0 || comparedLap <= 0 || referenceLap == comparedLap || pointCount is < 2 or > 2001)
        {
            return Task.FromResult<AssettoLapComparison?>(null);
        }

        var directory = ResolveSessionDirectory(sessionPath);
        if (directory is null)
        {
            return Task.FromResult<AssettoLapComparison?>(null);
        }

        var analysis = GetAnalysis(directory, sessionPath, cancellationToken);
        var laps = analysis.Laps;
        var reference = laps.FirstOrDefault(lap => lap.Summary.Number == referenceLap);
        var compared = laps.FirstOrDefault(lap => lap.Summary.Number == comparedLap);
        if (reference is null || compared is null || reference.Samples.Count < 20 || compared.Samples.Count < 20)
        {
            return Task.FromResult<AssettoLapComparison?>(null);
        }

        var points = new AssettoComparisonPoint[pointCount];
        for (var index = 0; index < pointCount; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var relativeDistance = (double)index / (pointCount - 1);
            var referenceSample = Interpolate(reference.Samples, relativeDistance);
            var comparedSample = Interpolate(compared.Samples, relativeDistance);
            points[index] = new AssettoComparisonPoint(relativeDistance,
                comparedSample.ElapsedSeconds - referenceSample.ElapsedSeconds, referenceSample, comparedSample);
        }

        return Task.FromResult<AssettoLapComparison?>(new AssettoLapComparison(referenceLap, comparedLap,
            reference.Summary.LapTimeSeconds, compared.Summary.LapTimeSeconds,
            compared.Summary.LapTimeSeconds - reference.Summary.LapTimeSeconds,
            reference.Summary.DistanceMeters, compared.Summary.DistanceMeters, points));
    }

    public string? GetAssetPath(string sessionPath, string assetName)
    {
        if (assetName is not ("map.png" or "car.jpg"))
        {
            return null;
        }

        var directory = ResolveSessionDirectory(sessionPath);
        var path = directory is null ? null : Path.Combine(directory, assetName);
        return path is not null && File.Exists(path) ? path : null;
    }

    private SessionData ReadSession(string directory, CancellationToken cancellationToken)
    {
        var path = Path.Combine(directory, "telemetry.csv");
        using var reader = new StreamReader(path);
        var header = reader.ReadLine()?.TrimStart('\uFEFF');
        if (string.IsNullOrWhiteSpace(header))
        {
            return new SessionData([], [], "El CSV está vacío o no contiene encabezados.");
        }

        var headers = header.Split(',').Select((name, index) => (name: name.Trim(), index))
            .ToDictionary(item => item.name, item => item.index, StringComparer.OrdinalIgnoreCase);
        if (!headers.ContainsKey("timestamp") || !headers.ContainsKey("speed_kmh") || !headers.ContainsKey("pos_x") || !headers.ContainsKey("pos_z"))
        {
            return new SessionData([], [], "Faltan columnas obligatorias (timestamp, speed_kmh, pos_x, pos_z).");
        }

        var samples = new List<RawSample>();
        var warningSet = new HashSet<string>(StringComparer.Ordinal);
        var lineNumber = 1;
        while (!reader.EndOfStream)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var line = reader.ReadLine();
            lineNumber++;
            if (string.IsNullOrWhiteSpace(line)) continue;
            var fields = line.Split(',');
            if (fields.Length < headers.Count)
            {
                warningSet.Add($"Se omitieron filas mal formadas; primera incidencia en la línea {lineNumber}.");
                continue;
            }

            double Get(string name, double fallback = 0) => headers.TryGetValue(name, out var index) &&
                index < fields.Length && double.TryParse(fields[index], NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value)
                ? value : fallback;

            var timestamp = Get("timestamp", double.NaN);
            var x = Get("pos_x", double.NaN);
            var z = Get("pos_z", double.NaN);
            var speed = Get("speed_kmh", double.NaN);
            if (!double.IsFinite(timestamp) || !double.IsFinite(x) || !double.IsFinite(z) || !double.IsFinite(speed) || speed < 0 || speed > 450)
            {
                warningSet.Add($"Se omitieron filas con valores inválidos; primera incidencia en la línea {lineNumber}.");
                continue;
            }

            samples.Add(new RawSample(timestamp, Get("wall_time", timestamp), x, z, speed, Get("rpms"), (int)Get("gear"),
                Get("throttle"), Get("brake"), Get("steer_angle"), Get("g_lat"), Get("g_lon"), Get("slip_angle"),
                Get("fuel"), Get("tyre_core_fl", 26), Get("tyre_core_fr", 26), Get("tyre_core_rl", 26), Get("tyre_core_rr", 26),
                Get("brake_temp_fl", 26), Get("brake_temp_fr", 26), Get("brake_temp_rl", 26), Get("brake_temp_rr", 26),
                Get("water_temp"), Get("lap_progress", double.NaN), Get("completed_laps", double.NaN)));
        }

        if (samples.Count == 0)
        {
            warningSet.Add("No se han encontrado muestras de telemetría válidas.");
        }

        return new SessionData(samples, headers.Keys.ToArray(), string.Join(" ", warningSet));
    }

    private SessionData GetSessionData(string directory, CancellationToken cancellationToken)
    {
        lock (_cacheLock)
        {
            if (string.Equals(_cachedDirectory, directory, StringComparison.OrdinalIgnoreCase) && _cachedSession is not null)
            {
                return _cachedSession;
            }

            var session = ReadSession(directory, cancellationToken);
            _cachedDirectory = directory;
            _cachedSession = session;
            return session;
        }
    }

    private (AssettoSessionDetails Details, IReadOnlyList<LapData> Laps) GetAnalysis(string directory, string sessionId, CancellationToken cancellationToken)
    {
        lock (_cacheLock)
        {
            if (_analysisCache.TryGetValue(sessionId, out var cached)) return cached;
            var data = GetSessionData(directory, cancellationToken);
            var laps = BuildLaps(data.Samples);
            var metadata = ReadMetadata(directory);
            var track = Downsample(data.Samples, 1400)
                .Select(sample => new AssettoTrackPoint(sample.X, sample.Z, sample.SpeedKph)).ToArray();
            var details = new AssettoSessionDetails(
                sessionId,
                Path.GetFileName(Path.GetDirectoryName(directory)!) ?? "Circuito desconocido",
                Path.GetFileName(directory),
                metadata,
                data.Samples.Count,
                data.Samples.Count > 1 ? data.Samples[^1].Timestamp - data.Samples[0].Timestamp : 0,
                data.Samples.Count > 0 ? data.Samples.Max(sample => sample.SpeedKph) : null,
                laps.Count,
                laps.Count > 0 ? laps.Min(lap => lap.Summary.LapTimeSeconds) : null,
                File.Exists(Path.Combine(directory, "map.png")) ? $"/cars/assetto-corsa/sessions/{sessionId}/assets/map.png" : null,
                File.Exists(Path.Combine(directory, "car.jpg")) ? $"/cars/assetto-corsa/sessions/{sessionId}/assets/car.jpg" : null,
                laps.Select(lap => lap.Summary).ToArray(), track, BuildWarnings(data, laps));
            var result = (details, (IReadOnlyList<LapData>)laps);
            _analysisCache[sessionId] = result;
            return result;
        }
    }

    private static List<LapData> BuildLaps(IReadOnlyList<RawSample> samples)
    {
        if (samples.Count < 40) return [];

        var crossings = new List<double>();
        var inCrossing = false;
        foreach (var sample in samples)
        {
            var nearStartLine = Math.Sqrt(sample.X * sample.X + sample.Z * sample.Z) <= 15;
            if (nearStartLine && !inCrossing)
            {
                if (crossings.Count == 0 || sample.Timestamp - crossings[^1] > 30)
                {
                    crossings.Add(sample.Timestamp);
                }
            }
            inCrossing = nearStartLine;
        }

        var result = new List<LapData>();
        for (var crossingIndex = 0; crossingIndex + 1 < crossings.Count; crossingIndex++)
        {
            var start = crossings[crossingIndex];
            var end = crossings[crossingIndex + 1];
            var lapSamples = samples.Where(sample => sample.Timestamp >= start && sample.Timestamp < end).ToArray();
            if (lapSamples.Length < 40 || end - start is < 20 or > 1200) continue;

            var distance = 0d;
            for (var index = 1; index < lapSamples.Length; index++)
            {
                var previous = lapSamples[index - 1];
                var current = lapSamples[index];
                var deltaTime = current.Timestamp - previous.Timestamp;
                var deltaDistance = Math.Sqrt(Math.Pow(current.X - previous.X, 2) + Math.Pow(current.Z - previous.Z, 2));
                if (deltaTime is > 0 and <= 0.2 && deltaDistance <= 15) distance += deltaDistance;
            }

            if (distance < 500 || distance > 100_000) continue;
            var speeds = lapSamples.Select(sample => sample.SpeedKph).Order().ToArray();
            var summary = new AssettoLapSummary(result.Count + 1, start, end - start, distance,
                Percentile(speeds, .99), speeds.Average(), lapSamples.Max(sample => sample.Rpm),
                lapSamples[0].Fuel, lapSamples[^1].Fuel, lapSamples.Length);
            result.Add(new LapData(summary, NormalizeLap(lapSamples)));
        }

        return result;
    }

    private static IReadOnlyList<AssettoTelemetrySample> NormalizeLap(IReadOnlyList<RawSample> source)
    {
        var cumulative = new double[source.Count];
        for (var index = 1; index < source.Count; index++)
        {
            var elapsed = source[index].Timestamp - source[index - 1].Timestamp;
            var delta = Math.Sqrt(Math.Pow(source[index].X - source[index - 1].X, 2) + Math.Pow(source[index].Z - source[index - 1].Z, 2));
            cumulative[index] = cumulative[index - 1] + (elapsed is > 0 and <= .2 && delta <= 15 ? delta : 0);
        }

        var totalDistance = cumulative[^1];
        if (totalDistance <= 0) return [];
        var result = new List<AssettoTelemetrySample>(Math.Min(source.Count, 801));
        var previousPosition = -1d;
        for (var index = 0; index < source.Count; index++)
        {
            var relative = cumulative[index] / totalDistance;
            if (relative - previousPosition < 1d / 800 && index != source.Count - 1) continue;
            var row = source[index];
            result.Add(ToTelemetrySample(row, relative, row.Timestamp - source[0].Timestamp));
            previousPosition = relative;
        }
        return result;
    }

    private static AssettoTelemetrySample Interpolate(IReadOnlyList<AssettoTelemetrySample> samples, double relativeDistance)
    {
        var right = 1;
        while (right < samples.Count - 1 && samples[right].RelativeDistance < relativeDistance) right++;
        var left = Math.Max(0, right - 1);
        var first = samples[left];
        var second = samples[right];
        var span = second.RelativeDistance - first.RelativeDistance;
        var ratio = span <= 0 ? 0 : Math.Clamp((relativeDistance - first.RelativeDistance) / span, 0, 1);
        double Lerp(double a, double b) => a + ((b - a) * ratio);
        int LerpInt(int a, int b) => (int)Math.Round(Lerp(a, b));
        return new AssettoTelemetrySample(relativeDistance, Lerp(first.ElapsedSeconds, second.ElapsedSeconds),
            Lerp(first.SpeedKph, second.SpeedKph), Lerp(first.Rpm, second.Rpm), LerpInt(first.Gear, second.Gear),
            Lerp(first.Throttle, second.Throttle), Lerp(first.Brake, second.Brake), Lerp(first.Steering, second.Steering),
            Lerp(first.LateralG, second.LateralG), Lerp(first.LongitudinalG, second.LongitudinalG),
            Lerp(first.SlipAngle, second.SlipAngle), Lerp(first.X, second.X), Lerp(first.Z, second.Z), Lerp(first.FuelLitres, second.FuelLitres),
            Lerp(first.TyreCoreFl, second.TyreCoreFl), Lerp(first.TyreCoreFr, second.TyreCoreFr), Lerp(first.TyreCoreRl, second.TyreCoreRl), Lerp(first.TyreCoreRr, second.TyreCoreRr),
            Lerp(first.BrakeTempFl, second.BrakeTempFl), Lerp(first.BrakeTempFr, second.BrakeTempFr), Lerp(first.BrakeTempRl, second.BrakeTempRl), Lerp(first.BrakeTempRr, second.BrakeTempRr));
    }

    private static AssettoTelemetrySample ToTelemetrySample(RawSample row, double relativeDistance, double elapsedSeconds) =>
        new(relativeDistance, elapsedSeconds, row.SpeedKph, row.Rpm, row.Gear, Math.Clamp(row.Throttle, 0, 1),
            Math.Clamp(row.Brake, 0, 1), row.Steering, row.LateralG, row.LongitudinalG, row.SlipAngle,
            row.X, row.Z, row.Fuel, row.TyreCoreFl, row.TyreCoreFr, row.TyreCoreRl, row.TyreCoreRr,
            row.BrakeTempFl, row.BrakeTempFr, row.BrakeTempRl, row.BrakeTempRr);

    private static List<AssettoTrackPoint> Downsample(IReadOnlyList<RawSample> samples, int limit)
    {
        var stride = Math.Max(1, (int)Math.Ceiling((double)samples.Count / limit));
        return samples.Where((_, index) => index % stride == 0 || index == samples.Count - 1)
            .Select(sample => new AssettoTrackPoint(sample.X, sample.Z, sample.SpeedKph)).ToList();
    }

    private static IReadOnlyList<string> BuildWarnings(SessionData data, IReadOnlyList<LapData> laps)
    {
        var warnings = new List<string>();
        if (!string.IsNullOrWhiteSpace(data.ReadWarning)) warnings.Add(data.ReadWarning);
        if (laps.Count == 0) warnings.Add("No se detectaron vueltas completas fiables alrededor de la línea de salida; se muestran los datos de sesión y la trazada, pero la comparación por vueltas no está disponible.");
        if (data.Samples.Count > 0 && data.Samples.All(sample => !double.IsFinite(sample.LapProgress) || sample.LapProgress == 0) &&
            data.Samples.All(sample => !double.IsFinite(sample.CompletedLaps) || sample.CompletedLaps == 0))
            warnings.Add("lap_progress y completed_laps no contienen progreso utilizable; las vueltas se reconstruyen por pasos repetidos cerca del origen de la posición.");
        if (data.Samples.Count > 0 && data.Samples.All(sample => sample.WaterTemp == data.Samples[0].WaterTemp))
            warnings.Add("water_temp es constante en el archivo y se omite como indicador de temperatura de motor.");
        if (data.Samples.Count > 0 && data.Samples.All(sample => sample.BrakeTempFl == 26 && sample.BrakeTempFr == 26 && sample.BrakeTempRl == 26 && sample.BrakeTempRr == 26))
            warnings.Add("Las temperaturas de freno permanecen en 26 °C en todas las muestras; se consideran no disponibles.");
        var outliers = data.Samples.Count(sample => Math.Abs(sample.LateralG) > 5 || Math.Abs(sample.LongitudinalG) > 5);
        if (outliers > 0) warnings.Add($"Se detectaron {outliers} picos de aceleración superiores a 5 g; las tarjetas de vuelta usan percentiles robustos para limitar su efecto.");
        if (data.Samples.Zip(data.Samples.Skip(1), (first, second) => second.Timestamp - first.Timestamp).Any(delta => delta > .2))
            warnings.Add("Hay intervalos de muestreo superiores a 0,2 s; los saltos no se suman a la distancia recorrida calculada.");
        return warnings;
    }

    private static AssettoCarSpecs ReadMetadata(string directory)
    {
        var path = Path.Combine(directory, "session_info.json");
        if (!File.Exists(path)) return new AssettoCarSpecs(null, null, null, null);
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            return new AssettoCarSpecs(ReadInt(root, "max_rpm"), ReadNumber(root, "max_power_w"), ReadNumber(root, "max_torque_nm"), ReadNumber(root, "max_fuel_l"));
        }
        catch (JsonException)
        {
            return new AssettoCarSpecs(null, null, null, null);
        }
    }

    private string? ResolveSessionDirectory(string sessionPath)
    {
        if (string.IsNullOrWhiteSpace(sessionPath) || sessionPath.Contains('/') || sessionPath.Contains('\\')) return null;
        foreach (var telemetryFile in Directory.EnumerateFiles(_assettoRoot, "telemetry.csv", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(_assettoRoot, Path.GetDirectoryName(telemetryFile)!);
            if (string.Equals(ToKey(relative), sessionPath, StringComparison.OrdinalIgnoreCase))
            {
                return Path.GetDirectoryName(telemetryFile);
            }
        }
        return null;
    }

    private static string ResolveAssettoRoot(string dataRoot)
    {
        var candidate = Path.Combine(dataRoot, "Simuladores", "Assetto Corsa");
        if (Directory.Exists(candidate)) return candidate;
        return Path.GetFileName(dataRoot).Equals("Assetto Corsa", StringComparison.OrdinalIgnoreCase)
            ? dataRoot
            : candidate;
    }

    private static string ToKey(string value) => string.Join('-', new string(value.ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-').ToArray()).Split('-', StringSplitOptions.RemoveEmptyEntries));
    private static int? ReadInt(JsonElement root, string key) => root.TryGetProperty(key, out var element) && element.TryGetInt32(out var value) ? value : null;
    private static double? ReadNumber(JsonElement root, string key) => root.TryGetProperty(key, out var element) && element.TryGetDouble(out var value) && double.IsFinite(value) ? value : null;
    private static double Percentile(IReadOnlyList<double> sortedValues, double percentile) => sortedValues.Count == 0 ? 0 : sortedValues[Math.Clamp((int)Math.Floor((sortedValues.Count - 1) * percentile), 0, sortedValues.Count - 1)];

    private sealed record SessionData(List<RawSample> Samples, string[] Headers, string ReadWarning);
    private sealed record LapData(AssettoLapSummary Summary, IReadOnlyList<AssettoTelemetrySample> Samples);
    private sealed record RawSample(double Timestamp, double WallTime, double X, double Z, double SpeedKph, double Rpm, int Gear,
        double Throttle, double Brake, double Steering, double LateralG, double LongitudinalG, double SlipAngle, double Fuel,
        double TyreCoreFl, double TyreCoreFr, double TyreCoreRl, double TyreCoreRr, double BrakeTempFl, double BrakeTempFr,
        double BrakeTempRl, double BrakeTempRr, double WaterTemp, double LapProgress, double CompletedLaps);
}
