using RaceMind.Domain;

namespace RaceMind.Application;

public sealed class LapComparisonService
{
    public LapComparisonResult Compare(LapTelemetry reference, LapTelemetry compared, int pointCount = 201)
    {
        ArgumentNullException.ThrowIfNull(reference);
        ArgumentNullException.ThrowIfNull(compared);
        if (pointCount is < 2 or > 2001)
        {
            throw new ArgumentOutOfRangeException(nameof(pointCount), "Point count must be between 2 and 2001.");
        }

        Validate(reference, nameof(reference));
        Validate(compared, nameof(compared));

        var points = new List<LapComparisonPoint>(pointCount);
        for (var index = 0; index < pointCount; index++)
        {
            var relativeDistance = (double)index / (pointCount - 1);
            var referencePoint = Interpolate(reference.Samples, relativeDistance);
            var comparedPoint = Interpolate(compared.Samples, relativeDistance);

            points.Add(new LapComparisonPoint(
                relativeDistance,
                referencePoint.ElapsedSeconds,
                comparedPoint.ElapsedSeconds,
                comparedPoint.ElapsedSeconds - referencePoint.ElapsedSeconds,
                referencePoint.SpeedKph,
                comparedPoint.SpeedKph,
                comparedPoint.SpeedKph - referencePoint.SpeedKph,
                referencePoint.ThrottlePercent,
                comparedPoint.ThrottlePercent,
                referencePoint.BrakeFraction * 100d,
                comparedPoint.BrakeFraction * 100d));
        }

        return new LapComparisonResult(
            reference.LapNumber,
            compared.LapNumber,
            reference.LapTimeSeconds,
            compared.LapTimeSeconds,
            Delta(reference.LapTimeSeconds, compared.LapTimeSeconds),
            new double?[]
            {
                Delta(reference.Sector1Seconds, compared.Sector1Seconds),
                Delta(reference.Sector2Seconds, compared.Sector2Seconds),
                Delta(reference.Sector3Seconds, compared.Sector3Seconds)
            },
            points);
    }

    private static double? Delta(double? reference, double? compared) =>
        reference.HasValue && compared.HasValue ? compared.Value - reference.Value : null;

    private static void Validate(LapTelemetry lap, string parameterName)
    {
        if (lap.Samples.Count < 2)
        {
            throw new ArgumentException("A lap needs at least two telemetry samples.", parameterName);
        }

        for (var index = 0; index < lap.Samples.Count; index++)
        {
            var sample = lap.Samples[index];
            if (!double.IsFinite(sample.RelativeDistance) || !double.IsFinite(sample.ElapsedSeconds) ||
                !double.IsFinite(sample.SpeedKph) || !double.IsFinite(sample.ThrottlePercent) ||
                !double.IsFinite(sample.BrakeFraction))
            {
                throw new ArgumentException("Lap samples must contain finite numeric values.", parameterName);
            }

            if (index > 0 && sample.RelativeDistance <= lap.Samples[index - 1].RelativeDistance)
            {
                throw new ArgumentException("Relative distance must be strictly increasing.", parameterName);
            }
        }
    }

    private static TelemetrySample Interpolate(IReadOnlyList<TelemetrySample> samples, double relativeDistance)
    {
        if (relativeDistance <= samples[0].RelativeDistance)
        {
            return samples[0];
        }

        if (relativeDistance >= samples[^1].RelativeDistance)
        {
            return samples[^1];
        }

        var low = 0;
        var high = samples.Count - 1;
        while (high - low > 1)
        {
            var middle = low + (high - low) / 2;
            if (samples[middle].RelativeDistance < relativeDistance)
            {
                low = middle;
            }
            else
            {
                high = middle;
            }
        }

        var left = samples[low];
        var right = samples[high];
        var factor = (relativeDistance - left.RelativeDistance) /
                     (right.RelativeDistance - left.RelativeDistance);

        return new TelemetrySample(
            Lerp(left.ElapsedSeconds, right.ElapsedSeconds, factor),
            Lerp(left.DistanceMeters, right.DistanceMeters, factor),
            relativeDistance,
            Lerp(left.SpeedKph, right.SpeedKph, factor),
            Lerp(left.ThrottlePercent, right.ThrottlePercent, factor),
            Lerp(left.BrakeFraction, right.BrakeFraction, factor));
    }

    private static double Lerp(double left, double right, double factor) => left + (right - left) * factor;
}
