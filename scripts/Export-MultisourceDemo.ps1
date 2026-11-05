param(
    [string] $TelemetryRoot,
    [string] $OutputArchive
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($TelemetryRoot)) {
    $workspaceParent = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $TelemetryRoot = Get-ChildItem -LiteralPath $workspaceParent -Directory |
        Where-Object { $_.Name.StartsWith('Telemet', [System.StringComparison]::OrdinalIgnoreCase) } |
        Select-Object -First 1 -ExpandProperty FullName
}
if ([string]::IsNullOrWhiteSpace($OutputArchive)) {
    $OutputArchive = Join-Path $PSScriptRoot '..\artifacts\racemind-multisource-expanded-2026.zip'
}
if (-not (Test-Path -LiteralPath $TelemetryRoot -PathType Container)) {
    throw "Telemetry folder not found at '$TelemetryRoot'. Pass -TelemetryRoot with its full path."
}

$sourceRoot = (Resolve-Path -LiteralPath $TelemetryRoot).Path
$archivePath = [System.IO.Path]::GetFullPath($OutputArchive)
$archiveDirectory = [System.IO.Path]::GetDirectoryName($archivePath)
if (-not (Test-Path -LiteralPath $archiveDirectory)) {
    New-Item -ItemType Directory -Path $archiveDirectory -Force | Out-Null
}

# Include two complete F1 races, all available MotoGP workbook events, two
# representative Assetto Corsa sessions and every Albaida karting CSV session.
$sessionRelativeRoots = @(
    'Coches/F1/2026/Barcelona Grand Prix/Race',
    'Coches/F1/2026/Monaco Grand Prix/Race',
    'Simuladores/Assetto Corsa/Spa-Francorchamps/Corvette C7R',
    'Simuladores/Assetto Corsa/Laguna Seca/Audi R8 LMS 2016'
)
$relativeFiles = [System.Collections.Generic.List[string]]::new()
$sessionSourceRoots = @{}
$sourcePrefix = $sourceRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
foreach ($relativeRoot in $sessionRelativeRoots) {
    $sessionSourceRoot = Join-Path $sourceRoot ($relativeRoot -replace '/', [System.IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $sessionSourceRoot -PathType Container)) {
        throw "Missing required demo session directory: $sessionSourceRoot"
    }
    $sessionSourceRoots[$relativeRoot] = $sessionSourceRoot
    foreach ($file in Get-ChildItem -LiteralPath $sessionSourceRoot -File -Recurse) {
        $relativeFiles.Add($file.FullName.Substring($sourcePrefix.Length).Replace('\', '/'))
    }
}

$motoGpRoot = Join-Path $sourceRoot 'Motos/MotoGP/2026'
$motoGpFiles = @(Get-ChildItem -LiteralPath $motoGpRoot -Filter '*_motogp_full.xlsx' -File)
if ($motoGpFiles.Count -eq 0) { throw "No MotoGP workbooks found at $motoGpRoot" }
foreach ($file in $motoGpFiles) {
    $relativeFiles.Add($file.FullName.Substring($sourcePrefix.Length).Replace('\', '/'))
}

$kartingRoot = Join-Path $sourceRoot 'Karting/Albaida'
$kartingFiles = @(Get-ChildItem -LiteralPath $kartingRoot -Filter '*.csv' -File)
if ($kartingFiles.Count -eq 0) { throw "No karting CSV sessions found at $kartingRoot" }
foreach ($file in $kartingFiles) {
    $relativeFiles.Add($file.FullName.Substring($sourcePrefix.Length).Replace('\', '/'))
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) "racemind-multisource-$([guid]::NewGuid().ToString('N'))"
try {
    $files = foreach ($relativePath in $relativeFiles) {
        $sourcePath = Join-Path $sourceRoot ($relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Missing required demo file: $sourcePath"
        }

        $destinationPath = Join-Path $stagingRoot ($relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)
        New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($destinationPath)) -Force | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
        $file = Get-Item -LiteralPath $destinationPath
        [PSCustomObject]@{
        path = $relativePath
        bytes = [long]$file.Length
        sha256 = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }

    $manifest = [PSCustomObject]@{
        schemaVersion = 1
        dataset = 'RaceMind expanded multi-source demo: complete F1 Barcelona and Monaco 2026 races, all available MotoGP workbooks, Assetto Corsa Spa and Laguna Seca, all Albaida karting sessions'
        generatedUtc = [DateTime]::UtcNow.ToString('O')
        files = @($files)
        sourceNote = 'Selected files for private demo; verify source terms and attribution before sharing.'
    }
    $manifestPath = Join-Path $stagingRoot 'demo-manifest.json'
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    if (-not (Test-Path -LiteralPath $archiveDirectory)) {
        New-Item -ItemType Directory -Path $archiveDirectory -Force | Out-Null
    }

    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($stagingRoot, $archivePath,
        [System.IO.Compression.CompressionLevel]::Optimal, $false)

    $archive = Get-Item -LiteralPath $archivePath
    [PSCustomObject]@{
        Archive = $archive.FullName
        ArchiveBytes = [long]$archive.Length
        SourceBytes = [long](($files | Measure-Object -Property bytes -Sum).Sum)
        DataFileCount = $files.Count
        BarcelonaDriverCount = @(Get-ChildItem -LiteralPath $sessionSourceRoots['Coches/F1/2026/Barcelona Grand Prix/Race'] -Directory).Count
        BarcelonaTelemetryLapFileCount = @($files | Where-Object { $_.path -match '^Coches/F1/2026/Barcelona Grand Prix/Race/[^/]+/\d+_tel\.json$' }).Count
        MonacoDriverCount = @(Get-ChildItem -LiteralPath $sessionSourceRoots['Coches/F1/2026/Monaco Grand Prix/Race'] -Directory).Count
        MonacoTelemetryLapFileCount = @($files | Where-Object { $_.path -match '^Coches/F1/2026/Monaco Grand Prix/Race/[^/]+/\d+_tel\.json$' }).Count
        MotoGpWorkbookCount = $motoGpFiles.Count
        KartingSessionCount = $kartingFiles.Count
    } | ConvertTo-Json -Depth 6
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
}
