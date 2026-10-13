using RaceMind.Infrastructure;

namespace RaceMind.UnitTests;

public sealed class AssettoCorsaCsvDataProviderTests
{
    [Fact]
    public async Task LocalSpaSession_HasPlausibleTelemetryAndReconstructedLaps()
    {
        var telemetryRoot = FindLocalTelemetryRoot();
        if (telemetryRoot is null) return;

        var provider = new AssettoCorsaCsvDataProvider(telemetryRoot);
        var session = (await provider.GetSessionsAsync(CancellationToken.None))
            .FirstOrDefault(item => item.Name.Contains("Corvette C7R", StringComparison.Ordinal));
        if (session is null) return;

        var details = await provider.GetSessionAsync(session.Key, CancellationToken.None);

        Assert.NotNull(details);
        Assert.True(details.SampleCount > 10_000);
        Assert.InRange(details.PeakSpeedKph!.Value, 100, 350);
        Assert.True(details.Track.Count <= 1400);
        Assert.True(details.Laps.Count > 0);
        Assert.Contains(details.Warnings, warning => warning.Contains("lap_progress", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Session_ReconstructsCompleteLapsFromRepeatedPositionAndComparesThem()
    {
        var root = Path.Combine(Path.GetTempPath(), $"racemind-assetto-{Guid.NewGuid():N}");
        var sessionDirectory = Path.Combine(root, "Simuladores", "Assetto Corsa", "Test Track", "Test Car");
        Directory.CreateDirectory(sessionDirectory);
        File.WriteAllText(Path.Combine(sessionDirectory, "session_info.json"), "{\"car\":\"test_car\",\"max_rpm\":8000,\"max_power_w\":300000,\"max_torque_nm\":400,\"max_fuel_l\":80}");
        File.WriteAllText(Path.Combine(sessionDirectory, "telemetry.csv"), CreateTelemetryCsv());

        try
        {
            var provider = new AssettoCorsaCsvDataProvider(root);
            var dataset = Assert.Single(await provider.GetSessionsAsync(CancellationToken.None));
            var details = await provider.GetSessionAsync(dataset.Key, CancellationToken.None);

            Assert.NotNull(details);
            Assert.Equal(2, details.LapCount);
            Assert.InRange(details.Laps[0].LapTimeSeconds, 48, 51);
            Assert.InRange(details.Laps[0].DistanceMeters, 580, 635);
            Assert.Equal(8000, details.Specs.MaxRpm);

            var comparison = await provider.CompareLapsAsync(dataset.Key, 1, 2, 21, CancellationToken.None);
            Assert.NotNull(comparison);
            Assert.Equal(21, comparison.Points.Count);
            Assert.InRange(Math.Abs(comparison.DeltaLapTimeSeconds), 0, 2);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string CreateTelemetryCsv()
    {
        var rows = new List<string> { "timestamp,speed_kmh,rpms,gear,throttle,brake,pos_x,pos_z,fuel" };
        for (var index = 0; index <= 1000; index++)
        {
            var angle = Math.PI + (2 * Math.PI * index / 500);
            var x = 100 + 100 * Math.Cos(angle);
            var z = 100 * Math.Sin(angle);
            rows.Add(string.Join(',',
                (100 + index * .1).ToString(System.Globalization.CultureInfo.InvariantCulture),
                "100", "5000", "3", "0.8", "0", x.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
                z.ToString("R", System.Globalization.CultureInfo.InvariantCulture), "50"));
        }
        return string.Join(Environment.NewLine, rows);
    }

    private static string? FindLocalTelemetryRoot()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            var root = Path.Combine(current.FullName, "Telemetría");
            if (Directory.Exists(Path.Combine(root, "Simuladores", "Assetto Corsa"))) return root;
            current = current.Parent;
        }
        return null;
    }
}
