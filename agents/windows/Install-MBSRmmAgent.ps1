param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $true)]
    [string]$AgentId,

    [Parameter(Mandatory = $true)]
    [string]$AgentToken,

    [string]$InstallDir = "C:\ProgramData\MBS-RMM"
)

$ErrorActionPreference = "Stop"

$ConfigPath = Join-Path $InstallDir "agent.json"
$AgentPath = Join-Path $InstallDir "MBSRmmAgent.ps1"

Write-Host "Installing MBS RMM Agent..."

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$config = @{
    server_url = $ServerUrl.TrimEnd("/")
    agent_id    = $AgentId
    token       = $AgentToken
}

$config |
    ConvertTo-Json |
    Set-Content -Path $ConfigPath -Encoding UTF8

$scriptSource = Join-Path $PSScriptRoot "MBSRmmAgent.ps1"

if (-not (Test-Path $scriptSource)) {
    throw "MBSRmmAgent.ps1 was not found next to the installer."
}

Copy-Item `
    -Path $scriptSource `
    -Destination $AgentPath `
    -Force

Write-Host "Securing configuration..."

$acl = Get-Acl $InstallDir
$acl.SetAccessRuleProtection($true, $false)

foreach ($rule in @($acl.Access)) {
    $acl.RemoveAccessRule($rule) | Out-Null
}

$systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "SYSTEM",
    "FullControl",
    "ContainerInherit,ObjectInherit",
    "None",
    "Allow"
)

$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "BUILTIN\Administrators",
    "FullControl",
    "ContainerInherit,ObjectInherit",
    "None",
    "Allow"
)

$acl.AddAccessRule($systemRule)
$acl.AddAccessRule($adminRule)

Set-Acl -Path $InstallDir -AclObject $acl

Write-Host "Running initial MBS RMM check-in..."

& powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $AgentPath `
    -ConfigPath $ConfigPath

Write-Host "Creating scheduled heartbeat task..."

$TaskName = "MBS RMM Agent Heartbeat"

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$AgentPath`" -ConfigPath `"$ConfigPath`""

$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null

Write-Host ""
Write-Host "MBS RMM Agent installed successfully."
Write-Host "Install directory: $InstallDir"
Write-Host "Heartbeat task: $TaskName"
Write-Host "Heartbeat interval: 60 seconds"
