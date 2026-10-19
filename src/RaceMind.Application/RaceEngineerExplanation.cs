namespace RaceMind.Application;

public sealed record RaceEngineerFinding(string Title, string Value, string Evidence);

public sealed record RaceEngineerExplanationRequest(
    string Source,
    int ReferenceLap,
    int ComparedLap,
    string? Context,
    IReadOnlyList<RaceEngineerFinding> Findings,
    string? Limitations);

public sealed record RaceEngineerExplanationResponse(string Explanation, string Provider, string Model);

public sealed record RaceEngineerChatMessage(string Role, string Content);

public sealed record RaceEngineerChatRequest(
    RaceEngineerExplanationRequest Report,
    string Question,
    IReadOnlyList<RaceEngineerChatMessage> History);

public interface IRaceEngineerExplanationService
{
    bool IsConfigured { get; }
    Task<RaceEngineerExplanationResponse> ExplainAsync(RaceEngineerExplanationRequest request, CancellationToken cancellationToken);
    Task<RaceEngineerExplanationResponse> ChatAsync(RaceEngineerChatRequest request, CancellationToken cancellationToken);
}
