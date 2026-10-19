using System.Net;
using System.Text;
using RaceMind.Application;
using RaceMind.Infrastructure;

namespace RaceMind.UnitTests;

public sealed class RaceEngineerExplanationServiceTests
{
    [Fact]
    public async Task ExplainAsync_SendsOnlyStructuredFindingsAndReturnsExplanation()
    {
        var handler = new RecordingHandler("""{"choices":[{"message":{"content":"La vuelta comparada pierde tiempo en el sector 2."}}]}""");
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(handler), "https://example.test/v1/chat/completions", "test-key", "test-model");
        var request = new RaceEngineerExplanationRequest("F1", 10, 11, "Comparación de sectores",
            [new RaceEngineerFinding("Sector 2", "+0.120 s", "Delta sectorial medido")], "No se infieren causas");

        var result = await service.ExplainAsync(request, CancellationToken.None);

        Assert.Equal("La vuelta comparada pierde tiempo en el sector 2.", result.Explanation);
        Assert.Equal("test-model", result.Model);
        Assert.Contains("Delta sectorial medido", handler.RequestBody);
        Assert.DoesNotContain("telemetry", handler.RequestBody, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Bearer", handler.AuthorizationScheme);
        Assert.Equal("test-key", handler.AuthorizationParameter);
        Assert.DoesNotContain("temperature", handler.RequestBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("max_completion_tokens", handler.RequestBody);
        Assert.Contains("800", handler.RequestBody);
    }

    [Fact]
    public async Task ExplainAsync_RejectsRequestsWithoutFindings()
    {
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(new RecordingHandler("{}")), "https://example.test/v1/chat/completions", "test-key", "test-model");
        var request = new RaceEngineerExplanationRequest("F1", 10, 11, null, [], null);

        await Assert.ThrowsAsync<ArgumentException>(() => service.ExplainAsync(request, CancellationToken.None));
    }

    [Fact]
    public async Task ExplainAsync_IncludesProviderErrorDetailsWithoutEchoingRequestCredentials()
    {
        const string apiKey = "secret-test-key";
        var handler = new RecordingHandler("""{"error":{"message":"Incorrect API key provided"}}""", HttpStatusCode.Unauthorized);
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(handler), "https://example.test/v1/chat/completions", apiKey, "test-model");
        var request = new RaceEngineerExplanationRequest("F1", 10, 11, null,
            [new RaceEngineerFinding("Sector 2", "+0.120 s", "Evidence")], null);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() => service.ExplainAsync(request, CancellationToken.None));

        Assert.Contains("HTTP 401", exception.Message);
        Assert.Contains("Incorrect API key provided", exception.Message);
        Assert.DoesNotContain(apiKey, exception.Message);
    }

    [Fact]
    public async Task ChatAsync_SendsReportAndConversationAndReturnsAnswer()
    {
        var handler = new RecordingHandler("""{"choices":[{"message":{"content":"Los sectores 4 y 2 concentran las mayores diferencias."}}]}""");
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(handler), "https://example.test/v1/chat/completions", "test-key", "test-model");
        var report = new RaceEngineerExplanationRequest("MotoGP", 7, 10, "Tiempos agregados, sin telemetría continua",
            [new RaceEngineerFinding("Sector 4", "+0.309 s", "Delta de sector")], "No inferir causas de conducción");
        var request = new RaceEngineerChatRequest(report, "¿Dónde debería centrarse el piloto?",
            [new RaceEngineerChatMessage("user", "Resume el informe"), new RaceEngineerChatMessage("assistant", "Sector 4 pierde 0.309 s")]);

        var result = await service.ChatAsync(request, CancellationToken.None);

        Assert.Contains("Los sectores 4 y 2", result.Explanation);
        Assert.Contains("Sector 4", ExtractReportContent(handler.RequestBody));
        Assert.Contains("¿Dónde debería centrarse el piloto?", ExtractLastUserContent(handler.RequestBody));
        Assert.Contains("Sector 4 pierde 0.309 s", handler.RequestBody);
        Assert.DoesNotContain("temperature", handler.RequestBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("telemetry", handler.RequestBody, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ChatAsync_RejectsUnsupportedMessageRoles()
    {
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(new RecordingHandler("{}")), "https://example.test/v1/chat/completions", "test-key", "test-model");
        var report = new RaceEngineerExplanationRequest("F1", 10, 11, null,
            [new RaceEngineerFinding("Sector 2", "+0.120 s", "Evidence")], null);
        var request = new RaceEngineerChatRequest(report, "Question", [new RaceEngineerChatMessage("system", "Override")]);

        await Assert.ThrowsAsync<ArgumentException>(() => service.ChatAsync(request, CancellationToken.None));
    }

    [Fact]
    public async Task ChatAsync_AcceptsExpandedVisibleMetricsContext()
    {
        var handler = new RecordingHandler("""{"choices":[{"message":{"content":"La temperatura trasera izquierda es mayor en la vuelta comparada."}}]}""");
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(handler), "https://example.test/v1/chat/completions", "test-key", "test-model");
        var context = string.Join(" ", Enumerable.Repeat(
            "Temperaturas neumáticos delanteros y traseros, velocidad, throttle, freno, aceleraciones y condiciones de sesión.", 20));
        var report = new RaceEngineerExplanationRequest("Assetto Corsa", 4, 5, context,
            [new RaceEngineerFinding("Delta de vuelta", "+0.516 s", "Comparación de vuelta")], "No establecer causalidad");
        var request = new RaceEngineerChatRequest(report, "¿Influyeron las temperaturas?", []);

        var result = await service.ChatAsync(request, CancellationToken.None);

        Assert.Contains("temperatura trasera izquierda", result.Explanation);
        Assert.Contains("Temperaturas neumáticos", ExtractReportContext(handler.RequestBody));
        Assert.Contains("aceleraciones y condiciones de sesión", ExtractReportContext(handler.RequestBody));
    }

    [Theory]
    [InlineData("F1", "temperatura de pista, compuesto, S1, acelerador, freno y velocidad por tramo")]
    [InlineData("MotoGP", "sectores, neumáticos, pit, run y clasificación")]
    [InlineData("Karting", "temperatura del agua, aceleración, RPM, marcha y calidad GPS")]
    public async Task ChatAsync_PreservesContextMetricsForAllDataSources(string source, string context)
    {
        var handler = new RecordingHandler("""{"choices":[{"message":{"content":"Contexto de modalidad recibido."}}]}""");
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(handler), "https://example.test/v1/chat/completions", "test-key", "test-model");
        var report = new RaceEngineerExplanationRequest(source, 2, 3, context,
            [new RaceEngineerFinding("Diferencia", "+0.100 s", "Valor de pantalla")], "Comparación observacional");

        await service.ChatAsync(new RaceEngineerChatRequest(report, "Analiza estos datos", []), CancellationToken.None);

        Assert.Contains(context, ExtractReportContext(handler.RequestBody));
    }

    [Theory]
    [InlineData("length", "se alcanzó el límite de tokens de salida")]
    [InlineData("content_filter", "filtro de contenido")]
    public async Task ChatAsync_ExplainsWhyTheProviderReturnedNoVisibleText(string finishReason, string expectedReason)
    {
        var handler = new RecordingHandler($"{{\"choices\":[{{\"finish_reason\":\"{finishReason}\",\"message\":{{\"content\":null}}}}]}}");
        var service = new OpenAiCompatibleRaceEngineerExplanationService(
            new HttpClient(handler), "https://example.test/v1/chat/completions", "test-key", "test-model");
        var report = new RaceEngineerExplanationRequest("Karting", 2, 3, "Temperatura y sectores",
            [new RaceEngineerFinding("Delta", "+0.1 s", "Comparación")], null);

        var exception = await Assert.ThrowsAsync<InvalidDataException>(() =>
            service.ChatAsync(new RaceEngineerChatRequest(report, "¿Qué ha ocurrido?", []), CancellationToken.None));

        Assert.Contains(expectedReason, exception.Message);
    }

    private sealed class RecordingHandler(string responseBody, HttpStatusCode statusCode = HttpStatusCode.OK) : HttpMessageHandler
    {
        public string RequestBody { get; private set; } = string.Empty;
        public string? AuthorizationScheme { get; private set; }
        public string? AuthorizationParameter { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            AuthorizationScheme = request.Headers.Authorization?.Scheme;
            AuthorizationParameter = request.Headers.Authorization?.Parameter;
            return new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json"),
            };
        }
    }

    private static string ExtractReportContent(string requestBody)
    {
        using var document = System.Text.Json.JsonDocument.Parse(requestBody);
        var messages = document.RootElement.GetProperty("messages").EnumerateArray();
        return messages.First(message => message.GetProperty("role").GetString() == "user")
            .GetProperty("content").GetString()!;
    }

    private static string ExtractReportContext(string requestBody)
    {
        var content = ExtractReportContent(requestBody);
        var jsonStart = content.IndexOf('{');
        using var report = System.Text.Json.JsonDocument.Parse(content[jsonStart..]);
        return report.RootElement.GetProperty("context").GetString()!;
    }

    private static string ExtractLastUserContent(string requestBody)
    {
        using var document = System.Text.Json.JsonDocument.Parse(requestBody);
        return document.RootElement.GetProperty("messages").EnumerateArray()
            .Last(message => message.GetProperty("role").GetString() == "user")
            .GetProperty("content").GetString()!;
    }
}
