$isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

# Run once as Administrator on the central server PC.
# It allows only private-LAN traffic for the Lab LMS web server and its
# automatic LAN discovery reply service.

$tcpRuleName = "Lab LMS Server - TCP 3000"
$udpRuleName = "Lab LMS Server - UDP Discovery 32480"

Get-NetFirewallRule -DisplayName $tcpRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName $udpRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule -DisplayName $tcpRuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private | Out-Null
New-NetFirewallRule -DisplayName $udpRuleName -Direction Inbound -Action Allow -Protocol UDP -LocalPort 32480 -Profile Private | Out-Null

Write-Host "Lab LMS LAN firewall rules are ready for Private networks."
