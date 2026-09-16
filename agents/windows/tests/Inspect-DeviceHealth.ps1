# Read-only live diagnosis. Loads functions from the DEPLOYED agent, never its main block,
# configuration or credentials. Serialization is local; no check-in/job/HTTP code is loaded.
param([Parameter(Mandatory=$true)][string]$AgentPath)
$ErrorActionPreference='Stop'
$InventoryDiagnostics=$false
$AgentVersion='diagnostic-only'
$tokens=$null; $parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($AgentPath,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Agent parse failed (details suppressed)' }
$script:healthCatchTypes=@()
$readOnlyFunctions=@('Get-MBSPrimaryIPv4','Get-MBSCimInventory','Convert-MBSText',
    'Convert-MBSPositiveNumber','Convert-MBSDate','Get-MBSCPUUtilization',
    'Get-MBSDeviceHealth','Get-MBSInventory')
foreach ($definition in $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)) {
    if ($readOnlyFunctions -notcontains $definition.Name) { continue }
    $source=$definition.Extent.Text
    if ($definition.Name -eq 'Get-MBSDeviceHealth') {
        # Reveal only exception TYPE names from legacy silent catches, not message/objects/stack.
        # A .NET replacement STRING interprets $_ as the entire input, even when
        # PowerShell single-quotes it. MatchEvaluator returns literal text on PS 5.1 too.
        $source=[regex]::Replace($source, 'catch\s*\{\s*\}',
            [System.Text.RegularExpressions.MatchEvaluator]{
                param($match)
                return 'catch { $script:healthCatchTypes += $_.Exception.GetType().Name }'
            })
    }
    . ([scriptblock]::Create($source))
}
$cpus=@(Get-CimInstance Win32_Processor -OperationTimeoutSec 10)
$os=Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 10
$computer=Get-CimInstance Win32_ComputerSystem -OperationTimeoutSec 10
$direct=Get-MBSDeviceHealth -Inventory @{total_memory_bytes=$computer.TotalPhysicalMemory} -OperatingSystem $os -Processors $cpus
$inventory=Get-MBSInventory
# Match check-in JSON serialization without calling any transport/configuration function.
$wire=$inventory | ConvertTo-Json -Depth 6 | ConvertFrom-Json
[pscustomobject]@{
    AgentSHA256=(Get-FileHash -LiteralPath $AgentPath -Algorithm SHA256).Hash
    PowerShellVersion=$PSVersionTable.PSVersion.ToString()
    ProcessorCount=$cpus.Count
    NativeLoads=@($cpus | ForEach-Object { $_.CimInstanceProperties['LoadPercentage'].Value })
    DirectCollectorCPU=$direct.cpu_utilization_percent
    InventoryCPU=$inventory.cpu_utilization_percent
    SerializedCPU=$wire.cpu_utilization_percent
    CaughtExceptionTypes=@($script:healthCatchTypes)
} | ConvertTo-Json -Depth 3
