param(
    [string]$ServerUrl,
    [switch]$ResetConnection,
    [switch]$DiscoverOnly
)

$configDirectory = Join-Path $env:LOCALAPPDATA "LabLMS"
$configPath = Join-Path $configDirectory "connection.json"
$discoveryPort = 32480
$discoveryRequest = @{ type = "lab-lms-discover" } | ConvertTo-Json -Compress

function Test-LabServer {
    param([string]$Url)

    if (-not $Url) { return $false }
    try {
        $health = Invoke-RestMethod -Uri "$Url/health" -TimeoutSec 3
        return [bool]($health.ok -and $health.service -eq "lab-lms")
    } catch {
        return $false
    }
}

function Find-LabServers {
    $foundServers = @{}
    $client = [System.Net.Sockets.UdpClient]::new(0)
    try {
        $client.EnableBroadcast = $true
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($discoveryRequest)
        $broadcast = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Broadcast, $discoveryPort)
        [void]$client.Send($bytes, $bytes.Length, $broadcast)

        $deadline = [DateTime]::UtcNow.AddSeconds(3)
        while ([DateTime]::UtcNow -lt $deadline) {
            if (-not $client.Available) {
                Start-Sleep -Milliseconds 80
                continue
            }

            $remote = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 0)
            $reply = $client.Receive([ref]$remote)
            try {
                $payload = [System.Text.Encoding]::UTF8.GetString($reply) | ConvertFrom-Json
                if ($payload.type -eq "lab-lms-server" -and $payload.service -eq "lab-lms" -and $payload.httpPort) {
                    $url = "http://$($remote.Address):$($payload.httpPort)"
                    if (Test-LabServer $url) {
                        $foundServers[$url] = $url
                    }
                }
            } catch {
                # Ignore other UDP traffic on this port.
            }
        }
    } finally {
        $client.Dispose()
    }

    return @($foundServers.Values | Sort-Object)
}

if ($ResetConnection) {
    $ServerUrl = $null
    if (Test-Path -LiteralPath $configPath) {
        Remove-Item -LiteralPath $configPath -Force
    }
}

if (-not $ServerUrl -and (Test-Path -LiteralPath $configPath)) {
    try {
        $savedUrl = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).serverUrl
        if (Test-LabServer $savedUrl) {
            $ServerUrl = $savedUrl
        }
    } catch {
        $ServerUrl = $null
    }
}

if (-not $ServerUrl) {
    Write-Host "Searching the local network for the Lab LMS server..."
    $servers = Find-LabServers

    if ($servers.Count -eq 1) {
        $ServerUrl = $servers[0]
        Write-Host "Found Lab LMS server at $ServerUrl"
    } elseif ($servers.Count -gt 1) {
        Write-Host "Multiple Lab LMS servers were found:"
        for ($index = 0; $index -lt $servers.Count; $index++) {
            Write-Host "  [$($index + 1)] $($servers[$index])"
        }
        $selection = Read-Host "Choose a server number"
        $selectedNumber = 0
        if ([int]::TryParse([string]$selection, [ref]$selectedNumber)) {
            $selectedIndex = $selectedNumber - 1
        } else {
            $selectedIndex = -1
        }
        if ($selectedIndex -ge 0 -and $selectedIndex -lt $servers.Count) {
            $ServerUrl = $servers[$selectedIndex]
        }
    }
}

if ($DiscoverOnly) {
    if ($ServerUrl) {
        Write-Output $ServerUrl
        exit 0
    }
    Write-Error "No Lab LMS server was found on this LAN."
    exit 1
}

if (-not $ServerUrl) {
    $ServerUrl = Read-Host "Server was not found automatically. Enter the server address (for example http://192.168.1.20:3000)"
}

$ServerUrl = $ServerUrl.Trim().TrimEnd("/")
if ($ServerUrl -notmatch "^https?://[^/]+(?::\d+)?$") {
    Write-Error "Enter a valid server address, for example http://192.168.1.20:3000"
    exit 1
}

if (-not (Test-LabServer $ServerUrl)) {
    Write-Error "Unable to reach Lab LMS at $ServerUrl. Ensure the server is running and both PCs are on the same LAN."
    exit 1
}

New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
@{ serverUrl = $ServerUrl; savedAt = (Get-Date).ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
Start-Process "$ServerUrl/login.html"
