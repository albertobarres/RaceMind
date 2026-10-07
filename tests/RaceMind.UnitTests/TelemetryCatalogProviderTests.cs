using RaceMind.Infrastructure;

namespace RaceMind.UnitTests;

public sealed class TelemetryCatalogProviderTests
{
    [Fact]
    public async Task GetCatalogAsync_GroupsF1ByYearAndListsFutureSources()
    {
        var root = Path.Combine(Path.GetTempPath(), $"racemind-catalog-{Guid.NewGuid():N}");
        var f1Session = Path.Combine(root, "Coches", "F1", "2026", "Spanish Grand Prix", "Race");
        var worldSbk = Path.Combine(root, "Motos", "WorldSBK", "Kawasaki Ninja 400 SSP300");
        var assetto = Path.Combine(root, "Simuladores", "Assetto Corsa", "Silverstone 1967");
        var motogp = Path.Combine(root, "Motos", "MotoGP", "2026");
        Directory.CreateDirectory(f1Session);
        Directory.CreateDirectory(worldSbk);
        Directory.CreateDirectory(assetto);
        Directory.CreateDirectory(motogp);
        File.WriteAllText(Path.Combine(f1Session, "session_laptimes.json"), "{}");
        File.WriteAllText(Path.Combine(worldSbk, "LOG00000.TXT"), "{}");
        File.WriteAllText(Path.Combine(assetto, "telemetry.csv"), "sample");
        CreateMinimalMotoGpWorkbook(Path.Combine(motogp, "MotoGP_2026_SPA_motogp_full.xlsx"));

        try
        {
            var catalog = await new TelemetryCatalogProvider(root).GetCatalogAsync(CancellationToken.None);

            var cars = Assert.Single(catalog.Categories, category => category.Key == "cars");
            var f1 = Assert.Single(cars.Series, series => series.Key == "f1");
            var year = Assert.Single(f1.Years);
            Assert.Equal(2026, year.Year);
            Assert.Equal("Spanish Grand Prix", Assert.Single(year.Sessions).GrandPrix);

            var motorcycles = Assert.Single(catalog.Categories, category => category.Key == "motorcycles");
            var sbk = Assert.Single(motorcycles.Series, series => series.Key == "worldsbk");
            Assert.Contains(sbk.Datasets, dataset => dataset.Name == "Kawasaki Ninja 400 SSP300");

            var simulators = Assert.Single(catalog.Categories, category => category.Key == "simulators");
            var assettoSeries = Assert.Single(simulators.Series, series => series.Key == "assetto-corsa");
            Assert.Contains(assettoSeries.Datasets, dataset => dataset.Name.Contains("Silverstone 1967", StringComparison.Ordinal));

            var motoGp = Assert.Single(motorcycles.Series, series => series.Key == "motogp");
            Assert.Equal(2026, Assert.Single(motoGp.Years).Year);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static void CreateMinimalMotoGpWorkbook(string path)
    {
        using var archive = System.IO.Compression.ZipFile.Open(path, System.IO.Compression.ZipArchiveMode.Create);
        var workbook = archive.CreateEntry("xl/workbook.xml");
        using (var writer = new StreamWriter(workbook.Open()))
        {
            writer.Write("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"FP1 Results\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
        }

        var relationships = archive.CreateEntry("xl/_rels/workbook.xml.rels");
        using (var writer = new StreamWriter(relationships.Open()))
        {
            writer.Write("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
        }

        var worksheet = archive.CreateEntry("xl/worksheets/sheet1.xml");
        using var sheetWriter = new StreamWriter(worksheet.Open());
        sheetWriter.Write("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>Test Grand Prix - MotoGPT Free Practice 1</t></is></c></row></sheetData></worksheet>");
    }
}
