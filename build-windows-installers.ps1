param(
    [switch]$KeepBuildFiles
)

$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$driveRoot = [System.IO.Path]::GetPathRoot($sourceRoot)
$buildRoot = Join-Path $driveRoot ("LabLMSBuild-" + [Guid]::NewGuid().ToString('N'))
$releaseRoot = Join-Path $sourceRoot 'release'
$packageVersion = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).version

function Invoke-BuildCommand {
    param([string]$Command)

    Write-Host "`n> $Command" -ForegroundColor Cyan
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Build command failed: $Command"
    }
}

try {
    # Electron's native SQLite rebuild does not support source paths containing
    # spaces. Build from a clean, same-drive staging directory instead.
    New-Item -ItemType Directory -Path $buildRoot | Out-Null
    & robocopy $sourceRoot $buildRoot /E /XD node_modules .git tmp backups .agents .sixth release release-server release-client 'old app data in image form' /XF '*.db' '*.db-journal' '*.sqlite' | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "Unable to prepare the desktop build folder (robocopy exit code $LASTEXITCODE)."
    }

    Push-Location $buildRoot
    Invoke-BuildCommand 'npm ci --ignore-scripts'
    Invoke-BuildCommand 'npm run desktop:rebuild-native'
    Invoke-BuildCommand 'npm run build:server-installer'
    Invoke-BuildCommand 'npm run build:client-installer'
    Pop-Location

    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    $installers = @(
        (Get-ChildItem -LiteralPath (Join-Path $buildRoot "release-server-$packageVersion") -Filter 'Lab-LMS-Server-Setup-*.exe' -File),
        (Get-ChildItem -LiteralPath (Join-Path $buildRoot "release-client-$packageVersion") -Filter 'Lab-LMS-Client-Setup-*.exe' -File)
    ) | Where-Object { $_ }

    if ($installers.Count -ne 2) {
        throw 'The server and client installers were not both produced.'
    }

    foreach ($installer in $installers) {
        $destination = Join-Path $releaseRoot $installer.Name
        if (Test-Path -LiteralPath $destination) {
            throw "The installer already exists and was not overwritten: $destination"
        }
        Copy-Item -LiteralPath $installer.FullName -Destination $destination
    }

    Write-Host "`nInstallers are ready in: $releaseRoot" -ForegroundColor Green
} finally {
    if ((Get-Location).Path -eq $buildRoot) {
        Pop-Location
    }

    if ($KeepBuildFiles) {
        Write-Host "Build files kept at: $buildRoot" -ForegroundColor Yellow
    } elseif (Test-Path -LiteralPath $buildRoot) {
        Remove-Item -LiteralPath $buildRoot -Recurse -Force
    }
}
