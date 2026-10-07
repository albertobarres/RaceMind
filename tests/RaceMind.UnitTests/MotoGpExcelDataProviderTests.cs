using System.IO.Compression;
using System.Text;
using RaceMind.Infrastructure;

namespace RaceMind.UnitTests;

public sealed class MotoGpExcelDataProviderTests
{
    [Fact]
    public async Task Provider_ReadsSessionClassificationAndLapRowsFromWorkbookSheets()
    {
        var root = Path.Combine(Path.GetTempPath(), $"racemind-motogp-{Guid.NewGuid():N}");
        var yearRoot = Path.Combine(root, "Motos", "MotoGP", "2026");
        Directory.CreateDirectory(yearRoot);
        var workbookPath = Path.Combine(yearRoot, "MotoGP_2026_TST_motogp_full.xlsx");
        CreateWorkbook(workbookPath);

        try
        {
            var provider = new MotoGpExcelDataProvider(root);
            var events = await provider.GetEventsAsync(2026, CancellationToken.None);
            var eventSummary = Assert.Single(events);
            Assert.Equal("TST", eventSummary.EventCode);
            Assert.Contains("Test Grand Prix", eventSummary.GrandPrix);
            var session = Assert.Single(eventSummary.Sessions);
            Assert.Equal("FP1", session.SessionCode);
            Assert.Equal(1, session.ResultCount);
            Assert.Equal(1, session.LapRecordCount);

            var details = await provider.GetSessionDetailsAsync(2026, "TST", "FP1", CancellationToken.None);
            Assert.NotNull(details);
            Assert.Equal("Jerez test", details.Circuit);
            var result = Assert.Single(details.Results);
            Assert.Equal("Test Rider", result.Rider);
            Assert.Equal(123, result.RiderNumber);
            Assert.Equal(321.5, result.TopSpeedKph);

            var records = await provider.GetLapRecordsAsync(2026, "TST", "FP1", "Test Rider", CancellationToken.None);
            var lap = Assert.Single(records!);
            Assert.Equal(1, lap.LapNumber);
            Assert.Equal("01:40.000", lap.LapTime);
            Assert.Equal("31.000", lap.Sector1);
            Assert.Equal("Slick-Soft", lap.FrontTyre);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static void CreateWorkbook(string path)
    {
        using var archive = ZipFile.Open(path, ZipArchiveMode.Create);
        WriteEntry(archive, "xl/workbook.xml", """
            <?xml version="1.0" encoding="UTF-8"?>
            <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FP1 Results" sheetId="1" r:id="rId1"/><sheet name="FP1 Laps" sheetId="2" r:id="rId2"/></sheets></workbook>
            """);
        WriteEntry(archive, "xl/_rels/workbook.xml.rels", """
            <?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>
            """);
        WriteEntry(archive, "xl/sharedStrings.xml", """
            <?xml version="1.0" encoding="UTF-8"?>
            <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>Test Grand Prix - MotoGP Free Practice 1</t></si></sst>
            """);
        WriteEntry(archive, "xl/worksheets/sheet1.xml", """
            <?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c></row>
            <row r="2"><c r="A2" t="inlineStr"><is><t>Jerez test | 2026-04-24 | Clear</t></is></c></row>
            <row r="4"><c r="A4" t="inlineStr"><is><t>Pos</t></is></c><c r="B4" t="inlineStr"><is><t>#</t></is></c><c r="C4" t="inlineStr"><is><t>Rider</t></is></c><c r="D4" t="inlineStr"><is><t>Team</t></is></c><c r="E4" t="inlineStr"><is><t>Bike</t></is></c><c r="F4" t="inlineStr"><is><t>Laps</t></is></c><c r="G4" t="inlineStr"><is><t>Time</t></is></c><c r="H4" t="inlineStr"><is><t>Gap</t></is></c><c r="I4" t="inlineStr"><is><t>Best Lap</t></is></c><c r="J4" t="inlineStr"><is><t>Top Speed</t></is></c><c r="K4" t="inlineStr"><is><t>Points</t></is></c><c r="L4" t="inlineStr"><is><t>Status</t></is></c></row>
            <row r="5"><c r="A5"><v>1</v></c><c r="B5"><v>123</v></c><c r="C5" t="inlineStr"><is><t>Test Rider</t></is></c><c r="D5" t="inlineStr"><is><t>Test Team</t></is></c><c r="E5" t="inlineStr"><is><t>Prototype</t></is></c><c r="F5"><v>2</v></c><c r="G5" t="inlineStr"><is><t>03:20.000</t></is></c><c r="H5" t="inlineStr"><is><t>0.000</t></is></c><c r="I5" t="inlineStr"><is><t>01:40.000</t></is></c><c r="J5"><v>321.5</v></c><c r="L5" t="inlineStr"><is><t>OK</t></is></c></row>
            </sheetData></worksheet>
            """);
        WriteEntry(archive, "xl/worksheets/sheet2.xml", """
            <?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
            <row r="1"><c r="A1" t="inlineStr"><is><t>FP1 lap analysis</t></is></c></row>
            <row r="2"><c r="A2" t="inlineStr"><is><t>Jerez test</t></is></c></row>
            <row r="4"><c r="A4" t="inlineStr"><is><t>Rider</t></is></c><c r="B4" t="inlineStr"><is><t>#</t></is></c><c r="C4" t="inlineStr"><is><t>Pos</t></is></c><c r="D4" t="inlineStr"><is><t>Lap</t></is></c><c r="E4" t="inlineStr"><is><t>Lap Time</t></is></c><c r="F4" t="inlineStr"><is><t>T1</t></is></c><c r="G4" t="inlineStr"><is><t>T2</t></is></c><c r="H4" t="inlineStr"><is><t>T3</t></is></c><c r="I4" t="inlineStr"><is><t>T4</t></is></c><c r="J4" t="inlineStr"><is><t>Speed (km/h)</t></is></c><c r="K4" t="inlineStr"><is><t>Pit</t></is></c><c r="L4" t="inlineStr"><is><t>Run</t></is></c><c r="M4" t="inlineStr"><is><t>Front Tyre</t></is></c><c r="N4" t="inlineStr"><is><t>Rear Tyre</t></is></c></row>
            <row r="5"><c r="A5" t="inlineStr"><is><t>Test Rider</t></is></c><c r="B5"><v>123</v></c><c r="C5"><v>1</v></c><c r="D5"><v>1</v></c><c r="E5" t="inlineStr"><is><t>01:40.000</t></is></c><c r="F5" t="inlineStr"><is><t>31.000</t></is></c><c r="G5" t="inlineStr"><is><t>20.000</t></is></c><c r="H5" t="inlineStr"><is><t>24.000</t></is></c><c r="I5" t="inlineStr"><is><t>25.000</t></is></c><c r="J5"><v>321.5</v></c><c r="K5"><v>1</v></c><c r="L5" t="inlineStr"><is><t>1</t></is></c><c r="M5" t="inlineStr"><is><t>Slick-Soft</t></is></c><c r="N5" t="inlineStr"><is><t>Slick-Medium</t></is></c></row>
            </sheetData></worksheet>
            """);
    }

    private static void WriteEntry(ZipArchive archive, string name, string content)
    {
        var entry = archive.CreateEntry(name);
        using var stream = entry.Open();
        using var writer = new StreamWriter(stream, new UTF8Encoding(false));
        writer.Write(content);
    }
}
