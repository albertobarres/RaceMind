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
builder.Services.AddSingleton<IMotoGpDataProvider>(_ =>
    new MotoGpExcelDataProvider(dataRoot ?? Path.Combine(Directory.GetCurrentDirectory(), "data")));
builder.Services.AddSingleton<IAssettoCorsaDataProvider>(_ =>
    new AssettoCorsaCsvDataProvider(dataRoot ?? Path.Combine(Directory.GetCurrentDirectory(), "data")));
builder.Services.AddSingleton<IKartingDataProvider>(_ =>
    new AimKartingCsvDataProvider(dataRoot ?? Path.Combine(Directory.GetCurrentDirectory(), "data")));
builder.Services.AddSingleton<LapComparisonService>();
builder.Services.AddHttpClient("RaceEngineer", client => client.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddTransient<IRaceEngineerExplanationService>(serviceProvider =>
    new OpenAiCompatibleRaceEngineerExplanationService(
        serviceProvider.GetRequiredService<IHttpClientFactory>().CreateClient("RaceEngineer"),
        builder.Configuration["GenerativeAI:Endpoint"],
        builder.Configuration["GenerativeAI:ApiKey"],
        builder.Configuration["GenerativeAI:Model"]));
builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
{
    var origin = builder.Configuration["Frontend:Origin"] ?? "http://localhost:5173";
    policy.WithOrigins(origin).AllowAnyHeader().AllowAnyMethod();
}));

var app = builder.Build();
app.UseCors("frontend");

var api = app.MapGroup("/api").WithTags("RaceMind");

api.MapGet("/health", () => Results.Ok(new { status = "ok", service = "RaceMind.Api" })).WithName("Health");

api.MapPost("/race-engineer/explain", async Task<IResult> (
    RaceEngineerExplanationRequest request,
    IRaceEngineerExplanationService explanationService,
    CancellationToken cancellationToken) =>
{
    if (!explanationService.IsConfigured)
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    if (request.ReferenceLap <= 0 || request.ComparedLap <= 0 || request.ReferenceLap == request.ComparedLap)
        return Results.BadRequest(new { message = "Selecciona dos vueltas distintas y positivas." });
    if (request.Findings is null || request.Findings.Count is 0 or > 8)
        return Results.BadRequest(new { message = "El informe debe incluir entre 1 y 8 hallazgos." });

    try
    {
        return Results.Ok(await explanationService.ExplainAsync(request, cancellationToken));
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
        throw;
    }
    catch (Exception exception)
    {
        app.Logger.LogWarning(exception, "Race Engineer explanation provider request failed.");
        return Results.Json(new { message = exception.Message }, statusCode: StatusCodes.Status502BadGateway);
    }
})
.WithName("ExplainRaceEngineerFindings");

api.MapPost("/race-engineer/chat", async Task<IResult> (
    RaceEngineerChatRequest request,
    IRaceEngineerExplanationService explanationService,
    CancellationToken cancellationToken) =>
{
    if (!explanationService.IsConfigured)
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    if (request.Report is null || request.Report.ReferenceLap <= 0 || request.Report.ComparedLap <= 0 ||
        request.Report.ReferenceLap == request.Report.ComparedLap)
        return Results.BadRequest(new { message = "El informe debe contener dos vueltas distintas y positivas." });
    if (request.Report.Findings is null || request.Report.Findings.Count is 0 or > 8)
        return Results.BadRequest(new { message = "El informe debe incluir entre 1 y 8 hallazgos." });
    if (string.IsNullOrWhiteSpace(request.Question) || request.Question.Length > 1000)
        return Results.BadRequest(new { message = "La pregunta debe tener entre 1 y 1000 caracteres." });
    if (request.History is null || request.History.Count > 12 || request.History.Any(message =>
        message.Role is not ("user" or "assistant") || string.IsNullOrWhiteSpace(message.Content) || message.Content.Length > 1000))
        return Results.BadRequest(new { message = "El historial de chat no es válido o supera su límite." });

    try
    {
        return Results.Ok(await explanationService.ChatAsync(request, cancellationToken));
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
        throw;
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
    catch (Exception exception)
    {
        app.Logger.LogWarning(exception, "Race Engineer chat provider request failed.");
        return Results.Json(new { message = exception.Message }, statusCode: StatusCodes.Status502BadGateway);
    }
})
.WithName("ChatWithRaceEngineer");

api.MapGet("/catalog", async (ITelemetryCatalogProvider provider, CancellationToken cancellationToken) =>
    Results.Ok(await provider.GetCatalogAsync(cancellationToken))).WithName("GetTelemetryCatalog");

api.MapGet("/karting/sessions", async (IKartingDataProvider provider, CancellationToken cancellationToken) =>
    Results.Ok(await provider.GetSessionsAsync(cancellationToken))).WithName("GetKartingSessions");

api.MapGet("/karting/sessions/{sessionId}", async (string sessionId, IKartingDataProvider provider, CancellationToken cancellationToken) =>
    {
        try
        {
            var details = await provider.GetSessionAsync(sessionId, cancellationToken);
            return details is null ? Results.NotFound() : Results.Ok(details);
        }
        catch (InvalidDataException exception)
        {
            return Results.UnprocessableEntity(new { message = exception.Message });
        }
    })
    .WithName("GetKartingSession");

api.MapGet("/karting/sessions/{sessionId}/laps/compare", async (
    string sessionId, int referenceLap, int comparedLap, int? points, IKartingDataProvider provider, CancellationToken cancellationToken) =>
    {
        if (referenceLap <= 0 || comparedLap <= 0 || referenceLap == comparedLap)
            return Results.BadRequest(new { message = "Selecciona dos vueltas distintas y positivas." });
        var pointCount = points ?? 201;
        if (pointCount is < 2 or > 2001)
            return Results.BadRequest(new { message = "El parámetro points debe estar entre 2 y 2001." });
        try
        {
            var comparison = await provider.CompareLapsAsync(sessionId, referenceLap, comparedLap, pointCount, cancellationToken);
            return comparison is null
                ? Results.UnprocessableEntity(new { message = "Las vueltas no existen o no han superado los filtros de calidad." })
                : Results.Ok(comparison);
        }
        catch (InvalidDataException exception)
        {
            return Results.UnprocessableEntity(new { message = exception.Message });
        }
    })
    .WithName("CompareKartingLaps");

api.MapGet("/cars/assetto-corsa/sessions/{sessionPath}", async (string sessionPath, IAssettoCorsaDataProvider provider, CancellationToken cancellationToken) =>
    {
        var details = await provider.GetSessionAsync(sessionPath, cancellationToken);
        return details is null ? Results.NotFound() : Results.Ok(details);
    })
    .WithName("GetAssettoCorsaSession");

api.MapGet("/cars/assetto-corsa/sessions/{sessionPath}/laps/compare", async (
    string sessionPath, int referenceLap, int comparedLap, int? points, IAssettoCorsaDataProvider provider, CancellationToken cancellationToken) =>
    {
        if (referenceLap <= 0 || comparedLap <= 0 || referenceLap == comparedLap)
        {
            return Results.BadRequest(new { message = "Selecciona dos vueltas distintas y positivas." });
        }

        var pointCount = points ?? 201;
        if (pointCount is < 2 or > 2001)
        {
            return Results.BadRequest(new { message = "El parámetro points debe estar entre 2 y 2001." });
        }

        var comparison = await provider.CompareLapsAsync(sessionPath, referenceLap, comparedLap, pointCount, cancellationToken);
        return comparison is null
            ? Results.UnprocessableEntity(new { message = "No se pudieron reconstruir ambas vueltas con calidad suficiente." })
            : Results.Ok(comparison);
    })
    .WithName("CompareAssettoCorsaLaps");

api.MapGet("/cars/assetto-corsa/sessions/{sessionPath}/assets/{assetName}", (string sessionPath, string assetName, IAssettoCorsaDataProvider provider) =>
    {
        var path = provider.GetAssetPath(sessionPath, assetName);
        if (path is null) return Results.NotFound();
        var contentType = assetName.Equals("map.png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "image/jpeg";
        return Results.File(path, contentType, enableRangeProcessing: true);
    })
    .WithName("GetAssettoCorsaAsset");

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

api.MapGet("/motorcycles/motogp/{year:int}/events", async (int year, IMotoGpDataProvider provider, CancellationToken cancellationToken) =>
    Results.Ok(await provider.GetEventsAsync(year, cancellationToken)))
    .WithName("GetMotoGpEvents");

api.MapGet("/motorcycles/motogp/{year:int}/events/{eventCode}/sessions/{sessionCode}", async (int year, string eventCode, string sessionCode, IMotoGpDataProvider provider, CancellationToken cancellationToken) =>
    {
        var details = await provider.GetSessionDetailsAsync(year, eventCode, sessionCode, cancellationToken);
        return details is null ? Results.NotFound() : Results.Ok(details);
    })
    .WithName("GetMotoGpSession");

api.MapGet("/motorcycles/motogp/{year:int}/events/{eventCode}/sessions/{sessionCode}/laps", async (int year, string eventCode, string sessionCode, string? rider, IMotoGpDataProvider provider, CancellationToken cancellationToken) =>
    {
        var records = await provider.GetLapRecordsAsync(year, eventCode, sessionCode, rider, cancellationToken);
        return records is null ? Results.NotFound() : Results.Ok(records);
    })
    .WithName("GetMotoGpLapRecords");

api.MapGet("/motorcycles/motogp/{year:int}/events/{eventCode}/sessions/{sessionCode}/details", async (int year, string eventCode, string sessionCode, IMotoGpDataProvider provider, CancellationToken cancellationToken) =>
    {
        var details = await provider.GetSessionDetailsAsync(year, eventCode, sessionCode, cancellationToken);
        return details is null ? Results.NotFound() : Results.Ok(details);
    })
    .WithName("GetMotoGpSessionDetails");

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
