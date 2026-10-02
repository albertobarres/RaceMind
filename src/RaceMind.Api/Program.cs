using RaceMind.Application;
using RaceMind.Domain;
using RaceMind.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

var dataRoot = builder.Configuration["F1DataRoot"];
if (string.IsNullOrWhiteSpace(dataRoot))
{
    dataRoot = FindF1DataRoot(Directory.GetCurrentDirectory());
}

builder.Services.AddSingleton<IF1DataProvider>(_ =>
    new TracingInsightsF1DataProvider(dataRoot ?? Path.Combine(Directory.GetCurrentDirectory(), "data", "f1")));
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

api.MapGet("/sessions", async (IF1DataProvider provider, CancellationToken cancellationToken) =>
    Results.Ok(await provider.GetSessionsAsync(cancellationToken))).WithName("GetSessions");

api.MapGet("/sessions/{grandPrix}/{sessionName}", async (string grandPrix, string sessionName, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var session = await provider.GetSessionAsync(grandPrix, sessionName, cancellationToken);
        return session is null ? Results.NotFound() : Results.Ok(session);
    })
    .WithName("GetSession");

api.MapGet("/sessions/{grandPrix}/{sessionName}/corners", async (string grandPrix, string sessionName, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var corners = await provider.GetCornersAsync(grandPrix, sessionName, cancellationToken);
        return corners is null ? Results.NotFound() : Results.Ok(corners);
    })
    .WithName("GetSessionCorners");

api.MapGet("/sessions/{grandPrix}/{sessionName}/drivers", async (string grandPrix, string sessionName, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var drivers = await provider.GetDriversAsync(grandPrix, sessionName, cancellationToken);
        return drivers is null ? Results.NotFound() : Results.Ok(drivers);
    })
    .WithName("GetSessionDrivers");

api.MapGet("/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps", async (string grandPrix, string sessionName, string driverCode, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var laps = await provider.GetLapsAsync(grandPrix, sessionName, driverCode, cancellationToken);
        return laps is null ? Results.NotFound() : Results.Ok(laps);
    })
    .WithName("GetDriverLaps");

api.MapGet("/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/{lapNumber:int}/telemetry", async (string grandPrix, string sessionName, string driverCode, int lapNumber, IF1DataProvider provider, CancellationToken cancellationToken) =>
    {
        var lap = await provider.GetLapTelemetryAsync(grandPrix, sessionName, driverCode, lapNumber, cancellationToken);
        return lap is null
            ? Results.NotFound(new { message = "Lap telemetry was not found or did not pass the minimum quality checks." })
            : Results.Ok(lap);
    })
    .WithName("GetLapTelemetry");

api.MapGet("/sessions/{grandPrix}/{sessionName}/drivers/{driverCode}/laps/compare", 
    async (string grandPrix, string sessionName, string driverCode, int referenceLap, int comparedLap, int? points, IF1DataProvider provider, 
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

        var reference = await provider.GetLapTelemetryAsync(grandPrix, sessionName, driverCode, referenceLap, cancellationToken);
        var compared = await provider.GetLapTelemetryAsync(grandPrix, sessionName, driverCode, comparedLap, cancellationToken);
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

static string? FindF1DataRoot(string startDirectory)
{
    var current = new DirectoryInfo(startDirectory);
    while (current is not null)
    {
        var candidate = Path.Combine(current.FullName, "Telemetría", "F1");
        if (Directory.Exists(candidate))
        {
            return candidate;
        }

        current = current.Parent;
    }

    return null;
}

public partial class Program;
