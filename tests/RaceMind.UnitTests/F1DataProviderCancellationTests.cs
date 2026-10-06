using RaceMind.Application;
using RaceMind.Infrastructure;

namespace RaceMind.UnitTests;

public sealed class F1DataProviderCancellationTests
{
    [Fact]
    public async Task GetSessionsAsync_ReturnsSessionsWhenRequestTokenWasAlreadyCancelled()
    {
        var dataRoot = FindLocalF1DataRoot();
        if (dataRoot is null)
        {
            return;
        }

        var provider = new TracingInsightsF1DataProvider(dataRoot);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        var sessions = await provider.GetSessionsAsync(2026, cancellation.Token);

        var session = Assert.Single(sessions, item =>
            item.GrandPrix == "Spanish Grand Prix" && item.SessionName == "Race");
        Assert.Null(session.DriverCount);
        Assert.Null(session.LapCount);
    }

    private static string? FindLocalF1DataRoot()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
        var path = Path.Combine(current.FullName, "Telemetría");
            if (Directory.Exists(path))
            {
                return path;
            }

            current = current.Parent;
        }

        return null;
    }
}
