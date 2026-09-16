# Run with Windows PowerShell 5.1. Loads function definitions only; never contacts a server.
$ErrorActionPreference = 'Stop'
$agentPath = Join-Path $PSScriptRoot '../MBSRmmAgent.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($agentPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Agent syntax validation failed' }
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
$AgentVersion = 'test'
$InventoryDiagnostics = $false
function Get-MBSPrimaryIPv4 { return $null }
function Get-CimInstance {
    param($ClassName, $OperationTimeoutSec, $ErrorAction)
    switch ($ClassName) {
        'Win32_OperatingSystem' { [pscustomobject]@{ Caption='Windows 11'; Version='10.0'; OSArchitecture='64-bit'; BuildNumber='26100'; LastBootUpTime=[datetime]'2026-01-01' } }
        'Win32_ComputerSystem' { [pscustomobject]@{ Manufacturer='Dell Inc.'; Model='Dell Pro Rugged 14 RB14250'; TotalPhysicalMemory=[long]16597598208; UserName=$null } }
        'Win32_BIOS' { [pscustomobject]@{ Manufacturer='Dell Inc.'; SerialNumber='TEST-SERIAL'; SMBIOSBIOSVersion='1.2'; ReleaseDate=[datetime]'2025-01-01' } }
        'Win32_Processor' { [pscustomobject]@{ Manufacturer='GenuineIntel'; Name='Intel(R) Core(TM) Ultra 5 125U'; NumberOfCores=12; NumberOfLogicalProcessors=14 } }
        'Win32_ComputerSystemProduct' { [pscustomobject]@{ UUID='12345678-1234-1234-1234-123456789abc' } }
        'Win32_PhysicalMemory' { [pscustomobject]@{ Capacity=[long]17179869184; Manufacturer='Test'; PartNumber='PN'; Speed=5600; ConfiguredClockSpeed=5600; BankLabel='BANK 0'; DeviceLocator='DIMM 0' } }
        'Win32_DiskDrive' {
            if ($script:failDisk) { throw 'Simulated unavailable disk category' }
            [pscustomobject]@{ Model='Test disk'; Manufacturer=$script:diskManufacturer; SerialNumber='TEST-DISK'; Size=[long]512000000000; MediaType='Fixed hard disk media'; InterfaceType='SCSI' }
        }
    }
}
function Invoke-RestMethod {
    param($Uri, $Method, $Headers, $ContentType, $Body)
    $script:wire = $Body | ConvertFrom-Json
}
function Assert-Equal($actual, $expected, $label) {
    if ($actual -ne $expected) { throw "Inventory assertion failed: $label" }
}
$sample = @{ cpu_name = $null }
$sample.cpu_name = 'CPU'
Assert-Equal $sample['cpu_name'] 'CPU' 'hashtable dot assignment'
$script:diskManufacturer=' Disk Maker '
$inventory = Get-MBSInventory
Send-MBSCheckIn -Config ([pscustomobject]@{server_url='https://invalid.example';agent_id='test';token='test-only'}) -Inventory $inventory
Assert-Equal $wire.cpu_manufacturer 'GenuineIntel' 'serialized CPU manufacturer'
Assert-Equal $wire.cpu_name 'Intel(R) Core(TM) Ultra 5 125U' 'serialized CPU name'
Assert-Equal $wire.processor_count 1 'serialized sockets'
Assert-Equal $wire.core_count 12 'serialized cores'
Assert-Equal $wire.logical_processor_count 14 'serialized threads'
Assert-Equal $wire.total_memory_bytes 16597598208 'serialized RAM'
Assert-Equal $wire.bios_version '1.2' 'serialized BIOS'
Assert-Equal $wire.os_build '26100' 'serialized OS build'
Assert-Equal $wire.system_uuid '12345678-1234-1234-1234-123456789abc' 'serialized UUID'
Assert-Equal $wire.memory_modules[0].capacity_bytes 17179869184 'serialized DIMM'
Assert-Equal $wire.physical_disks[0].manufacturer 'Disk Maker' 'disk manufacturer from existing CIM query'
Assert-Equal $wire.physical_disks[0].capacity_bytes 512000000000 'serialized disk'
if (!$wire.last_boot_at -or !$wire.bios_release_date -or $wire.uptime_seconds -le 0) { throw 'Missing serialized date/uptime' }
$script:diskManufacturer='x'*201
$boundedInventory=Get-MBSInventory
Assert-Equal $boundedInventory.physical_disks[0].manufacturer.Length 200 'bounded disk manufacturer'
$script:failDisk = $true
$inventory = Get-MBSInventory
Assert-Equal $inventory.cpu_name 'Intel(R) Core(TM) Ultra 5 125U' 'CPU survives disk failure'
Assert-Equal $inventory.total_memory_bytes 16597598208 'RAM survives disk failure'
if ($null -ne $inventory.physical_disks) { throw 'Disk failure should produce null' }
Write-Host 'Hardware collection/JSON regression checks passed (mock CIM and HTTP).'
