namespace RaceMind.Domain;

public sealed record TelemetrySample(double ElapsedSeconds, double DistanceMeters, double RelativeDistance, double SpeedKph, double ThrottlePercent,  
    double BrakeFraction);

public sealed record LapTelemetry(int LapNumber, double? LapTimeSeconds, double? Sector1Seconds, double? Sector2Seconds, double? Sector3Seconds, string? TyreCompound, 
    int? Stint, IReadOnlyList<TelemetrySample> Samples);

public sealed record LapComparisonPoint(double RelativeDistance, double ReferenceElapsedSeconds, double ComparedElapsedSeconds, double DeltaElapsedSeconds, 
    double ReferenceSpeedKph, double ComparedSpeedKph, double DeltaSpeedKph, double ReferenceThrottlePercent, double ComparedThrottlePercent, 
    double ReferenceBrakePercent, double ComparedBrakePercent);

public sealed record LapComparisonResult(int ReferenceLap, int ComparedLap, double? ReferenceLapTimeSeconds, double? ComparedLapTimeSeconds, double? DeltaLapTimeSeconds,
    IReadOnlyList<double?> SectorDeltasSeconds, IReadOnlyList<LapComparisonPoint> Points);
