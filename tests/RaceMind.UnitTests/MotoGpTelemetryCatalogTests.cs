using RaceMind.Infrastructure;

namespace RaceMind.UnitTests;

public sealed class MotoGpTelemetryCatalogTests
{
    [Fact]
    public async Task Catalog_ContainsMotoGpYearAndSessionSummaries()
    {
        var root = FindTelemetryRoot();
        if (root is null) return;

        var catalog = await new TelemetryCatalogProvider(root).GetCatalogAsync(CancellationToken.None);
        var category = Assert.Single(catalog.Categories, item => item.Key == "motorcycles");
        var series = Assert.Single(category.Series, item => item.Key == "motogp");
        var year = Assert.Single(series.Years);

        Assert.Equal(2026, year.Year);
        Assert.NotEmpty(year.Events);
        Assert.All(year.Events, item => Assert.NotEmpty(item.Sessions));
    }

    private static string? FindTelemetryRoot()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            var path = Path.Combine(current.FullName, "Telemetría");
            if (Directory.Exists(Path.Combine(path, "Motos", "MotoGP"))) return path;
            current = current.Parent;
        }
        return null;
    }
}
