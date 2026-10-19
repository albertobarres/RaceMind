using System.Globalization;
using RaceMind.Infrastructure;

namespace RaceMind.UnitTests;

public sealed class AimKartingCsvDataProviderTests
{
    [Fact]
    public async Task ReadsBeaconLapsAndExcludesKnownBadSessionSeven()
    {
        var root = Path.Combine(Path.GetTempPath(), $"racemind-karting-{Guid.NewGuid():N}");
        var albaida = Path.Combine(root, "Karting", "Albaida");
        Directory.CreateDirectory(albaida);
        try
        {
            await File.WriteAllTextAsync(Path.Combine(albaida, "1.csv"), BuildSessionCsv());
            await File.WriteAllTextAsync(Path.Combine(albaida, "7.csv"), "not a valid session");

            var provider = new AimKartingCsvDataProvider(root);
            var sessions = await provider.GetSessionsAsync(CancellationToken.None);
            var details = await provider.GetSessionAsync("albaida-1-csv", CancellationToken.None);

            Assert.Single(sessions);
            Assert.Equal("albaida-1-csv", sessions[0].Key);
            Assert.NotNull(details);
            Assert.Equal(1801, details.SampleCount);
            Assert.Equal(3, details.BeaconCount);
            Assert.Equal(3, details.Laps.Count);
            Assert.All(details.Laps, lap => Assert.True(lap.IsComparable));
            Assert.InRange(details.BestLapSeconds!.Value, 29.9, 30.1);
            Assert.Contains(details.Warnings, warning => warning.Contains("Segment Times y las diferencias", StringComparison.Ordinal));

            var comparison = await provider.CompareLapsAsync("albaida-1-csv", 1, 2, 21, CancellationToken.None);
            Assert.NotNull(comparison);
            Assert.Equal(21, comparison.Points.Count);
            Assert.Equal(0, comparison.Points[0].RelativeDistance);
            Assert.Equal(1, comparison.Points[^1].RelativeDistance);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string BuildSessionCsv()
    {
        var output = new System.Text.StringBuilder();
        output.AppendLine("\"Format\",\"AiM CSV File\"");
        output.AppendLine("\"Session\",\"ALBAIDA\"");
        output.AppendLine("\"Vehicle\",\"dd2\"");
        output.AppendLine("\"Racer\",\"tester\"");
        output.AppendLine("\"Date\",\"Saturday, June 13, 2020\"");
        output.AppendLine("\"Time\",\"11:00 AM\"");
        output.AppendLine("\"Sample Rate\",\"20\"");
        output.AppendLine("\"Duration\",\"90\"");
        output.AppendLine("\"Beacon Markers\",\"30\",\"60\",\"90\"");
        output.AppendLine("\"Segment Times\",\"0:30.000\",\"0:30.000\",\"0:30.000\"");
        output.AppendLine();
        output.AppendLine("\"Time\",\"GPS Speed\",\"GPS Nsat\",\"GPS PosAccuracy\",\"GPS SpdAccuracy\",\"GPS LatAcc\",\"GPS LonAcc\",\"GPS Latitude\",\"GPS Longitude\",\"RPM\",\"Calculated Gear\",\"Water Temp\"");
        output.AppendLine("\"s\",\"km/h\",\" \",\"mm\",\"km/h\",\"g\",\"g\",\"deg\",\"deg\",\"rpm\",\"#\",\"°C\"");
        output.AppendLine();

        var culture = CultureInfo.InvariantCulture;
        for (var index = 0; index <= 1800; index++)
        {
            var time = index / 20d;
            var angle = time / 30d * 2 * Math.PI;
            var latitude = 38.8585 + 0.00112 * Math.Sin(angle);
            var longitude = -0.5268 + 0.00112 * Math.Cos(angle) / Math.Cos(38.8585 * Math.PI / 180);
            var gear = Math.Abs(Math.Sin(time * 2)) < 0.01 ? 1.5 : Math.Sin(time) > 0 ? 2 : 1;
            output.Append('"').Append(time.ToString("F3", culture)).Append("\",\"")
                .Append("94.25\",\"12\",\"7.3\",\"0.13\",\"0.1\",\"0.1\",\"")
                .Append(latitude.ToString("F8", culture)).Append("\",\"")
                .Append(longitude.ToString("F8", culture)).Append("\",\"10000\",\"")
                .Append(gear.ToString("F2", culture)).Append("\",\"50\"\n");
        }

        return output.ToString();
    }
}
