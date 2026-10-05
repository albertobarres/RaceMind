using RaceMind.Domain;

namespace RaceMind.Application;

public sealed record SessionSummary(string Id, string GrandPrix, string SessionName, int? DriverCount, int? LapCount);

public sealed record DriverSummary(string Code, string? FullName, string? Team, string? TeamColour, int? LapCount, double? BestLapSeconds);

public sealed record SessionDetails(string Id, string GrandPrix, string SessionName, IReadOnlyList<DriverSummary> Drivers, int CornerCount, WeatherSummary? Weather);

public sealed record WeatherSummary(double? AirTemperatureCelsius, double? TrackTemperatureCelsius, double? HumidityPercent, double? PressureHpa, 
    double? WindSpeedMetersPerSecond, bool? Rainfall, double? SampleTimeSeconds);

public sealed record CornerSummary(int Number, double DistanceMeters, double X, double Y, double AngleDegrees);

public sealed record LapSummary(int Number, double? LapTimeSeconds, double? Sector1Seconds, double? Sector2Seconds, double? Sector3Seconds, string? TyreCompound, 
    int? Stint, bool HasTelemetry, bool IsPersonalBest);

public interface IF1DataProvider
{
    Task<IReadOnlyList<SessionSummary>> GetSessionsAsync(CancellationToken cancellationToken);
    Task<SessionDetails?> GetSessionAsync(string grandPrix, string sessionName, CancellationToken cancellationToken);
    Task<IReadOnlyList<CornerSummary>?> GetCornersAsync(string grandPrix, string sessionName, CancellationToken cancellationToken);
    Task<IReadOnlyList<DriverSummary>?> GetDriversAsync(string grandPrix, string sessionName, CancellationToken cancellationToken);
    Task<IReadOnlyList<LapSummary>?> GetLapsAsync(string grandPrix, string sessionName, string driverCode, CancellationToken cancellationToken);
    Task<LapTelemetry?> GetLapTelemetryAsync(string grandPrix, string sessionName, string driverCode, int lapNumber, CancellationToken cancellationToken);
}
