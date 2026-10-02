using RaceMind.Application;
using RaceMind.Domain;

namespace RaceMind.UnitTests;

public sealed class LapComparisonServiceTests
{
    [Fact]
    public void Compare_AlignsSamplesByRelativeDistanceAndReturnsLapAndSectorDeltas()
    {
        var reference = Lap(1, 80, 20, 30, 30, [Sample(0, 0, 100), Sample(1, 80, 200)]);
        var compared = Lap(2, 81, 20.2, 30.3, 30.5, [Sample(0, 0, 100), Sample(1, 81, 200)]);

        var result = new LapComparisonService().Compare(reference, compared, 3);

        Assert.Equal(1, result.ReferenceLap);
        Assert.Equal(2, result.ComparedLap);
        Assert.Equal(1, result.DeltaLapTimeSeconds);
        Assert.Equal(0.2, result.SectorDeltasSeconds[0]!.Value, precision: 10);
        Assert.Equal(0.3, result.SectorDeltasSeconds[1]!.Value, precision: 10);
        Assert.Equal(0.5, result.SectorDeltasSeconds[2]!.Value, precision: 10);
        Assert.Equal(3, result.Points.Count);
        Assert.Equal(40.5, result.Points[1].ComparedElapsedSeconds);
        Assert.Equal(50, result.Points[1].ComparedBrakePercent);
    }

    [Fact]
    public void Compare_RejectsNonIncreasingDistance()
    {
        var invalid = Lap(2, 80, 20, 30, 30, [Sample(0, 0, 100), Sample(0, 1, 200)]);

        Assert.Throws<ArgumentException>(() => new LapComparisonService().Compare(invalid, invalid));
    }

    private static LapTelemetry Lap(int number, double time, double s1, double s2, double s3,
        IReadOnlyList<TelemetrySample> samples) => new(number, time, s1, s2, s3, "SOFT", 1, samples);

    private static TelemetrySample Sample(double relativeDistance, double elapsed, double speed) =>
        new(elapsed, relativeDistance * 4000, relativeDistance, speed, 50, 0.5);
}
