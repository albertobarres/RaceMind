using RaceMind.Application;
using RaceMind.Domain;
using RaceMind.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

var dataRoot = builder.Configuration["TelemetryDataRoot"] ?? builder.Configuration["F1DataRoot"];
if (string.IsNullOrWhiteSpace(dataRoot))
{
    dataRoot = FindTelemetryDataRoot(Directory.GetCurrentDirectory());
}

builder.Services.AddSingleton<IF1DataProvider>(_ =>
    new TracingInsightsF1DataProvider(dataRoot ?? Path.Combine(Directory.GetCurrentDirectory(), "data")));
builder.Services.AddSingleton<ITelemetryCatalogProvider>(_ =>
    new TelemetryCatalogProvider(dataRoot ?? Path.Combine(Directory.GetCurrentDirectory(), "data")));
builder.Services.AddSingleton<LapComparisonService>();
builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
{
    var origin = builder.Configuration["Frontend:Origin"] ?? "http://localhost:5173";
    policy.WithOrigins(origin).AllowAnyHeader().AllowAnyMethod();
}));

var app = builder.Build();
app.UseCors("frontend");

var api = app.MapGroup("/api").WithTags("RaceMind");

api.MapGet("/health", () => Results.Ok(new { status = "ok", service = "RaceMind.Api" })).WithName("Health");

api.MapGet("/catalog", async (ITelemetryCatalogProvider provider, CancellationToken cancellationToken) =>
    Results.Ok(await provider.GetCatalogAsync(cancellationToken))).WithName("GetTelemetryCatalog");

api.MapGet("/cars/f1/{year:int}/sessions", async (int year, IF1DataProvider provider, CancellationToken cancellationToken) =>
    Results.Ok(await provider.GetSessionsAsync(year, cancellationToken))).WithName("GetSessions");

api.MapGet("/cars/f1/{year:int}/sessions/{grandPrix}/{sessionName}", async (int year, string grandPrix, string sessionName, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var session = await provider.GetSessionAsync(year, grandPrix, sessionName, cancellationToken);
        return session is null ? Results.NotFound() : Results.Ok(session);
    })
    .WithName("GetSession");

api.MapGet("/cars/f1/{year:int}/sessions/{grandPrix}/{sessionName}/corners", async (int year, string grandPrix, string sessionName, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var corners = await provider.GetCornersAsync(year, grandPrix, sessionName, cancellationToken);
        return corners is null ? Results.NotFound() : Results.Ok(corners);
    })
    .WithName("GetSessionCorners");

api.MapGet("/cars/f1/{year:int}/sessions/{grandPrix}/{sessionName}/drivers", async (int year, string grandPrix, string sessionName, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var drivers = await provider.GetDriversAsync(year, grandPrix, sessionName, cancellationToken);
        return drivers is null ? Results.NotFound() : Results.Ok(drivers);
    })
    .WithName("GetSessionDrivers");

api.MapGet("/cars/f1/{year:int}/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps", async (int year, string grandPrix, string sessionName, string driverCode, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var laps = await provider.GetLapsAsync(year, grandPrix, sessionName, driverCode, cancellationToken);
        return laps is null ? Results.NotFound() : Results.Ok(laps);
    })
    .WithName("GetDriverLaps");

api.MapGet("/cars/f1/{year:int}/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/{lapNumber:int}/telemetry", async (int year, string grandPrix, string sessionName, string driverCode, int lapNumber, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var lap = await provider.GetLapTelemetryAsync(year, grandPrix, sessionName, driverCode, lapNumber, cancellationToken);
        return lap is null
            ? Results.NotFound(new { message = "Lap telemetry was not found or did not pass the minimum quality checks." })
            : Results.Ok(lap);
    })
    .WithName("GetLapTelemetry");

api.MapGet("/cars/f1/{year:int}/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/compare",
    async (int year, string grandPrix, string sessionName, string driverCode, int referenceLap, int comparedLap, int? points, IF1DataProvider provider,
        LapComparisonService comparisonService, CancellationToken cancellationToken) =>
    {
        if (referenceLap <= 0 || comparedLap <= 0)
        {
            return Results.BadRequest(new { message = "Lap numbers must be positive." });
        }

        var pointCount = points ?? 201;
        if (pointCount is < 2 or > 2001)
        {
            return Results.BadRequest(new { message = "The points parameter must be between 2 and 2001." });
        }

        var reference = await provider.GetLapTelemetryAsync(year, grandPrix, sessionName, driverCode, referenceLap, cancellationToken);
        var compared = await provider.GetLapTelemetryAsync(year, grandPrix, sessionName, driverCode, comparedLap, cancellationToken);
        if (reference is null || compared is null)
        {
            return Results.NotFound(new { message = "Both laps must have valid telemetry to compare." });
        }

        try
        {
            return Results.Ok(comparisonService.Compare(reference, compared, pointCount));
        }
        catch (ArgumentException exception)
        {
            return Results.UnprocessableEntity(new { message = exception.Message });
        }
    })
    .WithName("CompareLaps");

app.Run();

static string? FindTelemetryDataRoot(string startDirectory)
{
    var current = new DirectoryInfo(startDirectory);
    while (current is not null)
    {
        var telemetryCandidate = Path.Combine(current.FullName, "Telemetría");
        if (Directory.Exists(Path.Combine(telemetryCandidate, "Coches")) ||
            Directory.Exists(Path.Combine(telemetryCandidate, "Simuladores")) ||
            Directory.Exists(Path.Combine(telemetryCandidate, "Motos")))
        {
            return telemetryCandidate;
        }

        var legacyF1Candidate = Path.Combine(telemetryCandidate, "F1");
        if (Directory.Exists(legacyF1Candidate)) return legacyF1Candidate;

        current = current.Parent;
    }

    return null;
}

public partial class Program;
