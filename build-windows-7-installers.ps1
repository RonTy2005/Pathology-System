param(
    [switch]$KeepBuildFiles,
    [string]$ReleaseVersion
)

$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$driveRoot = [System.IO.Path]::GetPathRoot($sourceRoot)
$releaseRoot = Join-Path $sourceRoot 'release'
$sourcePackageVersion = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).version
$packageVersion = if ($ReleaseVersion) { $ReleaseVersion } else { $sourcePackageVersion }
$keptBuildRoots = @()

if ($packageVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
    throw "Invalid release version: $packageVersion"
}

function Invoke-BuildCommand {
    param([string]$Command)

    Write-Host "`n> $Command" -ForegroundColor Cyan
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Build command failed: $Command"
    }
}

function Build-Windows7Architecture {
    param(
        [ValidateSet('x64', 'ia32')]
        [string]$Architecture
    )

    $architectureLabel = if ($Architecture -eq 'ia32') { 'x86' } else { 'x64' }
    $buildRoot = Join-Path $driveRoot ("LabShieldWin7Build-$architectureLabel-" + [Guid]::NewGuid().ToString('N'))
    $script:keptBuildRoots += $buildRoot

    try {
        New-Item -ItemType Directory -Path $buildRoot | Out-Null
        & robocopy $sourceRoot $buildRoot /E /XD node_modules .git tmp backups .agents .sixth release release-server release-client 'old app data in image form' /XF '*.db' '*.db-journal' '*.sqlite' | Out-Null
        if ($LASTEXITCODE -gt 7) {
            throw "Unable to prepare the Windows 7 $architectureLabel build folder (robocopy exit code $LASTEXITCODE)."
        }

        $catalogueSeedDestination = Join-Path $buildRoot 'labshield-catalogue.db'
        $localCatalogueSource = Join-Path $sourceRoot 'lab-lms.db'
        $trackedCatalogueSeed = Join-Path $sourceRoot 'desktop\assets\labshield-catalogue.db'
        if (Test-Path -LiteralPath $localCatalogueSource) {
            & node (Join-Path $sourceRoot 'scripts\create-installation-catalogue.cjs') $localCatalogueSource $catalogueSeedDestination
            if ($LASTEXITCODE -ne 0) {
                throw 'Unable to create the LabShield catalogue-only installation seed.'
            }
        } elseif (Test-Path -LiteralPath $trackedCatalogueSeed) {
            Copy-Item -LiteralPath $trackedCatalogueSeed -Destination $catalogueSeedDestination
        } else {
            throw 'No sanitized LabShield installation catalogue is available.'
        }

        Push-Location $buildRoot
        try {
            if ($packageVersion -ne $sourcePackageVersion) {
                Invoke-BuildCommand "npm version $packageVersion --no-git-tag-version"
            }
            Invoke-BuildCommand 'npm ci --ignore-scripts'
            # PDF.js lists a Node canvas implementation as optional. LabShield
            # renders PDFs in Chromium and does not use that native module.
            Invoke-BuildCommand 'npm install --save-exact --ignore-scripts --omit=optional electron@22.3.27 express@4.21.2 sqlite3@5.1.6 pdfjs-dist@3.11.174'

            $env:LAB_LMS_WINDOWS_FAMILY = 'win7'
            $env:LAB_LMS_BUILD_ARCH = $Architecture
            Invoke-BuildCommand 'npm run build:server-installer'
            Invoke-BuildCommand 'npm run build:client-installer'
        } finally {
            Remove-Item Env:LAB_LMS_WINDOWS_FAMILY -ErrorAction SilentlyContinue
            Remove-Item Env:LAB_LMS_BUILD_ARCH -ErrorAction SilentlyContinue
            Pop-Location
        }

        $serverOutput = Join-Path $buildRoot "release-server-$packageVersion-win7-$architectureLabel"
        $clientOutput = Join-Path $buildRoot "release-client-$packageVersion-win7-$architectureLabel"
        $releaseAssets = @(
            (Get-ChildItem -LiteralPath $serverOutput -Filter 'LabShield-Server-Setup-*.exe' -File),
            (Get-ChildItem -LiteralPath $serverOutput -Filter 'LabShield-Server-Setup-*.exe.blockmap' -File),
            (Get-Item -LiteralPath (Join-Path $serverOutput "server-win7-$architectureLabel.yml")),
            (Get-ChildItem -LiteralPath $clientOutput -Filter 'LabShield-Client-Setup-*.exe' -File),
            (Get-ChildItem -LiteralPath $clientOutput -Filter 'LabShield-Client-Setup-*.exe.blockmap' -File),
            (Get-Item -LiteralPath (Join-Path $clientOutput "client-win7-$architectureLabel.yml"))
        ) | Where-Object { $_ }

        if ($releaseAssets.Count -ne 6) {
            throw "The complete Windows 7 $architectureLabel asset set was not produced."
        }

        New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
        foreach ($asset in $releaseAssets) {
            Copy-Item -LiteralPath $asset.FullName -Destination (Join-Path $releaseRoot $asset.Name) -Force
        }
    } finally {
        if ((Get-Location).Path -eq $buildRoot) {
            Pop-Location
        }
        if (-not $KeepBuildFiles -and (Test-Path -LiteralPath $buildRoot)) {
            Remove-Item -LiteralPath $buildRoot -Recurse -Force
        }
    }
}

Build-Windows7Architecture -Architecture 'x64'
Build-Windows7Architecture -Architecture 'ia32'

if ($KeepBuildFiles) {
    $keptBuildRoots | ForEach-Object { Write-Host "Build files kept at: $_" -ForegroundColor Yellow }
}
Write-Host "`nWindows 7 x64 and x86 installers are ready in: $releaseRoot" -ForegroundColor Green
