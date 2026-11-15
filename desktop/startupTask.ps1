param(
    [ValidateSet('Register', 'Remove', 'Validate')][string]$Mode = 'Register',
    [Parameter(Mandatory = $true)][string]$ExecutablePath,
    [ValidateSet('server', 'client')][string]$AppMode = 'client'
)

$ErrorActionPreference = 'Stop'
# Windows 7 can ship PowerShell 2, which has no ConvertTo-Json cmdlet.
function Write-StartupResult($value) {
    Add-Type -AssemblyName System.Web.Extensions
    $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    Write-Output ($serializer.Serialize($value))
}
try {
    $productName = if ($AppMode -eq 'server') { 'LabShield Server' } else { 'LabShield' }
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    function Test-StartupUser($userId) {
        if ($userId -eq $currentSid) { return $true }
        # Some Windows versions return an account name rather than its SID.
        try {
            $account = New-Object Security.Principal.NTAccount -ArgumentList $userId
            return $account.Translate([Security.Principal.SecurityIdentifier]).Value -eq $currentSid
        } catch { return $false }
    }
    $taskName = "$productName - Automatic startup - $currentSid"
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $folder = $scheduler.GetFolder('\')
    $expectedPath = [IO.Path]::GetFullPath($ExecutablePath)

    if ($Mode -eq 'Remove') {
        # Uninstall only tasks belonging to this product AND this exact install.
        # An elevated server uninstaller may run under another Windows account.
        foreach ($task in $folder.GetTasks(1)) {
            if ($task.Name -notlike "$productName - Automatic startup - S-1-*") { continue }
            if ($task.Definition.Actions.Count -ne 1) { continue }
            $action = $task.Definition.Actions.Item(1)
            if ($action.Type -eq 0 -and [IO.Path]::GetFullPath($action.Path) -eq $expectedPath) {
                $folder.DeleteTask($task.Name, 0)
            }
        }
        Write-StartupResult @{ removed = $true }
        exit 0
    }

    if (-not (Test-Path -LiteralPath $expectedPath -PathType Leaf)) { throw 'The installed LabShield executable was not found.' }
    $definition = $scheduler.NewTask(0)
    $definition.RegistrationInfo.Description = "$productName opens visibly when this Windows user signs in."
    # InteractiveToken: same logged-in user's data and visible desktop, no password.
    $definition.Principal.UserId = $currentSid
    $definition.Principal.LogonType = 3
    $definition.Principal.RunLevel = 0
    $definition.Settings.Enabled = $true
    $definition.Settings.StartWhenAvailable = $true
    $definition.Settings.DisallowStartIfOnBatteries = $false
    $definition.Settings.StopIfGoingOnBatteries = $false
    $definition.Settings.RunOnlyIfNetworkAvailable = $false
    $definition.Settings.RunOnlyIfIdle = $false
    $definition.Settings.AllowDemandStart = $true
    $definition.Settings.MultipleInstances = 2
    $definition.Settings.ExecutionTimeLimit = 'PT0S'
    $definition.Settings.RestartInterval = 'PT1M'
    $definition.Settings.RestartCount = 3
    $trigger = $definition.Triggers.Create(9)
    $trigger.UserId = $currentSid
    $trigger.Enabled = $true
    $trigger.Delay = 'PT15S'
    $action = $definition.Actions.Create(0)
    $action.Path = $expectedPath
    $action.Arguments = '--autostart'
    $action.WorkingDirectory = [IO.Path]::GetDirectoryName($expectedPath)

    if ($Mode -eq 'Validate') {
        # TASK_VALIDATE_ONLY checks the definition without creating a task.
        $null = $folder.RegisterTaskDefinition($taskName, $definition, 1, $currentSid, $null, 3)
        Write-StartupResult @{ validated = $true }
        exit 0
    }
    $null = $folder.RegisterTaskDefinition($taskName, $definition, 6, $currentSid, $null, 3)
    $registered = $folder.GetTask($taskName)
    $actual = $registered.Definition
    $valid = $registered.Enabled -and (Test-StartupUser $actual.Principal.UserId) -and
        $actual.Principal.LogonType -eq 3 -and $actual.Principal.RunLevel -eq 0 -and
        $actual.Actions.Count -eq 1 -and $actual.Actions.Item(1).Path -eq $expectedPath -and
        $actual.Actions.Item(1).Arguments -eq '--autostart' -and
        $actual.Actions.Item(1).WorkingDirectory -eq [IO.Path]::GetDirectoryName($expectedPath) -and
        $actual.Triggers.Count -eq 1 -and $actual.Triggers.Item(1).Type -eq 9 -and
        (Test-StartupUser $actual.Triggers.Item(1).UserId)
    if (-not $valid) { throw 'Windows did not retain the requested sign-in task settings.' }
    Write-StartupResult @{ configured = $true; taskName = $taskName; lastTaskResult = $registered.LastTaskResult }
} catch {
    Write-StartupResult @{ configured = $false; error = $_.Exception.Message }
    exit 1
}
