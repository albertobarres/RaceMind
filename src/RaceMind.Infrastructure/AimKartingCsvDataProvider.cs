using System.Globalization;
using RaceMind.Application;

namespace RaceMind.Infrastructure;

/// <summary>Reads AiM session CSV files and uses their beacon markers as lap boundaries.</summary>
public sealed partial class AimKartingCsvDataProvider(string dataRoot) : IKartingDataProvider
{
    private readonly string _kartingRoot = ResolveKartingRoot(Path.GetFullPath(dataRoot));
    private readonly object _cacheLock = new();
    private readonly Dictionary<string, Analysis> _cache = new(StringComparer.OrdinalIgnoreCase);

    public Task<IReadOnlyList<TelemetryDataset>> GetSessionsAsync(CancellationToken cancellationToken)
    {
        if (!Directory.Exists(_kartingRoot))
        {
            return Task.FromResult<IReadOnlyList<TelemetryDataset>>(Array.Empty<TelemetryDataset>());
        }

        var datasets = Directory.EnumerateFiles(_kartingRoot, "*.csv", SearchOption.AllDirectories)
            // This known 19-second, low-quality recording is not a karting lap/session.
            .Where(path => !IsExcludedSession(path))
            .Select(path => new TelemetryDataset(
                ToKey(Path.GetRelativePath(_kartingRoot, path)),
                $"{Path.GetFileName(Path.GetDirectoryName(path))} · {Path.GetFileNameWithoutExtension(path)}",
                Path.GetRelativePath(_kartingRoot, path).Replace(Path.DirectorySeparatorChar, '/'),
                true))
            .OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return Task.FromResult<IReadOnlyList<TelemetryDataset>>(datasets);
    }

    public Task<KartingSessionDetails?> GetSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        var path = ResolveSessionPath(sessionId);
        if (path is null) return Task.FromResult<KartingSessionDetails?>(null);
        return Task.FromResult<KartingSessionDetails?>(GetAnalysis(path, cancellationToken).Details);
    }

    public Task<KartingLapComparison?> CompareLapsAsync(string sessionId, int referenceLap, int comparedLap, int pointCount, CancellationToken cancellationToken)
    {
        if (referenceLap <= 0 || comparedLap <= 0 || referenceLap == comparedLap || pointCount is < 2 or > 2001)
        {
            return Task.FromResult<KartingLapComparison?>(null);
        }

        var path = ResolveSessionPath(sessionId);
        if (path is null) return Task.FromResult<KartingLapComparison?>(null);
        var analysis = GetAnalysis(path, cancellationToken);
        var reference = analysis.Laps.FirstOrDefault(lap => lap.Summary.Number == referenceLap && lap.Summary.IsComparable);
        var compared = analysis.Laps.FirstOrDefault(lap => lap.Summary.Number == comparedLap && lap.Summary.IsComparable);
        if (reference is null || compared is null) return Task.FromResult<KartingLapComparison?>(null);

        var points = new KartingComparisonPoint[pointCount];
        for (var index = 0; index < pointCount; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var relative = (double)index / (pointCount - 1);
            var first = Interpolate(reference.Samples, relative);
            var second = Interpolate(compared.Samples, relative);
            points[index] = new KartingComparisonPoint(relative, second.ElapsedSeconds - first.ElapsedSeconds, first, second);
        }

        return Task.FromResult<KartingLapComparison?>(new KartingLapComparison(referenceLap, comparedLap,
            reference.Summary.LapTimeSeconds, compared.Summary.LapTimeSeconds,
            compared.Summary.LapTimeSeconds - reference.Summary.LapTimeSeconds, points));
    }

    private Analysis GetAnalysis(string path, CancellationToken cancellationToken)
    {
        lock (_cacheLock)
        {
            if (_cache.TryGetValue(path, out var cached)) return cached;
            var parsed = ReadCsv(path, cancellationToken);
            var analysis = BuildAnalysis(path, parsed, cancellationToken);
            _cache[path] = analysis;
            return analysis;
        }
    }

    private static CsvSession ReadCsv(string path, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(path);
        var metadata = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        string? headerLine = null;
        string? unitsLine = null;
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(line)) continue;
            var fields = ParseCsvLine(line);
            if (fields.Count > 1 && fields[0].Equals("Time", StringComparison.OrdinalIgnoreCase) &&
                fields.Any(field => field.Equals("GPS Speed", StringComparison.OrdinalIgnoreCase)))
            {
                headerLine = line;
                unitsLine = reader.ReadLine();
                break;
            }
            if (fields.Count > 1) metadata[fields[0]] = fields.Skip(1).ToArray();
        }

        if (headerLine is null || unitsLine is null) throw new InvalidDataException("El CSV AiM no contiene encabezados y unidades.");
        var headers = ParseCsvLine(headerLine).Select(value => value.Trim()).ToArray();
        var units = ParseCsvLine(unitsLine).Select(value => value.Trim()).ToArray();
        if (headers.Length != units.Length) throw new InvalidDataException("Los encabezados y unidades del CSV AiM no tienen la misma longitud.");

        var required = new[] { "Time", "GPS Speed", "GPS Latitude", "GPS Longitude", "GPS PosAccuracy", "RPM", "Calculated Gear", "Water Temp", "GPS LatAcc", "GPS LonAcc" };
        var columns = headers.Select((name, index) => (name, index)).ToDictionary(item => item.name, item => item.index, StringComparer.OrdinalIgnoreCase);
        var missing = required.Where(name => !columns.ContainsKey(name)).ToArray();
        if (missing.Length > 0) throw new InvalidDataException($"Faltan canales obligatorios: {string.Join(", ", missing)}.");

        var samples = new List<RawSample>();
        var warnings = new List<string>();
        var fractionalGearSeen = false;
        var lineNumber = 0;
        while ((line = reader.ReadLine()) is not null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            lineNumber++;
            if (string.IsNullOrWhiteSpace(line)) continue;
            var fields = ParseCsvLine(line);
            if (fields.Count != headers.Length)
            {
                if (warnings.Count == 0) warnings.Add($"Se omitieron filas con número de columnas incorrecto (primera incidencia: fila de datos {lineNumber}).");
                continue;
            }

            bool Try(string name, out double value) => double.TryParse(fields[columns[name]], NumberStyles.Float, CultureInfo.InvariantCulture, out value) && double.IsFinite(value);
            if (!Try("Time", out var time) || !Try("GPS Speed", out var speed) || !Try("GPS Latitude", out var latitude) ||
                !Try("GPS Longitude", out var longitude) || !Try("GPS PosAccuracy", out var accuracy) || !Try("RPM", out var rpm) ||
                !Try("Calculated Gear", out var gearValue) || !Try("Water Temp", out var water) ||
                !Try("GPS LatAcc", out var lateral) || !Try("GPS LonAcc", out var longitudinal) ||
                speed < 0 || speed > 250 || latitude is < -90 or > 90 || longitude is < -180 or > 180 || accuracy < 0 || rpm < 0 ||
                gearValue is < 0 or > 2)
            {
                if (warnings.Count == 0) warnings.Add($"Se omitieron muestras con valores no válidos (primera incidencia: fila de datos {lineNumber}).");
                continue;
            }

            if (Math.Abs(gearValue - Math.Round(gearValue)) > 0.05) fractionalGearSeen = true;

            Try("GPS Nsat", out var satellites);
            Try("GPS SpdAccuracy", out var speedAccuracy);
            samples.Add(new RawSample(time, speed, latitude, longitude, accuracy / 1000d, satellites, speedAccuracy, rpm,
                (int)Math.Round(gearValue, MidpointRounding.AwayFromZero), water, lateral, longitudinal));
        }

        var markers = ParseMetadataList(metadata, "Beacon Markers");
        if (markers.Count == 0) warnings.Add("No hay Beacon Markers; no se reconstruyen vueltas automáticamente.");
        var sampleRate = ParseMetadataNumber(metadata, "Sample Rate");
        if (fractionalGearSeen) warnings.Add("Calculated Gear contiene transiciones fraccionarias; se normalizaron al estado discreto más cercano (0/1/2).");
        ValidateTime(samples, sampleRate, warnings);
        ValidateGear(samples, warnings);
        ValidateMarkerTimes(metadata, markers, warnings);
        ValidateMarkerPositions(samples, markers, warnings);
        return new CsvSession(metadata, headers, units, samples, markers, warnings);
    }

    private static Analysis BuildAnalysis(string path, CsvSession csv, CancellationToken cancellationToken)
    {
        if (csv.Samples.Count == 0) throw new InvalidDataException("El CSV no contiene muestras válidas.");
        var laps = new List<LapData>();
        var warnings = new List<string>(csv.Warnings);
        var markers = csv.Markers.Where(double.IsFinite).Order().ToArray();
        var startTime = csv.Samples[0].Time;
        var endTime = csv.Samples[^1].Time;
        if (markers.Any(marker => marker < startTime || marker > endTime + 0.1))
        {
            warnings.Add("Hay marcadores fuera del intervalo cubierto por las muestras.");
        }

        var usableMarkers = markers.Where(marker => marker >= startTime && marker <= endTime + 0.05).ToArray();
        var previous = startTime;
        for (var index = 0; index < usableMarkers.Length; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var marker = usableMarkers[index];
            var candidate = BuildLap(csv.Samples, laps.Count + 1, previous, marker);
            if (candidate is not null) laps.Add(candidate);
            previous = marker;
        }

        // Compare full laps around the stable pace of the session; this leaves the launch lap,
        // unusually slow warm-up laps, and the final in-lap out of the lap comparison set.
        var stableCandidates = laps.Where(lap => lap.Summary.LapTimeSeconds is >= 25 and <= 60 &&
                                                  lap.Summary.DistanceMeters is >= 500 and <= 1500 &&
                                                  lap.Summary.AverageSpeedKph >= 30 && lap.Summary.SampleCount >= 400)
            .ToArray();
        var stableTimes = stableCandidates.Select(lap => lap.Summary.LapTimeSeconds).Order().ToArray();
        var stableMedian = stableTimes.Length == 0 ? 0 : stableTimes[stableTimes.Length / 2];
        for (var index = 0; index < laps.Count; index++)
        {
            var candidate = laps[index];
            var inStableWindow = stableMedian > 0 && candidate.Summary.LapTimeSeconds is >= 25 and <= 60 &&
                                 candidate.Summary.DistanceMeters is >= 500 and <= 1500 &&
                                 candidate.Summary.AverageSpeedKph >= 30 && candidate.Summary.SampleCount >= 400 &&
                                 Math.Abs(candidate.Summary.LapTimeSeconds - stableMedian) <= stableMedian * 0.05;
            var quality = inStableWindow ? "Vuelta comparable" : candidate.Summary.LapTimeSeconds > 60
                ? "Vuelta inicial / salida" : candidate.Summary.AverageSpeedKph < 30
                    ? "Vuelta de entrada/parada" : "Ritmo fuera de la ventana estable";
            laps[index] = candidate with { Summary = candidate.Summary with { IsComparable = inStableWindow, Quality = quality } };
        }

        var comparableLaps = laps.Where(lap => lap.Summary.IsComparable).ToArray();
        if (comparableLaps.Length == 0) warnings.Add("No hay vueltas que cumplan los filtros de calidad para comparar.");
        if (laps.Count > 0 && !laps[^1].Summary.IsComparable && laps[^1].Summary.AverageSpeedKph < 30)
            warnings.Add("El último segmento del beacon termina lento y se excluye de las comparaciones como posible vuelta de entrada/parada.");
        if (csv.Samples.Count(sample => sample.GpsAccuracy >= 0.1) > 0)
            warnings.Add("Algunas muestras GPS tienen precisión reportada de 100 mm o peor; la trazada se conserva, pero se marca la calidad por punto.");

        ValidateLapSpeedDistance(laps, warnings);
        var first = csv.Samples[0];
        var last = csv.Samples[^1];
        var vehicle = ReadMetadata(csv.Metadata, "Vehicle");
        var details = new KartingSessionDetails(
            ToKey(Path.GetRelativePath(Path.GetDirectoryName(Path.GetDirectoryName(path))!, path)),
            ReadMetadata(csv.Metadata, "Session") ?? "Karting",
            string.IsNullOrWhiteSpace(vehicle) || vehicle.Equals("None", StringComparison.OrdinalIgnoreCase) ? "No indicado" : vehicle,
            ReadMetadata(csv.Metadata, "Racer") ?? "No indicado",
            ReadMetadata(csv.Metadata, "Date") ?? "No indicada",
            ReadMetadata(csv.Metadata, "Time") ?? "No indicado",
            (int)Math.Round(ParseMetadataNumber(csv.Metadata, "Sample Rate")),
            csv.Samples.Count,
            last.Time - first.Time,
            csv.Samples.Max(sample => sample.SpeedKph),
            csv.Samples.Max(sample => sample.Rpm),
            first.WaterTemperature,
            last.WaterTemperature,
            csv.Markers.Count,
            laps.Count,
            comparableLaps.Length > 0 ? comparableLaps.Min(lap => lap.Summary.LapTimeSeconds) : null,
            laps.Select(lap => lap.Summary).ToArray(),
            Downsample(csv.Samples, 1600),
            warnings.Distinct(StringComparer.Ordinal).ToArray());
        return new Analysis(details, laps);
    }

    private static LapData? BuildLap(IReadOnlyList<RawSample> samples, int number, double start, double end)
    {
        if (end <= start) return null;
        var portion = samples.Where(sample => sample.Time >= start && sample.Time < end).ToArray();
        if (portion.Length < 2) return null;
        var travelled = new double[portion.Length];
        for (var index = 1; index < portion.Length; index++)
        {
            var previous = portion[index - 1];
            var current = portion[index];
            var deltaTime = current.Time - previous.Time;
            var deltaDistance = HaversineMeters(previous.Latitude, previous.Longitude, current.Latitude, current.Longitude);
            var speedDistance = ((previous.SpeedKph + current.SpeedKph) / 2d / 3.6d) * deltaTime;
            var gpsQuality = previous.GpsAccuracy < 0.1 && current.GpsAccuracy < 0.1 && previous.Satellites >= 6 && current.Satellites >= 6;
            travelled[index] = travelled[index - 1] + (deltaTime is > 0 and <= 0.2 && deltaDistance <= 15 && gpsQuality ? deltaDistance : speedDistance);
        }

        var distance = travelled[^1];
        if (!double.IsFinite(distance) || distance <= 0) return null;
        var samplesByDistance = new List<KartingTelemetrySample>(Math.Min(portion.Length, 801));
        var previousRelative = -1d;
        for (var index = 0; index < portion.Length; index++)
        {
            var relative = travelled[index] / distance;
            if (relative - previousRelative < 1d / 800 && index != portion.Length - 1) continue;
            var sample = portion[index];
            samplesByDistance.Add(ToSample(sample, relative, sample.Time - start));
            previousRelative = relative;
        }

        var lapTime = end - start;
        var gearOne = portion.Count(sample => sample.Gear == 1);
        var gearTwo = portion.Count(sample => sample.Gear == 2);
        var summary = new KartingLapSummary(number, start, lapTime, distance,
            portion.Average(sample => sample.SpeedKph), portion.Max(sample => sample.SpeedKph), portion.Max(sample => sample.Rpm),
            portion.Average(sample => sample.WaterTemperature), gearOne, gearTwo, portion.Length, false, "Pendiente de clasificación");
        return new LapData(summary, samplesByDistance);
    }

    private static KartingTelemetrySample Interpolate(IReadOnlyList<KartingTelemetrySample> samples, double relative)
    {
        var right = 1;
        while (right < samples.Count - 1 && samples[right].RelativeDistance < relative) right++;
        var left = Math.Max(0, right - 1);
        var first = samples[left];
        var second = samples[right];
        var span = second.RelativeDistance - first.RelativeDistance;
        var factor = span <= 0 ? 0 : Math.Clamp((relative - first.RelativeDistance) / span, 0, 1);
        double Lerp(double a, double b) => a + ((b - a) * factor);
        return new KartingTelemetrySample(relative, Lerp(first.ElapsedSeconds, second.ElapsedSeconds),
            Lerp(first.SpeedKph, second.SpeedKph), Lerp(first.Rpm, second.Rpm),
            factor < 0.5 ? first.Gear : second.Gear, Lerp(first.LateralG, second.LateralG),
            Lerp(first.LongitudinalG, second.LongitudinalG), Lerp(first.WaterTemperatureCelsius, second.WaterTemperatureCelsius),
            Lerp(first.Latitude, second.Latitude), Lerp(first.Longitude, second.Longitude), Lerp(first.GpsAccuracyMeters, second.GpsAccuracyMeters));
    }

    private static KartingTelemetrySample ToSample(RawSample sample, double relative, double elapsed) =>
        new(relative, elapsed, sample.SpeedKph, sample.Rpm, sample.Gear, sample.LateralG,
            sample.LongitudinalG, sample.WaterTemperature, sample.Latitude, sample.Longitude, sample.GpsAccuracy);

    private static IReadOnlyList<KartingTrackPoint> Downsample(IReadOnlyList<RawSample> samples, int limit)
    {
        var stride = Math.Max(1, (int)Math.Ceiling((double)samples.Count / limit));
        return samples.Select((sample, index) => (sample, index))
            .Where(item => item.index % stride == 0 || item.index == samples.Count - 1)
            .Select(item => new KartingTrackPoint(item.sample.Latitude, item.sample.Longitude, item.sample.SpeedKph,
                (double)item.index / Math.Max(samples.Count - 1, 1)))
            .ToArray();
    }

    private static void ValidateTime(IReadOnlyList<RawSample> samples, double sampleRate, ICollection<string> warnings)
    {
        if (samples.Count < 2) { warnings.Add("Hay menos de dos muestras válidas."); return; }
        var deltas = samples.Zip(samples.Skip(1), (first, second) => second.Time - first.Time).ToArray();
        if (deltas.Any(delta => delta <= 0)) warnings.Add("El canal Time no es estrictamente creciente.");
        var expected = sampleRate > 0 ? 1d / sampleRate : 0.05;
        var bad = deltas.Count(delta => Math.Abs(delta - expected) > Math.Max(0.01, expected * 0.25));
        if (bad > 0) warnings.Add($"Hay {bad} intervalos de muestreo atípicos respecto a {sampleRate:0.##} Hz.");
    }

    private static void ValidateGear(IReadOnlyList<RawSample> samples, ICollection<string> warnings)
    {
        if (samples.Any(sample => sample.Gear == 0)) warnings.Add("El estado de marcha 0 se conserva como no engranada/parada; las marchas 1 y 2 se cuentan por separado.");
    }

    private static void ValidateMarkerTimes(IReadOnlyDictionary<string, string[]> metadata, IReadOnlyList<double> markers, ICollection<string> warnings)
    {
        var exported = ParseMetadataList(metadata, "Segment Times");
        if (markers.Count == 0) return;
        if (exported.Count == 0)
        {
            warnings.Add("Segment Times no se pudo interpretar como una lista de duraciones.");
            return;
        }
        // The AiM export's first Segment Time is the elapsed time to the first beacon,
        // while the first marker delta is measured from session time zero.
        var computed = markers.Select((marker, index) => marker - (index == 0 ? 0 : markers[index - 1])).ToArray();
        if (computed.Length != exported.Count)
            warnings.Add("Beacon Markers y Segment Times contienen distinto número de segmentos.");
        else if (computed.Zip(exported, (first, second) => Math.Abs(first - second)).All(delta => delta <= 0.02))
            warnings.Add("Validación AiM: Segment Times y las diferencias entre Beacon Markers concuerdan dentro de 0,02 s.");
        else
            warnings.Add("Segment Times no coincide con las diferencias entre Beacon Markers dentro de 0,02 s.");
    }

    private static void ValidateMarkerPositions(IReadOnlyList<RawSample> samples, IReadOnlyList<double> markers, ICollection<string> warnings)
    {
        // The first marker follows a long launch/out-lap, and terminal markers may belong
        // to pit/return movement. Use only crossings in the central stable-time cluster.
        var intervals = markers.Select((marker, index) => marker - (index == 0 ? 0 : markers[index - 1]))
            .Where(interval => interval is >= 25 and <= 60).ToArray();
        if (intervals.Length == 0) return;
        var medianInterval = intervals.Order().ElementAt(intervals.Length / 2);
        var crossings = markers.Select((marker, index) => (Sample: samples.MinBy(sample => Math.Abs(sample.Time - marker)),
                Duration: marker - (index == 0 ? 0 : markers[index - 1])))
            .Where(item => item.Sample is not null && item.Duration is >= 25 and <= 60 && Math.Abs(item.Duration - medianInterval) <= medianInterval * 0.05)
            .Select(item => item.Sample!).Where(sample => sample.GpsAccuracy < 0.1 && sample.Satellites >= 6).ToArray();
        if (crossings.Length < 3) return;
        var latitude = crossings.Average(sample => sample.Latitude);
        var longitude = crossings.Average(sample => sample.Longitude);
        var maxDeviation = crossings.Max(sample => HaversineMeters(latitude, longitude, sample.Latitude, sample.Longitude));
        if (maxDeviation <= 5)
            warnings.Add($"Validación GPS: {crossings.Length} marcadores medidos se agrupan en el cruce (radio máximo {maxDeviation:0.0} m).");
        else
            warnings.Add($"La posición GPS en los marcadores tiene una dispersión de hasta {maxDeviation:0.0} m; comprobar línea del beacon o calidad GPS.");
    }

    private static void ValidateLapSpeedDistance(IReadOnlyList<LapData> laps, ICollection<string> warnings)
    {
        var candidate = laps.Where(lap => lap.Summary.LapTimeSeconds is >= 25 and <= 60 && lap.Summary.AverageSpeedKph >= 30).ToArray();
        if (candidate.Length == 0) return;
        var relativeErrors = candidate.Select(lap =>
        {
            var distanceFromSpeed = lap.Summary.AverageSpeedKph / 3.6 * lap.Summary.LapTimeSeconds;
            return Math.Abs(lap.Summary.DistanceMeters - distanceFromSpeed) / Math.Max(distanceFromSpeed, 1);
        }).ToArray();
        var medianError = relativeErrors.Order().ElementAt(relativeErrors.Length / 2);
        if (medianError <= 0.1)
            warnings.Add($"Validación de distancia: GPS y velocidad×tiempo difieren una mediana del {medianError:P1} en vueltas rápidas.");
        else
            warnings.Add($"La distancia GPS y velocidad×tiempo difieren una mediana del {medianError:P1}; interpretar distancias y trazada con cautela.");
    }

    private static IReadOnlyList<string> ParseCsvLine(string line)
    {
        var fields = new List<string>();
        var value = new System.Text.StringBuilder();
        var quoted = false;
        for (var index = 0; index < line.Length; index++)
        {
            var character = line[index];
            if (character == '"')
            {
                if (quoted && index + 1 < line.Length && line[index + 1] == '"') { value.Append('"'); index++; }
                else quoted = !quoted;
            }
            else if (character == ',' && !quoted) { fields.Add(value.ToString()); value.Clear(); }
            else value.Append(character);
        }
        fields.Add(value.ToString());
        return fields;
    }

    private static IReadOnlyList<double> ParseMetadataList(IReadOnlyDictionary<string, string[]> metadata, string key)
    {
        if (!metadata.TryGetValue(key, out var values)) return Array.Empty<double>();
        var result = new List<double>();
        foreach (var value in values)
        {
            if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) && double.IsFinite(seconds))
            {
                result.Add(seconds);
                continue;
            }

            var parts = value.Split(':');
            if (parts.Length == 2 && double.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var minutes) &&
                double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var remainder))
                result.Add(minutes * 60 + remainder);
        }
        return result;
    }

    private static double ParseMetadataNumber(IReadOnlyDictionary<string, string[]> metadata, string key) =>
        metadata.TryGetValue(key, out var values) && values.Length > 0 &&
        double.TryParse(values[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) ? value : 0;

    private static string? ReadMetadata(IReadOnlyDictionary<string, string[]> metadata, string key) =>
        metadata.TryGetValue(key, out var values) && values.Length > 0 ? values[0] : null;

    private static double HaversineMeters(double latitude1, double longitude1, double latitude2, double longitude2)
    {
        const double earthRadius = 6_371_000;
        var latitudeDelta = DegreesToRadians(latitude2 - latitude1);
        var longitudeDelta = DegreesToRadians(longitude2 - longitude1);
        var value = Math.Pow(Math.Sin(latitudeDelta / 2), 2) + Math.Cos(DegreesToRadians(latitude1)) *
                    Math.Cos(DegreesToRadians(latitude2)) * Math.Pow(Math.Sin(longitudeDelta / 2), 2);
        return earthRadius * 2 * Math.Asin(Math.Sqrt(Math.Clamp(value, 0, 1)));
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180;

    private string? ResolveSessionPath(string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || sessionId.Contains('/') || sessionId.Contains('\\')) return null;
        if (!Directory.Exists(_kartingRoot)) return null;
        return Directory.EnumerateFiles(_kartingRoot, "*.csv", SearchOption.AllDirectories)
            .Where(path => !IsExcludedSession(path))
            .FirstOrDefault(path => ToKey(Path.GetRelativePath(_kartingRoot, path)).Equals(sessionId, StringComparison.OrdinalIgnoreCase));
    }

    private static string ResolveKartingRoot(string dataRoot)
    {
        if (Path.GetFileName(dataRoot).Equals("Karting", StringComparison.OrdinalIgnoreCase)) return dataRoot;
        return Path.Combine(dataRoot, "Karting");
    }

    private static bool IsExcludedSession(string path) =>
        string.Equals(Path.GetFileName(Path.GetDirectoryName(path)), "Albaida", StringComparison.OrdinalIgnoreCase) &&
        Path.GetFileName(path).Equals("7.csv", StringComparison.OrdinalIgnoreCase);

    private static string ToKey(string value) =>
        string.Join('-', new string(value.ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-').ToArray())
            .Split('-', StringSplitOptions.RemoveEmptyEntries));

    private sealed record CsvSession(Dictionary<string, string[]> Metadata, string[] Headers, string[] Units,
        List<RawSample> Samples, IReadOnlyList<double> Markers, List<string> Warnings);
    private sealed record RawSample(double Time, double SpeedKph, double Latitude, double Longitude, double GpsAccuracy,
        double Satellites, double SpeedAccuracy, double Rpm, int Gear, double WaterTemperature, double LateralG, double LongitudinalG);
    private sealed record LapData(KartingLapSummary Summary, IReadOnlyList<KartingTelemetrySample> Samples);
    private sealed record Analysis(KartingSessionDetails Details, IReadOnlyList<LapData> Laps);
}
