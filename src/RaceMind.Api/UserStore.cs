using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace RaceMind.Api;

public sealed partial class UserStore(IOptions<UserStoreOptions> options)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly PasswordHasher<StoredUser> PasswordHasher = new();
    private readonly object _sync = new();
    private readonly string _filePath = Path.GetFullPath(options.Value.Path);
    private List<StoredUser> _users = [];

    public async Task InitializeAsync(string? adminUsername, string? adminPassword, string? adminDisplayName)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);
        var usersExist = false;
        lock (_sync)
        {
            if (File.Exists(_filePath))
            {
                _users = JsonSerializer.Deserialize<List<StoredUser>>(File.ReadAllText(_filePath), JsonOptions) ?? [];
                usersExist = true;
            }
        }

        if (!usersExist)
        {
            if (string.IsNullOrWhiteSpace(adminUsername) || string.IsNullOrWhiteSpace(adminPassword))
                throw new InvalidOperationException("Configura Authentication:Admin:Username y Authentication:Admin:Password para crear el primer administrador.");

            ValidateNewUser(adminUsername, adminDisplayName ?? adminUsername, adminPassword);
            var admin = new StoredUser(Guid.NewGuid().ToString("N"), adminUsername.Trim(),
                string.IsNullOrWhiteSpace(adminDisplayName) ? adminUsername.Trim() : adminDisplayName.Trim(), "Admin", "");
            admin.PasswordHash = PasswordHasher.HashPassword(admin, adminPassword);
            lock (_sync)
            {
                _users.Add(admin);
                Persist();
            }
        }

        if (!_users.Any(user => user.Role == "Admin" && user.IsActive))
        {
            throw new InvalidOperationException("El almacén de usuarios no contiene un administrador activo.");
        }

        await Task.CompletedTask;
    }

    public StoredUser? Authenticate(string? username, string? password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password)) return null;
        lock (_sync)
        {
            var user = _users.FirstOrDefault(candidate => candidate.IsActive &&
                string.Equals(candidate.Username, username.Trim(), StringComparison.OrdinalIgnoreCase));
            if (user is null) return null;
            return PasswordHasher.VerifyHashedPassword(user, user.PasswordHash, password) == PasswordVerificationResult.Failed
                ? null
                : user;
        }
    }

    public IReadOnlyList<UserSummary> List()
    {
        lock (_sync)
        {
            return _users.OrderBy(user => user.Username, StringComparer.OrdinalIgnoreCase)
                .Select(user => new UserSummary(user.Id, user.Username, user.DisplayName, user.Role, user.IsActive, user.CreatedAtUtc))
                .ToArray();
        }
    }

    public UserSummary Create(string username, string displayName, string password)
    {
        ValidateNewUser(username, displayName, password);
        lock (_sync)
        {
            if (_users.Any(user => string.Equals(user.Username, username.Trim(), StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Ya existe una cuenta con ese nombre de usuario.");

            var user = new StoredUser(Guid.NewGuid().ToString("N"), username.Trim(), displayName.Trim(), "User", "");
            user.PasswordHash = PasswordHasher.HashPassword(user, password);
            _users.Add(user);
            Persist();
            return new UserSummary(user.Id, user.Username, user.DisplayName, user.Role, user.IsActive, user.CreatedAtUtc);
        }
    }

    public bool Delete(string id, string currentUserId)
    {
        lock (_sync)
        {
            var user = _users.FirstOrDefault(candidate => string.Equals(candidate.Id, id, StringComparison.Ordinal));
            if (user is null) return false;
            if (string.Equals(user.Id, currentUserId, StringComparison.Ordinal))
                throw new InvalidOperationException("No puedes eliminar tu propia cuenta mientras tienes la sesión abierta.");
            if (user.Role == "Admin" && user.IsActive && _users.Count(candidate => candidate.Role == "Admin" && candidate.IsActive) <= 1)
                throw new InvalidOperationException("No se puede eliminar el último administrador activo.");

            _users.Remove(user);
            Persist();
            return true;
        }
    }

    private void Persist()
    {
        var temporaryPath = $"{_filePath}.{Guid.NewGuid():N}.tmp";
        try
        {
            using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temporaryPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                JsonSerializer.Serialize(stream, _users, JsonOptions);
            }
            File.Move(temporaryPath, _filePath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    private static void ValidateNewUser(string username, string displayName, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Trim().Length is < 3 or > 32 || !UsernamePattern().IsMatch(username.Trim()))
            throw new ArgumentException("El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.", nameof(username));
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Trim().Length > 80)
            throw new ArgumentException("El nombre visible es obligatorio y no puede superar 80 caracteres.", nameof(displayName));
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12 || password.Length > 256)
            throw new ArgumentException("La contraseña debe tener entre 12 y 256 caracteres.", nameof(password));
    }

    [GeneratedRegex("^[a-zA-Z0-9._-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex UsernamePattern();
}

public sealed class UserStoreOptions
{
    public string Path { get; set; } = "data/users.json";
}

public sealed class StoredUser(string id, string username, string displayName, string role, string passwordHash)
{
    public string Id { get; set; } = id;
    public string Username { get; set; } = username;
    public string DisplayName { get; set; } = displayName;
    public string Role { get; set; } = role;
    public string PasswordHash { get; set; } = passwordHash;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record UserSummary(string Id, string Username, string DisplayName, string Role, bool IsActive, DateTimeOffset CreatedAtUtc);
public sealed record CreateUserRequest(string? Username, string? DisplayName, string? Password);
