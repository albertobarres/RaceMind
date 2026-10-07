using System.Globalization;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using RaceMind.Application;

namespace RaceMind.Infrastructure;

public sealed partial class MotoGpExcelDataProvider(string dataRoot) : IMotoGpDataProvider
{
    private readonly string _motoGpRoot = ResolveMotoGpRoot(Path.GetFullPath(dataRoot));
    private readonly Dictionary<int, IReadOnlyList<EventFile>> _eventsByYear = [];

    public Task<IReadOnlyList<MotoGpEventSummary>> GetEventsAsync(int year, CancellationToken cancellationToken)
    {
        var events = GetEventFiles(year)
            .Select(eventFile => new MotoGpEventSummary(eventFile.EventCode, year, eventFile.EventCode, eventFile.Name, eventFile.Sessions))
            .ToArray();

        return Task.FromResult<IReadOnlyList<MotoGpEventSummary>>(events);
    }

    public Task<MotoGpSessionDetails?> GetSessionDetailsAsync(int year, string eventCode, string sessionCode, CancellationToken cancellationToken)
    {
        var eventFile = FindEvent(year, eventCode);
        if (eventFile is null || !eventFile.SessionCodes.Contains(sessionCode, StringComparer.OrdinalIgnoreCase))
        {
            return Task.FromResult<MotoGpSessionDetails?>(null);
        }

        var workbook = MotoGpWorkbook.ReadSheets(eventFile.Path, [$"{sessionCode} Results"]);
        var summary = eventFile.Sessions.FirstOrDefault(session => session.SessionCode.Equals(sessionCode, StringComparison.OrdinalIgnoreCase));
        if (summary is null)
        {
            return Task.FromResult<MotoGpSessionDetails?>(null);
        }
        var results = ReadResults(workbook.GetSheet(sessionCode, "Results"));
        var resultSheet = workbook.GetSheet(sessionCode, "Results");
        var title = resultSheet.Title;
        var circuit = ExtractCircuit(resultSheet.Subtitle);
        return Task.FromResult<MotoGpSessionDetails?>(new MotoGpSessionDetails(summary, circuit, title, results));
    }

    public Task<IReadOnlyList<MotoGpLapRecord>?> GetLapRecordsAsync(int year, string eventCode, string sessionCode, string? rider, CancellationToken cancellationToken)
    {
        var eventFile = FindEvent(year, eventCode);
        if (eventFile is null || !eventFile.SessionCodes.Contains(sessionCode, StringComparer.OrdinalIgnoreCase))
        {
            return Task.FromResult<IReadOnlyList<MotoGpLapRecord>?>(null);
        }

        var workbook = MotoGpWorkbook.ReadSheets(eventFile.Path, [$"{sessionCode} Laps"]);
        var records = ReadLapRecords(workbook.GetSheet(sessionCode, "Laps"));
        if (!string.IsNullOrWhiteSpace(rider))
        {
            records = records.Where(record =>
                string.Equals(record.Rider, rider, StringComparison.OrdinalIgnoreCase) ||
                record.RiderNumber.ToString(CultureInfo.InvariantCulture) == rider).ToArray();
        }

        return Task.FromResult<IReadOnlyList<MotoGpLapRecord>?>(records);
    }

    private IReadOnlyList<EventFile> GetEventFiles(int year)
    {
        if (_eventsByYear.TryGetValue(year, out var cached))
        {
            return cached;
        }

        var yearDirectory = Path.Combine(_motoGpRoot, year.ToString(CultureInfo.InvariantCulture));
        if (!Directory.Exists(yearDirectory))
        {
            _eventsByYear[year] = Array.Empty<EventFile>();
            return _eventsByYear[year];
        }

        var events = new List<EventFile>();
        foreach (var path in Directory.EnumerateFiles(yearDirectory, "*.xlsx"))
        {
            var sheetNames = MotoGpWorkbook.ReadSheetNames(path);
            var sessionCodes = sheetNames
                .Where(name => name.EndsWith(" Results", StringComparison.OrdinalIgnoreCase))
                .Select(name => name[..^" Results".Length])
                .OrderBy(SessionOrder)
                .ThenBy(code => code, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            if (sessionCodes.Length == 0)
            {
                continue;
            }

            var firstSession = sessionCodes[0];
            var firstResultsSheet = MotoGpWorkbook.ReadSheets(path, [$"{firstSession} Results"])
                .GetSheet(firstSession, "Results");
            var name = ExtractEventName(firstResultsSheet.Title, year, Path.GetFileNameWithoutExtension(path));
            var eventCode = ExtractEventCode(Path.GetFileName(path), year);
            var sessions = sessionCodes.Select(code => BuildSessionSummary(path, eventCode, name, code)).ToArray();
            events.Add(new EventFile(eventCode, name, path, sessionCodes, sessions));
        }

        _eventsByYear[year] = events.OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase).ToArray();
        return _eventsByYear[year];
    }

    private EventFile? FindEvent(int year, string eventCode) =>
        GetEventFiles(year).FirstOrDefault(item => string.Equals(item.EventCode, eventCode, StringComparison.OrdinalIgnoreCase));

    private static MotoGpSessionSummary BuildSessionSummary(string path, string eventCode, string eventName, string sessionCode)
    {
        var workbook = MotoGpWorkbook.ReadSheets(path, [$"{sessionCode} Results"]);
        var resultsSheet = workbook.GetSheet(sessionCode, "Results");
        var results = ReadResults(resultsSheet);
        var date = ExtractDate(resultsSheet.Subtitle);
        var weather = ExtractWeather(resultsSheet.Subtitle);
        var lapCount = Math.Max(0, FindLapCount(path, sessionCode));

        return new MotoGpSessionSummary(
            $"{eventCode}/{sessionCode}",
            eventCode,
            eventName,
            sessionCode,
            FormatSessionName(sessionCode),
            date,
            weather,
            results.Count,
            lapCount);
    }

    private static int FindLapCount(string path, string sessionCode)
    {
        var workbook = MotoGpWorkbook.ReadSheets(path, [$"{sessionCode} Laps"]);
        var rows = workbook.GetSheet(sessionCode, "Laps").Rows;
        return Math.Max(0, rows.Count - 4);
    }

    private static IReadOnlyList<MotoGpRiderResult> ReadResults(MotoGpSheet sheet)
    {
        if (sheet.Rows.Count < 4)
        {
            return Array.Empty<MotoGpRiderResult>();
        }

        var columns = BuildColumnMap(sheet.Rows[3]);
        return sheet.Rows.Skip(4)
            .Where(row => !string.IsNullOrWhiteSpace(ReadCell(row, columns, "Rider")))
            .Select(row => new MotoGpRiderResult(
                ReadInt(row, columns, "Pos") ?? 0,
                ReadInt(row, columns, "#") ?? 0,
                ReadCell(row, columns, "Rider") ?? "Unknown rider",
                ReadCell(row, columns, "Team") ?? string.Empty,
                ReadCell(row, columns, "Bike") ?? string.Empty,
                ReadInt(row, columns, "Laps"),
                ReadCell(row, columns, "Time"),
                ReadCell(row, columns, "Gap"),
                ReadCell(row, columns, "Best Lap"),
                ReadDouble(row, columns, "Top Speed"),
                ReadCell(row, columns, "Status")))
            .OrderBy(result => result.Position)
            .ToArray();
    }

    private static IReadOnlyList<MotoGpLapRecord> ReadLapRecords(MotoGpSheet sheet)
    {
        if (sheet.Rows.Count < 4)
        {
            return Array.Empty<MotoGpLapRecord>();
        }

        var columns = BuildColumnMap(sheet.Rows[3]);
        return sheet.Rows.Skip(4)
            .Where(row => ReadInt(row, columns, "Lap").HasValue)
            .Select(row => new MotoGpLapRecord(
                ReadCell(row, columns, "Rider") ?? "Unknown rider",
                ReadInt(row, columns, "#") ?? 0,
                ReadInt(row, columns, "Pos") ?? 0,
                ReadInt(row, columns, "Lap") ?? 0,
                ReadCell(row, columns, "Lap Time"),
                ReadCell(row, columns, "T1"),
                ReadCell(row, columns, "T2"),
                ReadCell(row, columns, "T3"),
                ReadCell(row, columns, "T4"),
                ReadDouble(row, columns, "Speed (km/h)"),
                ReadInt(row, columns, "Pit"),
                ReadCell(row, columns, "Run"),
                ReadCell(row, columns, "Front Tyre"),
                ReadCell(row, columns, "Rear Tyre")))
            .ToArray();
    }

    private static Dictionary<string, int> BuildColumnMap(IReadOnlyList<string> headers) =>
        headers.Select((header, index) => (header, index))
            .Where(item => !string.IsNullOrWhiteSpace(item.header))
            .ToDictionary(item => item.header.Trim(), item => item.index, StringComparer.OrdinalIgnoreCase);

    private static string? ReadCell(IReadOnlyList<string> row, IReadOnlyDictionary<string, int> columns, string name) =>
        columns.TryGetValue(name, out var index) && index < row.Count ? NullIfEmpty(row[index]) : null;

    private static int? ReadInt(IReadOnlyList<string> row, IReadOnlyDictionary<string, int> columns, string name) =>
        int.TryParse(ReadCell(row, columns, name), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : null;

    private static double? ReadDouble(IReadOnlyList<string> row, IReadOnlyDictionary<string, int> columns, string name) =>
        double.TryParse(ReadCell(row, columns, name), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : null;

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string ExtractEventCode(string filename, int year)
    {
        var prefix = $"MotoGP_{year}_";
        var remaining = Path.GetFileNameWithoutExtension(filename);
        if (remaining.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            remaining = remaining[prefix.Length..];
        }

        var separator = remaining.IndexOf('_');
        return separator < 0 ? remaining : remaining[..separator];
    }

    private static string ExtractEventName(string? title, int year, string filename)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return ExtractEventCode($"{filename}.xlsx", year);
        }

        var marker = title.IndexOf(" - MotoGPT", StringComparison.OrdinalIgnoreCase);
        if (marker < 0) marker = title.IndexOf(" - MotoGP", StringComparison.OrdinalIgnoreCase);
        var name = marker >= 0 ? title[..marker] : title;
        return name.Trim();
    }

    private static string? ExtractDate(string? subtitle)
    {
        if (string.IsNullOrWhiteSpace(subtitle)) return null;
        var match = DatePattern().Match(subtitle);
        return match.Success ? match.Value : null;
    }

    private static string? ExtractWeather(string? subtitle)
    {
        if (string.IsNullOrWhiteSpace(subtitle)) return null;
        var parts = subtitle.Split('|', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 2 ? parts[2] : null;
    }

    private static string? ExtractCircuit(string? subtitle)
    {
        if (string.IsNullOrWhiteSpace(subtitle)) return null;
        return subtitle.Split('|', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
    }

    private static int SessionOrder(string code) => code switch
    {
        "FP1" => 1,
        "PR" => 2,
        "FP2" => 3,
        "FP3" => 4,
        "Q1" => 5,
        "Q2" => 6,
        "SPR" => 7,
        "WUP" => 8,
        "RAC" => 9,
        _ => 100
    };

    private static string FormatSessionName(string code) => code switch
    {
        "FP1" => "Free Practice 1",
        "FP2" => "Free Practice 2",
        "FP3" => "Free Practice 3",
        "PR" => "Practice",
        "Q1" => "Qualifying 1",
        "Q2" => "Qualifying 2",
        "SPR" => "Sprint",
        "WUP" => "Warm Up",
        "RAC" => "Race",
        _ => code
    };

    private static string ResolveMotoGpRoot(string root)
    {
        if (Path.GetFileName(root).Equals("MotoGP", StringComparison.OrdinalIgnoreCase)) return root;
        var nested = Path.Combine(root, "Motos", "MotoGP");
        if (Directory.Exists(nested)) return nested;
        nested = Path.Combine(root, "MotoGP");
        return Directory.Exists(nested) ? nested : root;
    }

    private static string GetCellReference(int index)
    {
        var result = string.Empty;
        var value = index + 1;
        while (value > 0)
        {
            var remainder = (value - 1) % 26;
            result = (char)('A' + remainder) + result;
            value = (value - 1) / 26;
        }
        return result;
    }

    [GeneratedRegex(@"\d{4}-\d{2}-\d{2}", RegexOptions.CultureInvariant)]
    private static partial Regex DatePattern();

    private sealed record EventFile(string EventCode, string Name, string Path, IReadOnlyList<string> SessionCodes, IReadOnlyList<MotoGpSessionSummary> Sessions);

    private sealed class MotoGpWorkbook
    {
        private readonly Dictionary<string, MotoGpSheet> _sheets;

        private MotoGpWorkbook(Dictionary<string, MotoGpSheet> sheets) => _sheets = sheets;

        public IReadOnlyList<string> SheetNames => _sheets.Keys.ToArray();

        public MotoGpSheet GetSheet(string sessionCode, string kind) =>
            _sheets.TryGetValue($"{sessionCode} {kind}", out var sheet) ? sheet : MotoGpSheet.Empty;

        public static IReadOnlyList<string> ReadSheetNames(string path)
        {
            using var archive = ZipFile.OpenRead(path);
            var workbookDocument = LoadXml(archive, "xl/workbook.xml");
            var namespaceManager = CreateSpreadsheetNamespaceManager(new NameTable());
            return workbookDocument.Descendants(XName.Get("sheet", namespaceManager.LookupNamespace("s")!))
                .Select(element => (string?)element.Attribute("name"))
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name!)
                .ToArray();
        }

        public static MotoGpWorkbook Read(string path) => ReadSheets(path, null);

        public static MotoGpWorkbook ReadSheets(string path, IReadOnlyCollection<string>? requestedSheetNames)
        {
            using var archive = ZipFile.OpenRead(path);
            var workbookDocument = LoadXml(archive, "xl/workbook.xml");
            var relationshipsDocument = LoadXml(archive, "xl/_rels/workbook.xml.rels");
            var namespaceManager = CreateSpreadsheetNamespaceManager(new NameTable());
            var sharedStrings = ReadSharedStrings(archive, namespaceManager);
            var relationshipManager = CreatePackageNamespaceManager(new NameTable());
            var relationships = relationshipsDocument.Root!
                .Elements(XName.Get("Relationship", relationshipManager.LookupNamespace("pkg")!))
                .ToDictionary(element => (string?)element.Attribute("Id") ?? string.Empty,
                    element => (string?)element.Attribute("Target") ?? string.Empty,
                    StringComparer.Ordinal);

            var sheets = new Dictionary<string, MotoGpSheet>(StringComparer.OrdinalIgnoreCase);
            foreach (var sheetElement in workbookDocument.Descendants(XName.Get("sheet", namespaceManager.LookupNamespace("s")!)))
            {
                var name = (string?)sheetElement.Attribute("name");
                var relationId = (string?)sheetElement.Attribute(XName.Get("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"));
                if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(relationId) || !relationships.TryGetValue(relationId, out var target))
                {
                    continue;
                }
                if (requestedSheetNames is not null && !requestedSheetNames.Contains(name, StringComparer.OrdinalIgnoreCase))
                {
                    continue;
                }

                var entryPath = target.TrimStart('/');
                if (!entryPath.StartsWith("xl/", StringComparison.OrdinalIgnoreCase)) entryPath = $"xl/{entryPath}";
                var sheetDocument = LoadXml(archive, entryPath);
                sheets[name] = ReadSheet(sheetDocument, namespaceManager, name, sharedStrings);
            }

            return new MotoGpWorkbook(sheets);
        }

        private static IReadOnlyList<string> ReadSharedStrings(ZipArchive archive, XmlNamespaceManager namespaces)
        {
            var entry = archive.GetEntry("xl/sharedStrings.xml");
            if (entry is null)
            {
                return Array.Empty<string>();
            }

            using var stream = entry.Open();
            var document = XDocument.Load(stream);
            var spreadsheetNamespace = XNamespace.Get(namespaces.LookupNamespace("s")!);
            return document.Descendants(spreadsheetNamespace + "si")
                .Select(item => string.Concat(item.Descendants(spreadsheetNamespace + "t").Select(text => text.Value)))
                .ToArray();
        }

        private static MotoGpSheet ReadSheet(XDocument document, XmlNamespaceManager namespaces, string name, IReadOnlyList<string> sharedStrings)
        {
            var rows = new List<IReadOnlyList<string>>();
            var spreadsheetNamespace = XNamespace.Get(namespaces.LookupNamespace("s")!);
            foreach (var rowElement in document.Descendants(spreadsheetNamespace + "row"))
            {
                var rowNumber = (int?)rowElement.Attribute("r") ?? rows.Count + 1;
                while (rows.Count < rowNumber - 1)
                {
                    rows.Add(Array.Empty<string>());
                }

                var row = new List<string>();
                foreach (var cell in rowElement.Elements(spreadsheetNamespace + "c"))
                {
                    var reference = (string?)cell.Attribute("r") ?? string.Empty;
                    var column = GetColumnIndex(reference);
                    while (row.Count <= column) row.Add(string.Empty);
                    var inlineText = cell.Element(spreadsheetNamespace + "is")?.Descendants(spreadsheetNamespace + "t").FirstOrDefault()?.Value;
                    var value = inlineText ?? cell.Element(spreadsheetNamespace + "v")?.Value ?? string.Empty;
                    if (string.Equals((string?)cell.Attribute("t"), "s", StringComparison.OrdinalIgnoreCase) &&
                        int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var sharedStringIndex) &&
                        sharedStringIndex >= 0 && sharedStringIndex < sharedStrings.Count)
                    {
                        value = sharedStrings[sharedStringIndex];
                    }
                    row[column] = value;
                }
                if (rows.Count == rowNumber - 1)
                {
                    rows.Add(row);
                }
                else
                {
                    rows[rowNumber - 1] = row;
                }
            }

            var title = rows.Count > 0 ? NullIfEmpty(rows[0].FirstOrDefault()) : null;
            var subtitle = rows.Count > 1 ? NullIfEmpty(rows[1].FirstOrDefault()) : null;
            return new MotoGpSheet(name, title, subtitle, rows);
        }

        private static int GetColumnIndex(string reference)
        {
            var column = 0;
            foreach (var character in reference.TakeWhile(char.IsLetter))
            {
                column = (column * 26) + char.ToUpperInvariant(character) - 'A' + 1;
            }
            return Math.Max(0, column - 1);
        }

        private static XDocument LoadXml(ZipArchive archive, string path)
        {
            var entry = archive.GetEntry(path) ?? throw new InvalidDataException($"Worksheet package entry not found: {path}");
            using var stream = entry.Open();
            return XDocument.Load(stream);
        }

        private static XmlNamespaceManager CreateSpreadsheetNamespaceManager(XmlNameTable table)
        {
            var manager = new XmlNamespaceManager(table);
            manager.AddNamespace("s", "http://schemas.openxmlformats.org/spreadsheetml/2006/main");
            manager.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
            return manager;
        }

        private static XmlNamespaceManager CreatePackageNamespaceManager(XmlNameTable table)
        {
            var manager = new XmlNamespaceManager(table);
            manager.AddNamespace("pkg", "http://schemas.openxmlformats.org/package/2006/relationships");
            return manager;
        }
    }

    private sealed record MotoGpSheet(string Name, string? Title, string? Subtitle, IReadOnlyList<IReadOnlyList<string>> Rows)
    {
        public static MotoGpSheet Empty { get; } = new(string.Empty, null, null, Array.Empty<IReadOnlyList<string>>());
    }
}
