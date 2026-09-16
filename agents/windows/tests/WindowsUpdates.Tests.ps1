# Windows PowerShell 5.1; function-only loading with mocked COM (no network or updates).
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../MBSRmmAgent.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Agent syntax validation failed' }
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-Equal($actual, $expected, $label) {
    if ($actual -cne $expected) { throw "Assertion failed: $label" }
}
$script:result = [pscustomobject]@{ResultCode=2; Updates=@()}
$script:reboot = $false
function New-Object {
    param($ComObject)
    if ($ComObject -eq 'Microsoft.Update.SystemInfo') {
        if ($script:failReboot) { throw 'Unavailable' }
        return [pscustomobject]@{RebootRequired=$script:reboot}
    }
    if ($ComObject -ne 'Microsoft.Update.Session') { throw 'Unexpected COM object' }
    if ($script:failScan) { throw 'Unavailable' }
    $searcher = [pscustomobject]@{}
    $searcher | Add-Member ScriptMethod Search {
        param($criteria)
        Assert-Equal $criteria 'IsInstalled=0 and IsHidden=0' 'read-only criteria'
        return $script:result
    }
    $session = [pscustomobject]@{Searcher=$searcher}
    $session | Add-Member ScriptMethod CreateUpdateSearcher { return $this.Searcher }
    return $session
}
$wire = Get-MBSWindowsUpdates | ConvertTo-Json -Depth 6 | ConvertFrom-Json
Assert-Equal $wire.update_pending_count 0 'zero count'
Assert-Equal $wire.pending_updates.Count 0 'empty JSON array'
Assert-Equal $wire.update_reboot_required $false 'known false'
$script:result.Updates = @([pscustomobject]@{
    Title='Test update'; Identity=[pscustomobject]@{UpdateID='stable-id';RevisionNumber=2}
    KBArticleIDs=@('123'); Categories=@([pscustomobject]@{Name='Localized security';CategoryID='0fa1201d-4330-4fa8-8ae9-b877473b6441';Type='UpdateClassification'})
    Type=1; MsrcSeverity='Critical'; IsDownloaded=$false; IsInstalled=$false
    InstallationBehavior=[pscustomobject]@{RebootBehavior=2}
})
$script:reboot = $true
$wire = Get-MBSWindowsUpdates | ConvertTo-Json -Depth 6 | ConvertFrom-Json
Assert-Equal $wire.update_security_count 1 'language-independent classification'
Assert-Equal $wire.update_driver_count 0 'software type'
Assert-Equal $wire.pending_updates[0].update_id 'stable-id' 'identity JSON'
Assert-Equal $wire.pending_updates[0].reboot_may_be_required $true 'potential reboot'
Assert-Equal $wire.update_reboot_required $true 'known true'
$script:failReboot = $true
$wire = Get-MBSWindowsUpdates
if ($null -ne $wire.update_reboot_required) { throw 'Reboot failure must be unknown' }
$script:result.Updates = @($script:result.Updates[0]) * 201
$wire = Get-MBSWindowsUpdates
Assert-Equal $wire.update_pending_count 201 'total includes omitted details'
Assert-Equal $wire.pending_updates.Count 200 'detail cap'
$script:result.ResultCode = 3
$wire = Get-MBSWindowsUpdates
if ($wire.ContainsKey('pending_updates') -or $wire.ContainsKey('update_refreshed_at')) { throw 'Partial scan must preserve snapshot' }
$script:failScan = $true
$wire = Get-MBSWindowsUpdates
Assert-Equal $wire.update_scan_status 'failed' 'failure reported'
if ($wire.ContainsKey('update_pending_count')) { throw 'Failed scan must preserve count' }
Write-Host 'Windows Update collection/serialization checks passed (mock COM).'

# Dispatch regressions: inventory refresh never calls WUA; scan job sends telemetry
# only after the started acknowledgment, and a failed scan still sends failure telemetry.
function Get-MBSInventory { return @{hostname='test';cpu_name='CPU'} }
function Get-MBSWindowsUpdates {
    $script:scanCalls++
    return $script:telemetry
}
function Invoke-RestMethod {
    param($Uri, $Method, $Headers)
    return [pscustomobject]@{job=[pscustomobject]@{id=42;job_type=$script:jobType}}
}
function Send-MBSJobResult {
    param($Config,$JobId,$Status,$ResultCode,$ResultOutput,$ResultError)
    $script:events += $Status
    if ($Status -eq 'started' -and $script:rejectStart) { throw 'Start rejected' }
}
function Send-MBSCheckIn {
    param($Config,$Inventory)
    $script:events += 'checkin'
    $script:sent = $Inventory
}
$config=[pscustomobject]@{server_url='https://invalid.example';agent_id='test';token='test-only'}
$script:jobType='inventory_refresh'; $script:scanCalls=0; $script:events=@()
Invoke-MBSNextJob $config
Assert-Equal $script:scanCalls 0 'hardware job never scans WUA'
Assert-Equal ($script:events -join ',') 'started,checkin,completed' 'hardware lifecycle'
Assert-Equal $script:sent.cpu_name 'CPU' 'hardware check-in retained'
$script:jobType='windows_update_scan'; $script:events=@()
$script:telemetry=@{update_scan_status='success';update_pending_count=0;pending_updates=@()}
Invoke-MBSNextJob $config
Assert-Equal $script:scanCalls 1 'scan job invokes WUA'
Assert-Equal ($script:events -join ',') 'started,checkin,completed' 'scan lifecycle'
Assert-Equal $script:sent.update_pending_count 0 'scan telemetry sent'
$script:events=@(); $script:telemetry=@{update_scan_status='failed';update_attempted_at='2026-09-16T12:00:00Z'}
Invoke-MBSNextJob $config
Assert-Equal ($script:events -join ',') 'started,checkin,failed' 'failed scan lifecycle'
if ($script:sent.ContainsKey('pending_updates')) { throw 'Failure must not overwrite prior successful details' }
$script:rejectStart=$true; $script:scanCalls=0; $script:events=@()
try { Invoke-MBSNextJob $config } catch { }
Assert-Equal $script:scanCalls 0 'unacknowledged job never scans'
Assert-Equal ($script:events -join ',') 'started' 'no check-in after rejected start'
Write-Host 'Separate inventory/update job dispatch checks passed (mock COM and HTTP).'
