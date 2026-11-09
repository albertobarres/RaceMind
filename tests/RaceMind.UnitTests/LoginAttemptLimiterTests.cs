using RaceMind.Api;

namespace RaceMind.UnitTests;

public sealed class LoginAttemptLimiterTests
{
    [Fact]
    public void RegisterFailure_BlocksOnlyTheSameClientAndUsernamePair()
    {
        var limiter = new LoginAttemptLimiter();
        var accountKey = LoginAttemptLimiter.CreateKey("203.0.113.10", "racer");
        var otherAccountKey = LoginAttemptLimiter.CreateKey("203.0.113.10", "engineer");
        var otherClientKey = LoginAttemptLimiter.CreateKey("203.0.113.11", "racer");

        for (var attempt = 0; attempt < 4; attempt++)
            Assert.False(limiter.RegisterFailure(accountKey));

        Assert.True(limiter.RegisterFailure(accountKey));
        Assert.True(limiter.IsBlocked(accountKey));
        Assert.False(limiter.IsBlocked(otherAccountKey));
        Assert.False(limiter.IsBlocked(otherClientKey));
    }

    [Fact]
    public void Reset_ClearsFailuresAfterSuccessfulAuthentication()
    {
        var limiter = new LoginAttemptLimiter();
        var key = LoginAttemptLimiter.CreateKey("203.0.113.10", "racer");
        for (var attempt = 0; attempt < 5; attempt++)
            limiter.RegisterFailure(key);

        limiter.Reset(key);

        Assert.False(limiter.IsBlocked(key));
        Assert.False(limiter.RegisterFailure(key));
    }

    [Fact]
    public void CreateKey_NormalizesUsernameCaseAndWhitespace()
    {
        Assert.Equal(
            LoginAttemptLimiter.CreateKey("203.0.113.10", " racer "),
            LoginAttemptLimiter.CreateKey("203.0.113.10", "RACER"));
    }
}
