# Compatible with Windows PowerShell 5.1 syntax. Uses fixture functions/CIM, no native queries.
$ErrorActionPreference='Stop'
$probe=Join-Path $PSScriptRoot 'Inspect-DeviceHealth.ps1'
$fixture=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName()+'.ps1')
$source=@'
# Top-level agent execution must never run during diagnosis.
throw 'Unexpected agent main execution'
function Get-MBSAgentConfig { throw 'Unexpected credentials access' }
function Send-MBSCheckIn { throw 'Unexpected check-in' }
function Invoke-MBSNextJob { throw 'Unexpected job polling' }
function Get-MBSDeviceHealth {
    param($Inventory,$OperatingSystem,[object[]]$Processors)
    $health=@{cpu_utilization_percent=$null}
    try { throw 'sensitive details must not be printed' } catch { }
    try { throw 'second suppressed failure' } catch {
    }
    $health.cpu_utilization_percent=[double]$Processors[0].LoadPercentage
    return $health
}
function Get-MBSInventory {
    $processors=@(Get-CimInstance Win32_Processor)
    return Get-MBSDeviceHealth -Inventory @{} -OperatingSystem $null -Processors $processors
}
'@
function Get-CimInstance {
    param($ClassName,$OperationTimeoutSec)
    if ($ClassName -eq 'Win32_Processor') {
        return [pscustomobject]@{LoadPercentage=[uint16]8;CimInstanceProperties=@{LoadPercentage=[pscustomobject]@{Value=[uint16]8}}}
    }
    return [pscustomobject]@{TotalPhysicalMemory=17179869184}
}
function Invoke-RestMethod { throw 'Unexpected HTTP request' }
function Invoke-WebRequest { throw 'Unexpected HTTP request' }
try {
    [IO.File]::WriteAllText($fixture,$source)
    $output=@(& $probe -AgentPath $fixture)
    $json=$output -join "`n"
    $result=$json | ConvertFrom-Json
    if ($result.DirectCollectorCPU -ne 8 -or $result.InventoryCPU -ne 8 -or $result.SerializedCPU -ne 8) { throw 'CPU must survive generated function parsing and local serialization' }
    if ($result.CaughtExceptionTypes.Count -ne 4) { throw 'All legacy empty catches must be instrumented literally' }
    if ($json -match 'sensitive|second suppressed') { throw 'Raw exception message leaked' }
    if ($result.ProcessorCount -ne 1 -or $result.AgentSHA256 -ne (Get-FileHash $fixture -Algorithm SHA256).Hash) { throw 'Diagnostic evidence missing' }
    # Explicitly reproduce the former replacement-string bug on the fixture:
    $broken=$source -replace 'catch\s*\{\s*\}', 'catch { $script:healthCatchTypes += $_.Exception.GetType().Name }'
    $tokens=$null; $errors=$null
    [void][System.Management.Automation.Language.Parser]::ParseInput($broken,[ref]$tokens,[ref]$errors)
    if ($errors.Count -eq 0) { throw 'Expected reproduction of old replacement-string corruption' }
    Write-Host 'Diagnostic generated-source/local-serialization regression passed (mock CIM; no HTTP/config/check-in/jobs).'
} finally {
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture }
}
