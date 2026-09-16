# Windows PowerShell 5.1. Loads function definitions only; mocks CIM/HTTP/WUA/software.
$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../MBSRmmAgent.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Agent syntax validation failed' }
foreach ($definition in $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
$AgentVersion='test'; $InventoryDiagnostics=$false
function Assert-Equal($actual,$expected,$label) { if ($actual -cne $expected) { throw "Assertion failed: $label" } }
function Get-MBSPrimaryIPv4 { return $null }
function Get-CimInstance {
    param($ClassName,$Filter,$OperationTimeoutSec,$ErrorAction)
    switch ($ClassName) {
        'Win32_OperatingSystem' { return [pscustomobject]@{Caption='Windows';FreePhysicalMemory=4194304;SystemDrive='D:';LastBootUpTime=(Get-Date).AddDays(-2)} }
        'Win32_ComputerSystem' { return [pscustomobject]@{TotalPhysicalMemory=17179869184} }
        'Win32_Processor' { return [pscustomobject]@{LoadPercentage=$script:processorLoad;Name='CPU';NumberOfCores=4;NumberOfLogicalProcessors=8} }
        'Win32_LogicalDisk' {
            Assert-Equal $Filter "DeviceID='D:'" 'only Windows system volume queried'
            Assert-Equal $OperationTimeoutSec 5 'disk query bounded'
            if ($script:diskFailure) { throw 'Simulated access denied' }
            if ($script:freeUnknown) { return [pscustomobject]@{Size=107374182400;FreeSpace=$null} }
            return [pscustomobject]@{Size=107374182400;FreeSpace=21474836480}
        }
        default { return $null }
    }
}
function Invoke-RestMethod {
    param($Uri,$Method,$Headers,$ContentType,$Body)
    if ($Uri -like '*/jobs/next') { return [pscustomobject]@{job=[pscustomobject]@{id=42;job_type=$script:jobType}} }
    if ($Uri -like '*/checkin') { $script:wire=$Body | ConvertFrom-Json; return [pscustomobject]@{device=[pscustomobject]@{status='online'}} }
    if ($Uri -like '*/result') { $script:events+=($Body | ConvertFrom-Json).status; return }
    throw 'Unexpected request'
}
function Get-MBSWindowsUpdates { $script:wuaCalls++; return @{update_scan_status='success';update_pending_count=0;pending_updates=@()} }
function Get-MBSSoftwareInventory { $script:softwareCalls++; return @{software_status='success';software_count=0;installed_software=@()} }
$script:processorLoad=[uint16]40
$config=[pscustomobject]@{server_url='https://invalid.example';agent_id='test';token='test-only'}
$inventory=Get-MBSInventory
Send-MBSCheckIn -Config $config -Inventory $inventory | Out-Null
Assert-Equal $wire.cpu_utilization_percent 40 'serialized CPU'
Assert-Equal $wire.total_memory_bytes 17179869184 'reused memory total'
Assert-Equal $wire.memory_available_bytes 4294967296 'KiB converted to bytes'
Assert-Equal $wire.memory_utilization_percent 75 'derived memory utilization'
Assert-Equal $wire.system_drive 'D:' 'system volume identifier'
Assert-Equal $wire.system_drive_total_bytes 107374182400 'serialized capacity'
Assert-Equal $wire.system_drive_free_bytes 21474836480 'serialized free bytes'
Assert-Equal $wire.system_drive_utilization_percent 80 'derived disk utilization'
if (!$wire.health_snapshot_at -or !$wire.last_boot_at -or $wire.uptime_seconds -lt 172799) { throw 'Missing health/boot timestamps or uptime' }
# LT226: one complete processor object, native UInt16 sample, through the real inventory/wire path.
foreach ($load in @([uint16]8,[uint16]5,[uint16]0)) {
    $script:processorLoad=$load
    $single=Get-MBSInventory
    Send-MBSCheckIn -Config $config -Inventory $single | Out-Null
    Assert-Equal $wire.processor_count 1 'LT226 single processor retained'
    Assert-Equal $wire.cpu_utilization_percent ([double]$load) 'LT226 single CPU survives serialization'
}
$script:processorLoad=[uint16]40
foreach ($bad in @($null,-1,101,[double]::NaN,[double]::PositiveInfinity,[double]::NegativeInfinity,'8',$true)) {
    $cpu=Get-MBSCPUUtilization -Processors @([pscustomobject]@{LoadPercentage=$bad})
    if ($null -ne $cpu) { throw 'Invalid/unavailable CPU must remain unknown' }
}
if ($null -ne (Get-MBSCPUUtilization -Processors @())) { throw 'Empty CPU list must remain unknown' }
if ($null -ne (Get-MBSCPUUtilization -Processors @([pscustomobject]@{LoadPercentage=8},[pscustomobject]@{LoadPercentage=$null}))) { throw 'Incomplete socket data must remain unknown' }
if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    # Real native CIM instance adaptation, without querying or modifying Windows.
    foreach ($load in @([uint16]8,[uint16]5)) {
        $native=New-CimInstance -ClassName Win32_Processor -ClientOnly -Property @{LoadPercentage=$load;Name='LT226 test CPU'}
        $result=Get-MBSDeviceHealth -Inventory @{} -Processors @($native)
        Assert-Equal $result.cpu_utilization_percent ([double]$load) 'native single CIM instance'
    }
} else { Write-Host 'SKIP: native Windows CIM instance cases require Windows.' }
$script:freeUnknown=$true
$partial=Get-MBSInventory
Assert-Equal $partial.system_drive_total_bytes 107374182400 'capacity survives unavailable free bytes'
if ($null -ne $partial.system_drive_utilization_percent) { throw 'Percentage needs both capacities' }
$script:freeUnknown=$false
$script:diskFailure=$true
$partial=Get-MBSInventory
Assert-Equal $partial.cpu_utilization_percent 40 'CPU survives disk query failure'
Assert-Equal $partial.memory_utilization_percent 75 'memory survives disk query failure'
if ($null -ne $partial.system_drive_free_bytes) { throw 'Unavailable disk must be unknown' }
$script:diskFailure=$false
$health=Get-MBSDeviceHealth -Inventory @{total_memory_bytes=100} -OperatingSystem ([pscustomobject]@{FreePhysicalMemory=1;SystemDrive='D:'}) -Processors @([pscustomobject]@{LoadPercentage=$null})
if ($null -ne $health.cpu_utilization_percent -or $null -ne $health.memory_utilization_percent) { throw 'Invalid CPU/memory must be unknown' }
Assert-Equal $health.system_drive_utilization_percent 80 'disk survives other metric failures'
$health=Get-MBSDeviceHealth -Inventory @{total_memory_bytes=1024} -OperatingSystem ([pscustomobject]@{FreePhysicalMemory=0}) -Processors @([pscustomobject]@{LoadPercentage=0},[pscustomobject]@{LoadPercentage=100})
Assert-Equal $health.cpu_utilization_percent 50 'equal socket average'
Assert-Equal $health.memory_available_bytes 0 'zero available is valid'
Assert-Equal $health.memory_utilization_percent 100 'zero available means fully used'
foreach($type in @('inventory_refresh','windows_update_scan','software_inventory_refresh')) {
    $script:jobType=$type; $script:events=@(); $script:wuaCalls=0; $script:softwareCalls=0
    Invoke-MBSNextJob $config
    Assert-Equal ($script:events -join ',') 'started,completed' 'existing job lifecycle'
    Assert-Equal $wire.cpu_utilization_percent 40 'all jobs include health'
    if (!$wire.health_snapshot_at) { throw 'Job must include snapshot timestamp' }
    Assert-Equal $script:wuaCalls ([int]($type -eq 'windows_update_scan')) 'Windows Update collection isolated'
    Assert-Equal $script:softwareCalls ([int]($type -eq 'software_inventory_refresh')) 'software collection isolated'
}
function Get-MBSDeviceHealth { throw 'Unexpected health failure' }
$inventory=Get-MBSInventory
Send-MBSCheckIn -Config $config -Inventory $inventory | Out-Null
Assert-Equal $wire.total_memory_bytes 17179869184 'heartbeat/hardware survives complete health failure'
if ($inventory.ContainsKey('health_snapshot_at')) { throw 'Complete failure must omit health fields' }
Write-Host 'Device Health collection/serialization and check-in/job regression checks passed (mock CIM/HTTP).'
