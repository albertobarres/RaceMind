using Microsoft.Extensions.Options;
using RaceMind.Api;

namespace RaceMind.UnitTests;

public sealed class UserStoreTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "racemind-users-tests", Guid.NewGuid().ToString("N"));
    private readonly UserStore _store;

    public UserStoreTests()
    {
        _store = new UserStore(Options.Create(new UserStoreOptions { Path = Path.Combine(_directory, "users.json") }));
    }

    [Fact]
    public async Task Initialize_CreatesAdminWithPasswordHashAndPreservesItOnRestart()
    {
        await _store.InitializeAsync("admin01", "a-long-admin-password", "Admin User");
        var storedFile = await File.ReadAllTextAsync(Path.Combine(_directory, "users.json"));
        var restartedStore = new UserStore(Options.Create(new UserStoreOptions { Path = Path.Combine(_directory, "users.json") }));
        await restartedStore.InitializeAsync("different-admin", "another-long-password", "Different Admin");

        Assert.DoesNotContain("a-long-admin-password", storedFile);
        Assert.Equal("admin01", restartedStore.Authenticate("ADMIN01", "a-long-admin-password")?.Username);
        Assert.Null(restartedStore.Authenticate("admin01", "wrong-password"));
        Assert.Single(restartedStore.List());
    }

    [Fact]
    public async Task Create_StoresHashAndRejectsDuplicateUsernameIgnoringCase()
    {
        await _store.InitializeAsync("admin01", "a-long-admin-password", "Admin User");

        var created = _store.Create("analyst01", "Analyst One", "a-long-user-password");

        Assert.Equal("User", created.Role);
        Assert.Equal("analyst01", _store.Authenticate("ANALYST01", "a-long-user-password")?.Username);
        Assert.DoesNotContain("a-long-user-password", await File.ReadAllTextAsync(Path.Combine(_directory, "users.json")));
        Assert.Throws<InvalidOperationException>(() => _store.Create("ANALYST01", "Duplicate User", "another-long-password"));
    }

    [Fact]
    public async Task Create_ValidatesUsernameAndPasswordLength()
    {
        await _store.InitializeAsync("admin01", "a-long-admin-password", "Admin User");

        Assert.Throws<ArgumentException>(() => _store.Create("x", "Short Username", "a-long-user-password"));
        Assert.Throws<ArgumentException>(() => _store.Create("analyst01", "Analyst One", "short"));
    }

    [Fact]
    public async Task Delete_RejectsSelfAndLastAdminButRemovesOtherUsers()
    {
        await _store.InitializeAsync("admin01", "a-long-admin-password", "Admin User");
        var admin = Assert.Single(_store.List());
        var member = _store.Create("analyst01", "Analyst One", "a-long-user-password");

        Assert.Throws<InvalidOperationException>(() => _store.Delete(admin.Id, admin.Id));
        Assert.Throws<InvalidOperationException>(() => _store.Delete(admin.Id, "another-session"));
        Assert.True(_store.Delete(member.Id, admin.Id));
        Assert.Null(_store.Authenticate("analyst01", "a-long-user-password"));
        Assert.False(_store.Delete(member.Id, admin.Id));
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory)) Directory.Delete(_directory, recursive: true);
    }
}
