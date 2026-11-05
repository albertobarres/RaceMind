using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace RaceMind.Api;

public class R2TelemetryBootstrapper : IDisposable
{
    private const long MaximumArchiveBytes = 512 * 1024 * 1024;
    private const long MaximumExpandedBytes = 512 * 1024 * 1024;
    private const int MaximumEntryCount = 5_000;
    private readonly IConfiguration _configuration;
    private readonly ILogger<R2TelemetryBootstrapper> _logger;
    private readonly HttpClient _client;
    private readonly bool _ownsClient;

    public R2TelemetryBootstrapper(IConfiguration configuration, ILogger<R2TelemetryBootstrapper> logger, HttpClient? client = null)
    {
        _configuration = configuration;
        _logger = logger;
        _client = client ?? new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        _ownsClient = client is null;
    }

    public async Task<string?> DownloadAndExtractIfConfiguredAsync(CancellationToken cancellationToken = default)
    {
        if (!_configuration.GetValue<bool>("TelemetryArchive:DownloadEnabled")) return null;

        var archiveUrl = _configuration["TelemetryArchive:Url"];
        if (!string.IsNullOrWhiteSpace(archiveUrl))
            return await DownloadFromUrlAsync(archiveUrl, cancellationToken);

        var endpoint = _configuration["TelemetryArchive:Endpoint"];
        var bucket = _configuration["TelemetryArchive:Bucket"];
        var objectKey = _configuration["TelemetryArchive:ObjectKey"];
        var accessKeyId = _configuration["TelemetryArchive:AccessKeyId"];
        var secretAccessKey = _configuration["TelemetryArchive:SecretAccessKey"];
        var values = new[] { endpoint, bucket, objectKey, accessKeyId, secretAccessKey };
        if (values.All(string.IsNullOrWhiteSpace)) return null;
        if (values.Any(string.IsNullOrWhiteSpace))
            throw new InvalidOperationException("Configura Endpoint, Bucket, ObjectKey, AccessKeyId y SecretAccessKey para descargar el archivo de telemetría privado.");

        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var endpointUri) || endpointUri.Scheme != Uri.UriSchemeHttps ||
            endpointUri.UserInfo.Length > 0 || endpointUri.Query.Length > 0 || endpointUri.Fragment.Length > 0)
            throw new InvalidOperationException("TelemetryArchive:Endpoint debe ser un endpoint HTTPS válido de R2 o configura TelemetryArchive:Url con una URL HTTPS de descarga directa.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(accessKeyId!, "^[A-Za-z0-9]+$", System.Text.RegularExpressions.RegexOptions.CultureInvariant) ||
            !System.Text.RegularExpressions.Regex.IsMatch(secretAccessKey!, "^[A-Za-z0-9+/=]+$", System.Text.RegularExpressions.RegexOptions.CultureInvariant))
            throw new InvalidOperationException("El Access Key ID o Secret Access Key de R2 contiene caracteres no válidos.");
        if (bucket!.Contains('/') || bucket.Contains('\\') || objectKey!.StartsWith('/') || objectKey.Contains('\\'))
            throw new InvalidOperationException("El bucket o la clave del objeto R2 no son válidos.");

        var encodedKey = string.Join('/', objectKey.Split('/').Select(Uri.EscapeDataString));
        var requestUri = new Uri(endpointUri, $"{Uri.EscapeDataString(bucket)}/{encodedKey}");
        if (!string.Equals(requestUri.Host, endpointUri.Host, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("El endpoint R2 produjo un destino de descarga no válido.");
        using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
        var now = DateTimeOffset.UtcNow;
        var amzDate = now.ToString("yyyyMMdd'T'HHmmss'Z'", System.Globalization.CultureInfo.InvariantCulture);
        const string region = "auto";
        const string service = "s3";
        var dateStamp = now.ToString("yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture);
        var payloadHash = Convert.ToHexString(SHA256.HashData([])).ToLowerInvariant();
        const string signedHeaders = "host;x-amz-content-sha256;x-amz-date";
        var canonicalHeaders = $"host:{requestUri.Host}\nx-amz-content-sha256:{payloadHash}\nx-amz-date:{amzDate}\n";
        var canonicalRequest = $"GET\n{requestUri.AbsolutePath}\n\n{canonicalHeaders}\n{signedHeaders}\n{payloadHash}";
        var scope = $"{dateStamp}/{region}/{service}/aws4_request";
        var stringToSign = $"AWS4-HMAC-SHA256\n{amzDate}\n{scope}\n{Sha256Hex(Encoding.UTF8.GetBytes(canonicalRequest))}";
        var signingKey = DeriveSigningKey(secretAccessKey!, dateStamp, region, service);
        var signature = Convert.ToHexString(HmacSha256(signingKey, stringToSign)).ToLowerInvariant();
        request.Headers.TryAddWithoutValidation("x-amz-content-sha256", payloadHash);
        request.Headers.TryAddWithoutValidation("x-amz-date", amzDate);
        request.Headers.TryAddWithoutValidation("Authorization",
            $"AWS4-HMAC-SHA256 Credential={accessKeyId}/{scope}, SignedHeaders={signedHeaders}, Signature={signature}");

        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("R2 telemetry download failed with HTTP {StatusCode}.", (int)response.StatusCode);
            throw new InvalidOperationException($"No se pudo descargar el paquete privado de telemetría desde R2 (HTTP {(int)response.StatusCode}). Comprueba endpoint, bucket, clave y token de solo lectura.");
        }

        if (response.Content.Headers.ContentLength is > MaximumArchiveBytes)
            throw new InvalidDataException("El paquete de telemetría supera el límite de tamaño de descarga de 512 MiB.");

        return await DownloadResponseAndExtractAsync(response, cancellationToken);
    }

    private async Task<string> DownloadFromUrlAsync(string archiveUrl, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(archiveUrl, UriKind.Absolute, out var archiveUri) || archiveUri.Scheme != Uri.UriSchemeHttps ||
            archiveUri.UserInfo.Length > 0 || archiveUri.Fragment.Length > 0)
            throw new InvalidOperationException("TelemetryArchive:Url debe ser una URL HTTPS válida y no puede incluir credenciales en el host.");

        using var response = await _client.GetAsync(archiveUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Telemetry archive download failed with HTTP {StatusCode}.", (int)response.StatusCode);
            throw new InvalidOperationException($"No se pudo descargar el paquete de telemetría (HTTP {(int)response.StatusCode}). Comprueba la URL y que permita la descarga directa.");
        }
        if (response.RequestMessage?.RequestUri is { } finalUri && finalUri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException("La descarga del paquete terminó en una URL que no usa HTTPS.");
        if (response.Content.Headers.ContentLength is > MaximumArchiveBytes)
            throw new InvalidDataException("El paquete de telemetría supera el límite de tamaño de descarga de 512 MiB.");

        return await DownloadResponseAndExtractAsync(response, cancellationToken);
    }

    private async Task<string> DownloadResponseAndExtractAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {

        var archiveRoot = Path.Combine(Path.GetTempPath(), "racemind-telemetry");
        var downloadPath = Path.Combine(Path.GetTempPath(), $"racemind-telemetry-{Guid.NewGuid():N}.zip");
        var stagingRoot = Path.Combine(Path.GetTempPath(), $"racemind-telemetry-{Guid.NewGuid():N}");
        try
        {
            await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var destination = new FileStream(downloadPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    total += read;
                    if (total > MaximumArchiveBytes) throw new InvalidDataException("El paquete de telemetría supera el límite de tamaño de descarga de 512 MiB.");
                    await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
            }

            Directory.CreateDirectory(stagingRoot);
            ValidateAndExtract(downloadPath, stagingRoot);
            if (Directory.Exists(archiveRoot)) Directory.Delete(archiveRoot, recursive: true);
            Directory.Move(stagingRoot, archiveRoot);
            _logger.LogInformation("Verified and extracted private telemetry archive to {TelemetryRoot}.", archiveRoot);
            return archiveRoot;
        }
        finally
        {
            if (File.Exists(downloadPath)) File.Delete(downloadPath);
            if (Directory.Exists(stagingRoot)) Directory.Delete(stagingRoot, recursive: true);
        }
    }

    private static void ValidateAndExtract(string archivePath, string destinationRoot)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        if (archive.Entries.Count is 0 or > MaximumEntryCount)
            throw new InvalidDataException($"El ZIP debe incluir entre 1 y {MaximumEntryCount} entradas.");

        long expandedBytes = 0;
        var files = new Dictionary<string, string>(StringComparer.Ordinal);
        var rootWithSeparator = Path.GetFullPath(destinationRoot) + Path.DirectorySeparatorChar;
        foreach (var entry in archive.Entries)
        {
            // ZIPs created on Windows can carry backslashes as separators. Normalize before
            // path validation/extraction so Linux does not create filenames containing '\'.
            var normalizedArchivePath = entry.FullName.Replace('\\', '/');
            var relativePath = normalizedArchivePath.Replace('/', Path.DirectorySeparatorChar);
            if (Path.IsPathRooted(relativePath) || relativePath.Split(Path.DirectorySeparatorChar).Any(part => part is ".." or "."))
                throw new InvalidDataException("El ZIP contiene una ruta no segura.");

            var fullPath = Path.GetFullPath(Path.Combine(destinationRoot, relativePath));
            if (!fullPath.StartsWith(rootWithSeparator, StringComparison.Ordinal))
                throw new InvalidDataException("El ZIP contiene una ruta fuera del directorio destino.");

            if (normalizedArchivePath.EndsWith('/'))
            {
                Directory.CreateDirectory(fullPath);
                continue;
            }

            expandedBytes += entry.Length;
            if (expandedBytes > MaximumExpandedBytes) throw new InvalidDataException("El ZIP expandido supera el límite de 512 MiB.");
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
            using (var input = entry.Open())
            using (var output = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                input.CopyTo(output);
            files.Add(normalizedArchivePath, fullPath);
        }

        if (!files.TryGetValue("demo-manifest.json", out var manifestPath))
            throw new InvalidDataException("El ZIP no contiene demo-manifest.json.");
        using var manifest = JsonDocument.Parse(File.ReadAllText(manifestPath));
        var root = manifest.RootElement;
        if (!TryGetPropertyIgnoreCase(root, "schemaVersion", out var schemaVersion) || schemaVersion.GetInt32() != 1 ||
            !TryGetPropertyIgnoreCase(root, "files", out var manifestFiles) || manifestFiles.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("La versión o estructura del manifiesto del ZIP no es válida.");

        var verifiedPaths = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in manifestFiles.EnumerateArray())
        {
            var relativePath = GetRequiredProperty(item, "path").GetString()?.Replace('\\', '/');
            var expectedBytes = GetRequiredProperty(item, "bytes").GetInt64();
            var expectedHash = GetRequiredProperty(item, "sha256").GetString();
            if (string.IsNullOrWhiteSpace(relativePath) || string.IsNullOrWhiteSpace(expectedHash) ||
                !files.TryGetValue(relativePath, out var filePath) || !verifiedPaths.Add(relativePath))
                throw new InvalidDataException("El manifiesto contiene una ruta ausente o duplicada.");
            var info = new FileInfo(filePath);
            if (info.Length != expectedBytes)
                throw new InvalidDataException($"El tamaño de {relativePath} no coincide con el manifiesto.");
            using var stream = File.OpenRead(filePath);
            var actualHash = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
            if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(actualHash), Encoding.ASCII.GetBytes(expectedHash.ToLowerInvariant())))
                throw new InvalidDataException($"El hash SHA-256 de {relativePath} no coincide con el manifiesto.");
        }

        if (verifiedPaths.Count == 0) throw new InvalidDataException("El manifiesto de telemetría está vacío.");
    }

    private static string Sha256Hex(byte[] value) => Convert.ToHexString(SHA256.HashData(value)).ToLowerInvariant();

    private static JsonElement GetRequiredProperty(JsonElement element, string propertyName) =>
        TryGetPropertyIgnoreCase(element, propertyName, out var value)
            ? value
            : throw new InvalidDataException($"El manifiesto no contiene el campo requerido '{propertyName}'.");

    private static bool TryGetPropertyIgnoreCase(JsonElement element, string propertyName, out JsonElement value)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static byte[] DeriveSigningKey(string secret, string date, string region, string service)
    {
        var dateKey = HmacSha256(Encoding.UTF8.GetBytes($"AWS4{secret}"), date);
        var regionKey = HmacSha256(dateKey, region);
        var serviceKey = HmacSha256(regionKey, service);
        return HmacSha256(serviceKey, "aws4_request");
    }

    private static byte[] HmacSha256(byte[] key, string value)
    {
        using var hmac = new HMACSHA256(key);
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(value));
    }

    public void Dispose()
    {
        if (_ownsClient) _client.Dispose();
    }
}
