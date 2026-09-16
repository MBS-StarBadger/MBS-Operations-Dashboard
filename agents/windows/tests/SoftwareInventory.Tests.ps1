# Windows PowerShell 5.1; loads functions only. No real registry/COM/HTTP calls.
$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../MBSRmmAgent.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Agent syntax validation failed' }
foreach ($definition in $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-Equal($actual,$expected,$label) { if ($actual -cne $expected) { throw "Assertion failed: $label" } }
$first=[pscustomobject]@{DisplayName=' Example App ';DisplayVersion='1.0';Publisher='Publisher';InstallDate='20260203';InstallLocation='C:\Example';source_view='registry64'}
$duplicate=[pscustomobject]@{DisplayName='example app';DisplayVersion='1.0';Publisher='publisher';source_view='registry32'}
$malformed=[pscustomobject]@{DisplayName='Other';DisplayVersion=@('bad');Publisher=123;InstallDate='20260230';InstallLocation=[byte[]]@(1,2);source_view='registry32'}
$apps=@(Convert-MBSSoftwareEntries @($first,$duplicate,$malformed,[pscustomobject]@{DisplayName=' '},[pscustomobject]@{DisplayName=123},$null))
Assert-Equal $apps.Count 2 'deduplication and nameless entries'
Assert-Equal $apps[0].display_name 'Example App' 'trimmed display name'
Assert-Equal $apps[0].source_views.Count 2 'both source views retained'
Assert-Equal $apps[0].install_date '2026-02-03' 'calendar date normalization'
foreach($field in @('display_version','publisher','install_date','install_location')) {
    if ($null -ne $apps[1][$field]) { throw "Malformed optional field must be unknown: $field" }
}
$long=[pscustomobject]@{DisplayName=('n'*400);DisplayVersion=('v'*200);Publisher=('p'*300);InstallLocation=('l'*600);source_view='registry64'}
$bounded=@(Convert-MBSSoftwareEntries @($long))[0]
Assert-Equal $bounded.display_name.Length 300 'bounded name'
Assert-Equal $bounded.display_version.Length 100 'bounded version'
Assert-Equal $bounded.publisher.Length 200 'bounded publisher'
Assert-Equal $bounded.install_location.Length 500 'bounded location'
function Get-MBSSoftwareRegistryEntries {
    if ($script:failRegistry) { throw 'Simulated denied registry access' }
    return $script:entries
}
$script:entries=@($first,$duplicate)
$wire=Get-MBSSoftwareInventory | ConvertTo-Json -Depth 6 | ConvertFrom-Json
Assert-Equal $wire.software_count 1 'deduplicated serialized count'
Assert-Equal $wire.installed_software[0].source_views.Count 2 'serialized views'
$script:entries=@()
$wire=Get-MBSSoftwareInventory | ConvertTo-Json -Depth 6 | ConvertFrom-Json
Assert-Equal $wire.software_count 0 'zero distinguished from unknown'
Assert-Equal $wire.installed_software.Count 0 'empty JSON array'
$script:entries=@(1..1001 | ForEach-Object { [pscustomobject]@{DisplayName="App $_";source_view='registry32'} })
$wire=Get-MBSSoftwareInventory
Assert-Equal $wire.software_status 'failed' 'excessive apps fail without partial snapshot'
if ($wire.ContainsKey('installed_software')) { throw 'Limit failure must preserve previous snapshot' }
$script:failRegistry=$true
$wire=Get-MBSSoftwareInventory
Assert-Equal $wire.software_status 'failed' 'registry failure reported'
foreach($field in @('software_count','installed_software','software_refreshed_at')) {
    if ($wire.ContainsKey($field)) { throw 'Registry failure must preserve snapshot' }
}
# Test actual normal hardware collection cannot invoke software or WUA.
function Get-MBSSoftwareInventory { $script:softwareCalls++; return $script:softwareTelemetry }
function Get-MBSWindowsUpdates { $script:updateCalls++; return @{update_scan_status='success'} }
function Get-MBSCimInventory { return $null }
function Get-MBSPrimaryIPv4 { return $null }
$script:softwareCalls=0; $script:updateCalls=0
$normal=Get-MBSInventory
Assert-Equal $script:softwareCalls 0 'normal inventory never collects software'
if ($normal.ContainsKey('installed_software')) { throw 'Normal inventory must omit software' }
function Get-MBSInventory { return @{hostname='PC';cpu_name='CPU'} }
function Invoke-RestMethod { param($Uri,$Method,$Headers); return [pscustomobject]@{job=[pscustomobject]@{id=1;job_type=$script:jobType}} }
function Send-MBSJobResult {
    param($Config,$JobId,$Status,$ResultCode,$ResultOutput,$ResultError)
    $script:events += $Status
    if ($script:rejectStart -and $Status -eq 'started') { throw 'Start rejected' }
}
function Send-MBSCheckIn { param($Config,$Inventory); $script:events+='checkin'; $script:sent=$Inventory }
$config=[pscustomobject]@{server_url='https://invalid.example';agent_id='test';token='test-only'}
foreach($type in @('inventory_refresh','windows_update_scan','software_inventory_refresh')) {
    $script:jobType=$type; $script:events=@(); $script:softwareCalls=0; $script:updateCalls=0
    $script:softwareTelemetry=@{software_status='success';software_count=0;installed_software=@()}
    Invoke-MBSNextJob $config
    Assert-Equal ($script:events -join ',') 'started,checkin,completed' 'job lifecycle'
    Assert-Equal $script:softwareCalls ([int]($type -eq 'software_inventory_refresh')) 'software only in its job'
    Assert-Equal $script:updateCalls ([int]($type -eq 'windows_update_scan')) 'WUA only in its job'
    Assert-Equal $script:sent.ContainsKey('installed_software') ($type -eq 'software_inventory_refresh') 'software fields omitted in other jobs'
}
$script:events=@(); $script:softwareTelemetry=@{software_status='failed';software_attempted_at='2026-09-16T12:00:00Z'}
Invoke-MBSNextJob $config
Assert-Equal ($script:events -join ',') 'started,checkin,failed' 'failed collection lifecycle'
if ($script:sent.ContainsKey('installed_software')) { throw 'Failed job must omit snapshot' }
$script:rejectStart=$true; $script:softwareCalls=0
try { Invoke-MBSNextJob $config } catch { }
Assert-Equal $script:softwareCalls 0 'no collection before acknowledged started transition'
Write-Host 'Software normalization, serialization and job dispatch checks passed (mock registry/HTTP).'
