param(
    [switch]$KeepBuildFiles,
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$driveRoot = [System.IO.Path]::GetPathRoot($sourceRoot)
$buildRoot = Join-Path $driveRoot ("LabShieldBuild-" + [Guid]::NewGuid().ToString('N'))
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

    $catalogueSeedDestination = Join-Path $buildRoot 'labshield-catalogue.db'
    $localCatalogueSource = Join-Path $sourceRoot 'lab-lms.db'
    $trackedCatalogueSeed = Join-Path $sourceRoot 'desktop\assets\labshield-catalogue.db'

    if (Test-Path -LiteralPath $localCatalogueSource) {
        # Developer builds use the latest local catalogue after stripping all
        # operational and clinical data. The source checkout already has its
        # dependencies in this path.
        & node (Join-Path $sourceRoot 'scripts\create-installation-catalogue.cjs') $localCatalogueSource $catalogueSeedDestination
        if ($LASTEXITCODE -ne 0) {
            throw 'Unable to create the LabShield catalogue-only installation seed.'
        }
    } elseif (Test-Path -LiteralPath $trackedCatalogueSeed) {
        # GitHub Actions deliberately has no live lab database. Use the
        # reviewed, catalogue-only seed committed for reproducible releases.
        Copy-Item -LiteralPath $trackedCatalogueSeed -Destination $catalogueSeedDestination
    } else {
        throw 'No sanitized LabShield installation catalogue is available.'
    }

    Push-Location $buildRoot
    Invoke-BuildCommand 'npm ci --ignore-scripts'
    Invoke-BuildCommand 'npm run desktop:rebuild-native'
    # Build both channels completely before publishing. Letting electron-builder
    # create a release while uploading assets in parallel can create duplicate
    # GitHub releases for the same tag and split server/client metadata.
    Invoke-BuildCommand 'npm run build:server-installer'
    Invoke-BuildCommand 'npm run build:client-installer'
    Pop-Location

    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    $releaseAssets = @(
        (Get-ChildItem -LiteralPath (Join-Path $buildRoot "release-server-$packageVersion") -Filter 'LabShield-Server-Setup-*.exe' -File),
        (Get-ChildItem -LiteralPath (Join-Path $buildRoot "release-server-$packageVersion") -Filter 'LabShield-Server-Setup-*.exe.blockmap' -File),
        (Get-Item -LiteralPath (Join-Path $buildRoot "release-server-$packageVersion\server.yml")),
        (Get-ChildItem -LiteralPath (Join-Path $buildRoot "release-client-$packageVersion") -Filter 'LabShield-Client-Setup-*.exe' -File),
        (Get-ChildItem -LiteralPath (Join-Path $buildRoot "release-client-$packageVersion") -Filter 'LabShield-Client-Setup-*.exe.blockmap' -File),
        (Get-Item -LiteralPath (Join-Path $buildRoot "release-client-$packageVersion\client.yml"))
    ) | Where-Object { $_ }

    if ($releaseAssets.Count -ne 6) {
        throw 'The complete server and client update asset set was not produced.'
    }

    $publishedAssetPaths = @()
    foreach ($asset in $releaseAssets) {
        $destination = Join-Path $releaseRoot $asset.Name
        if (Test-Path -LiteralPath $destination) {
            throw "The release asset already exists and was not overwritten: $destination"
        }
        Copy-Item -LiteralPath $asset.FullName -Destination $destination
        $publishedAssetPaths += $destination
    }

    if ($Publish) {
        & gh release create "v$packageVersion" @publishedAssetPaths --title $packageVersion --verify-tag --latest
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to publish GitHub Release v$packageVersion."
        }
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
