using RaceMind.Domain;

namespace RaceMind.Application;

public sealed record SessionSummary(int Year, string Id, string GrandPrix, string SessionName, int? DriverCount, int? LapCount);

public sealed record TelemetryCatalog(
    IReadOnlyList<TelemetryCategory> Categories);

public sealed record TelemetryCategory(
    string Key,
    string Name,
    IReadOnlyList<TelemetrySeries> Series);

public sealed record TelemetrySeries(
    string Key,
    string Name,
    IReadOnlyList<TelemetryYear> Years,
    IReadOnlyList<TelemetryDataset> Datasets);

public sealed record TelemetryYear(
    int Year,
    IReadOnlyList<SessionSummary> Sessions);

public sealed record TelemetryDataset(
    string Key,
    string Name,
    string? Location,
    bool HasSessionAnalysis);

public sealed record DriverSummary(string Code, string? FullName, string? Team, string? TeamColour, int? LapCount, double? BestLapSeconds);

public sealed record SessionDetails(int Year, string Id, string GrandPrix, string SessionName, IReadOnlyList<DriverSummary> Drivers, int CornerCount, WeatherSummary? Weather);

public sealed record WeatherSummary(double? AirTemperatureCelsius, double? TrackTemperatureCelsius, double? HumidityPercent, double? PressureHpa, 
    double? WindSpeedMetersPerSecond, bool? Rainfall, double? SampleTimeSeconds);

public sealed record CornerSummary(int Number, double DistanceMeters, double X, double Y, double AngleDegrees);

public sealed record LapSummary(int Number, double? LapTimeSeconds, double? Sector1Seconds, double? Sector2Seconds, double? Sector3Seconds, string? TyreCompound, 
    int? Stint, bool HasTelemetry, bool IsPersonalBest);

public interface IF1DataProvider
{
    Task<IReadOnlyList<SessionSummary>> GetSessionsAsync(int year, CancellationToken cancellationToken);
    Task<SessionDetails?> GetSessionAsync(int year, string grandPrix, string sessionName, CancellationToken cancellationToken);
    Task<IReadOnlyList<CornerSummary>?> GetCornersAsync(int year, string grandPrix, string sessionName, CancellationToken cancellationToken);
    Task<IReadOnlyList<DriverSummary>?> GetDriversAsync(int year, string grandPrix, string sessionName, CancellationToken cancellationToken);
    Task<IReadOnlyList<LapSummary>?> GetLapsAsync(int year, string grandPrix, string sessionName, string driverCode, CancellationToken cancellationToken);
    Task<LapTelemetry?> GetLapTelemetryAsync(int year, string grandPrix, string sessionName, string driverCode, int lapNumber, CancellationToken cancellationToken);
}

public interface ITelemetryCatalogProvider
{
    Task<TelemetryCatalog> GetCatalogAsync(CancellationToken cancellationToken);
}
