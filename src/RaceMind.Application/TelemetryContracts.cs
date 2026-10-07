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
    IReadOnlyList<SessionSummary> Sessions,
    IReadOnlyList<TelemetryEvent> Events);

public sealed record TelemetryEvent(
    string Code,
    string Name,
    IReadOnlyList<MotoGpSessionSummary> Sessions);

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

public sealed record MotoGpEventSummary(
    string Id,
    int Year,
    string EventCode,
    string GrandPrix,
    IReadOnlyList<MotoGpSessionSummary> Sessions);

public sealed record MotoGpSessionSummary(
    string Id,
    string EventCode,
    string EventName,
    string SessionCode,
    string SessionName,
    string? Date,
    string? Weather,
    int ResultCount,
    int LapRecordCount);

public sealed record MotoGpSessionDetails(
    MotoGpSessionSummary Session,
    string? Circuit,
    string? SessionTitle,
    IReadOnlyList<MotoGpRiderResult> Results);

public sealed record MotoGpRiderResult(
    int Position,
    int RiderNumber,
    string Rider,
    string Team,
    string Bike,
    int? Laps,
    string? SessionTime,
    string? Gap,
    string? BestLap,
    double? TopSpeedKph,
    string? Status);

public sealed record MotoGpLapRecord(
    string Rider,
    int RiderNumber,
    int Position,
    int LapNumber,
    string? LapTime,
    string? Sector1,
    string? Sector2,
    string? Sector3,
    string? Sector4,
    double? SpeedKph,
    int? Pit,
    string? Run,
    string? FrontTyre,
    string? RearTyre);

public sealed record MotoGpRiderSummary(
    string Rider,
    int RiderNumber,
    string Team,
    string Bike,
    int LapCount,
    string? BestLap,
    double? TopSpeedKph);

public sealed record MotoGpSessionData(
    IReadOnlyList<MotoGpRiderResult> Results,
    IReadOnlyList<MotoGpLapRecord> LapRecords);

public interface IMotoGpDataProvider
{
    Task<IReadOnlyList<MotoGpEventSummary>> GetEventsAsync(int year, CancellationToken cancellationToken);
    Task<MotoGpSessionDetails?> GetSessionDetailsAsync(int year, string eventCode, string sessionCode, CancellationToken cancellationToken);
    Task<IReadOnlyList<MotoGpLapRecord>?> GetLapRecordsAsync(int year, string eventCode, string sessionCode, string? rider, CancellationToken cancellationToken);
}
