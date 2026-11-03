using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using RaceMind.Api;

namespace RaceMind.UnitTests;

public sealed class R2TelemetryBootstrapperTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "racemind-r2-bootstrap", Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task DownloadAndExtractIfConfiguredAsync_ReturnsNullWhenNoR2SettingsExist()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection().Build();
        using var bootstrapper = new R2TelemetryBootstrapper(configuration, NullLogger<R2TelemetryBootstrapper>.Instance);

        Assert.Null(await bootstrapper.DownloadAndExtractIfConfiguredAsync());
    }

    [Fact]
    public async Task DownloadAndExtractIfConfiguredAsync_IsDisabledUnlessExplicitlyEnabled()
    {
        var archivePath = CreateValidArchive();
        using var handler = new StaticArchiveHandler(await File.ReadAllBytesAsync(archivePath));
        using var client = new HttpClient(handler);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["TelemetryArchive:Endpoint"] = "https://account.r2.cloudflarestorage.com",
            ["TelemetryArchive:Bucket"] = "demo-bucket",
            ["TelemetryArchive:ObjectKey"] = "demo/archive.zip",
            ["TelemetryArchive:AccessKeyId"] = "AccessKey123456",
            ["TelemetryArchive:SecretAccessKey"] = "SecretKey1234567890",
            ["TelemetryArchive:DownloadEnabled"] = "false"
        }).Build();
        using var bootstrapper = new R2TelemetryBootstrapper(configuration, NullLogger<R2TelemetryBootstrapper>.Instance, client);

        Assert.Null(await bootstrapper.DownloadAndExtractIfConfiguredAsync());
        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task DownloadAndExtractIfConfiguredAsync_VerifiesManifestAndExtractsSafeFiles()
    {
        var archivePath = CreateValidArchive();
        using var handler = new StaticArchiveHandler(await File.ReadAllBytesAsync(archivePath));
        using var client = new HttpClient(handler);
        using var bootstrapper = CreateBootstrapper(client);

        var root = await bootstrapper.DownloadAndExtractIfConfiguredAsync();

        Assert.Equal(Path.Combine(Path.GetTempPath(), "racemind-telemetry"), root);
        Assert.Equal("demo telemetry", await File.ReadAllTextAsync(Path.Combine(root!, "Coches", "demo.json")));
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task DownloadAndExtractIfConfiguredAsync_RejectsInvalidManifestHashes()
    {
        var archivePath = CreateValidArchive(hashOverride: new string('0', 64));
        using var handler = new StaticArchiveHandler(await File.ReadAllBytesAsync(archivePath));
        using var bootstrapper = CreateBootstrapper(new HttpClient(handler));

        await Assert.ThrowsAsync<InvalidDataException>(() => bootstrapper.DownloadAndExtractIfConfiguredAsync());
    }

    [Fact]
    public async Task DownloadAndExtractIfConfiguredAsync_RejectsZipSlipPaths()
    {
        var archivePath = CreateValidArchive(includeUnsafePath: true);
        using var handler = new StaticArchiveHandler(await File.ReadAllBytesAsync(archivePath));
        using var bootstrapper = CreateBootstrapper(new HttpClient(handler));

        await Assert.ThrowsAsync<InvalidDataException>(() => bootstrapper.DownloadAndExtractIfConfiguredAsync());
        Assert.False(File.Exists(Path.Combine(_directory, "escaped.txt")));
    }

    private R2TelemetryBootstrapper CreateBootstrapper(HttpClient client)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["TelemetryArchive:Endpoint"] = "https://account.r2.cloudflarestorage.com",
            ["TelemetryArchive:Bucket"] = "demo-bucket",
            ["TelemetryArchive:ObjectKey"] = "demo/archive.zip",
            ["TelemetryArchive:AccessKeyId"] = "AccessKey123456",
            ["TelemetryArchive:SecretAccessKey"] = "SecretKey1234567890",
            ["TelemetryArchive:DownloadEnabled"] = "true"
        }).Build();
        return new R2TelemetryBootstrapper(configuration, NullLogger<R2TelemetryBootstrapper>.Instance, client);
    }

    private string CreateValidArchive(string? hashOverride = null, bool includeUnsafePath = false)
    {
        Directory.CreateDirectory(_directory);
        var archivePath = Path.Combine(_directory, "demo.zip");
        var fileBytes = Encoding.UTF8.GetBytes("demo telemetry");
        var hash = hashOverride ?? Convert.ToHexString(SHA256.HashData(fileBytes)).ToLowerInvariant();
        using var archive = System.IO.Compression.ZipFile.Open(archivePath, System.IO.Compression.ZipArchiveMode.Create);
        var dataEntry = archive.CreateEntry("Coches/demo.json");
        using (var stream = dataEntry.Open()) stream.Write(fileBytes);
        var manifestEntry = archive.CreateEntry("demo-manifest.json");
        using (var stream = manifestEntry.Open())
        using (var writer = new StreamWriter(stream))
            writer.Write($"{{\"schemaVersion\":1,\"files\":[{{\"path\":\"Coches/demo.json\",\"bytes\":{fileBytes.Length},\"sha256\":\"{hash}\"}}]}}");
        if (includeUnsafePath)
        {
            using var stream = archive.CreateEntry("../escaped.txt").Open();
            stream.Write("escape"u8);
        }
        return archivePath;
    }

    public void Dispose()
    {
        var extractedRoot = Path.Combine(Path.GetTempPath(), "racemind-telemetry");
        if (Directory.Exists(extractedRoot)) Directory.Delete(extractedRoot, recursive: true);
        if (Directory.Exists(_directory)) Directory.Delete(_directory, recursive: true);
    }

    private sealed class StaticArchiveHandler(byte[] archiveBytes) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal("account.r2.cloudflarestorage.com", request.RequestUri!.Host);
            var authorization = request.Headers.GetValues("Authorization").Single();
            Assert.StartsWith("AWS4-HMAC-SHA256 Credential=AccessKey123456/", authorization);
            AssertSignedGetRequest(request, authorization);
            var response = new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(archiveBytes)
            };
            return Task.FromResult(response);
        }

        private static void AssertSignedGetRequest(HttpRequestMessage request, string authorization)
        {
            const string region = "auto";
            const string service = "s3";
            const string signedHeaders = "host;x-amz-content-sha256;x-amz-date";
            const string secret = "SecretKey1234567890";
            var amzDate = request.Headers.GetValues("x-amz-date").Single();
            var payloadHash = Convert.ToHexString(SHA256.HashData([])).ToLowerInvariant();
            Assert.Equal(payloadHash, request.Headers.GetValues("x-amz-content-sha256").Single());
            var dateStamp = amzDate[..8];
            var scope = $"{dateStamp}/{region}/{service}/aws4_request";
            var canonicalHeaders = $"host:{request.RequestUri!.Host}\nx-amz-content-sha256:{payloadHash}\nx-amz-date:{amzDate}\n";
            var canonicalRequest = $"GET\n{request.RequestUri.AbsolutePath}\n\n{canonicalHeaders}\n{signedHeaders}\n{payloadHash}";
            var hashOfCanonicalRequest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonicalRequest))).ToLowerInvariant();
            var stringToSign = $"AWS4-HMAC-SHA256\n{amzDate}\n{scope}\n{hashOfCanonicalRequest}";
            var dateKey = Hmac(Encoding.UTF8.GetBytes($"AWS4{secret}"), dateStamp);
            var regionKey = Hmac(dateKey, region);
            var serviceKey = Hmac(regionKey, service);
            var signingKey = Hmac(serviceKey, "aws4_request");
            var expectedSignature = Convert.ToHexString(Hmac(signingKey, stringToSign)).ToLowerInvariant();
            var signatureMatch = Regex.Match(authorization, @"Signature=([a-f0-9]{64})$", RegexOptions.CultureInvariant);
            Assert.True(signatureMatch.Success);
            Assert.Equal(expectedSignature, signatureMatch.Groups[1].Value);
        }

        private static byte[] Hmac(byte[] key, string value)
        {
            using var hmac = new HMACSHA256(key);
            return hmac.ComputeHash(Encoding.UTF8.GetBytes(value));
        }
    }
}
