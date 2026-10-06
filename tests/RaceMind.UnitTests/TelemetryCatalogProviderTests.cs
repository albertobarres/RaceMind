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
        Directory.CreateDirectory(f1Session);
        Directory.CreateDirectory(worldSbk);
        Directory.CreateDirectory(assetto);
        File.WriteAllText(Path.Combine(f1Session, "session_laptimes.json"), "{}");
        File.WriteAllText(Path.Combine(worldSbk, "LOG00000.TXT"), "{}");
        File.WriteAllText(Path.Combine(assetto, "telemetry.csv"), "sample");

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
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
