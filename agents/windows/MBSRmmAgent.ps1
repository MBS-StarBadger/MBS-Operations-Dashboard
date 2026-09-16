param(
    [string]$ConfigPath = "C:\ProgramData\MBS-RMM\agent.json",
    [switch]$InventoryDiagnostics
)

$ErrorActionPreference = "Stop"

$AgentVersion = "0.1.0"

function Get-MBSAgentConfig {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Agent configuration not found: $Path"
    }

    $config = Get-Content $Path -Raw | ConvertFrom-Json

    if (-not $config.server_url) {
        throw "server_url missing from agent configuration"
    }

    if (-not $config.agent_id) {
        throw "agent_id missing from agent configuration"
    }

    if (-not $config.token) {
        throw "token missing from agent configuration"
    }

    return $config
}

function Get-MBSPrimaryIPv4 {
    try {
        $address = Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.AddressState -eq "Preferred"
            } |
            Sort-Object InterfaceMetric |
            Select-Object -First 1

        return $address.IPAddress
    }
    catch {
        return $null
    }
}

function Get-MBSCimInventory {
    param([string]$ClassName)
    try { Get-CimInstance -ClassName $ClassName -OperationTimeoutSec 10 -ErrorAction Stop }
    catch {
        if ($InventoryDiagnostics) { Write-Warning "Inventory collection failed for $ClassName (details suppressed)." }
        return $null
    }
}

function Convert-MBSText {
    param($Value)
    if ($null -eq $Value) { return $null }
    $text = ([string]$Value).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return $text
}

function Convert-MBSPositiveNumber {
    param($Value)
    if ($null -eq $Value -or $Value -le 0) { return $null }
    return [long]$Value
}

function Convert-MBSDate {
    param($Value)
    if ($null -eq $Value) { return $null }
    try {
        $date = [datetime]$Value
        if ($date.Year -lt 1980 -or $date -gt (Get-Date)) { return $null }
        return $date.ToUniversalTime().ToString("o")
    } catch { return $null }
}

function Get-MBSCPUUtilization {
    param([object[]]$Processors)
    $stage = 'no processors'
    try {
        if ($null -eq $Processors -or $Processors.Count -eq 0) { throw 'Unavailable sample' }
        [double]$sum = 0
        [int]$count = 0
        foreach ($processor in $Processors) {
            $stage = 'processor property unavailable'
            # Read the native CIM property once; do not depend on repeated adapted property access.
            if ($processor -is [Microsoft.Management.Infrastructure.CimInstance]) {
                $property = $processor.CimInstanceProperties['LoadPercentage']
                if ($null -eq $property) { throw 'Unavailable sample' }
                $raw = $property.Value
            } else {
                $raw = $processor.LoadPercentage
            }
            if ($null -eq $raw) { throw 'Unavailable sample' }
            $stage = 'non-numeric processor sample'
            if (-not ($raw -is [byte] -or $raw -is [sbyte] -or $raw -is [int16] -or $raw -is [uint16] -or
                $raw -is [int32] -or $raw -is [uint32] -or $raw -is [int64] -or $raw -is [uint64] -or
                $raw -is [single] -or $raw -is [double] -or $raw -is [decimal])) { throw 'Invalid sample' }
            [double]$load = $raw
            $stage = 'processor sample outside valid range'
            if ([double]::IsNaN($load) -or [double]::IsInfinity($load) -or $load -lt 0 -or $load -gt 100) { throw 'Invalid sample' }
            $sum += $load
            $count++
        }
        $stage = 'processor average unavailable'
        if ($count -eq 0) { throw 'Unavailable sample' }
        return [math]::Round([double]($sum / $count), 2)
    } catch {
        # Only fixed stage names are logged, never CIM objects or raw exception messages.
        if ($InventoryDiagnostics) { Write-Warning "CPU health unavailable: $stage." }
        return $null
    }
}

# Reuses normal inventory's OS/CPU/memory/boot reads; only the system volume needs another query.
function Get-MBSDeviceHealth {
    param([hashtable]$Inventory, $OperatingSystem, [object[]]$Processors)
    $health = @{
        health_snapshot_at = (Get-Date).ToUniversalTime().ToString('o')
        cpu_utilization_percent = $null
        memory_available_bytes = $null
        memory_utilization_percent = $null
        system_drive = $null
        system_drive_total_bytes = $null
        system_drive_free_bytes = $null
        system_drive_utilization_percent = $null
    }
    # WMI LoadPercentage is an existing last-second sample. Equal socket mean, no new scan/delay.
    $health['cpu_utilization_percent'] = Get-MBSCPUUtilization -Processors $Processors
    try {
        # FreePhysicalMemory is KiB; total_memory_bytes is existing physical RAM inventory.
        if ($null -ne $OperatingSystem.FreePhysicalMemory) {
            $available = [decimal]$OperatingSystem.FreePhysicalMemory * 1024
            $total = $Inventory.total_memory_bytes
            if ($available -ge 0 -and $available -le 9007199254740991 -and ($null -eq $total -or $available -le $total)) {
                $health.memory_available_bytes = [long]$available
                if ($total -gt 0) { $health.memory_utilization_percent = [math]::Round(100 * (1 - [double]$available / [double]$total), 2) }
            }
        }
    } catch { }
    try {
        $drive = [string]$OperatingSystem.SystemDrive
        if ($drive -cmatch '^[A-Za-z]:$') {
            $health.system_drive = $drive.ToUpperInvariant()
            $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$drive'" -OperationTimeoutSec 5 -ErrorAction Stop
            if ($null -ne $disk.Size) {
                $total = [decimal]$disk.Size
                if ($total -ge 0 -and $total -le 9007199254740991) { $health.system_drive_total_bytes = [long]$total }
            }
            if ($null -ne $disk.FreeSpace) {
                $free = [decimal]$disk.FreeSpace
                $total = $health.system_drive_total_bytes
                if ($free -ge 0 -and $free -le 9007199254740991 -and ($null -eq $total -or $free -le $total)) {
                    $health.system_drive_free_bytes = [long]$free
                    if ($total -gt 0) { $health.system_drive_utilization_percent = [math]::Round(100 * (1 - [double]$free / [double]$total), 2) }
                }
            }
        }
    } catch { }
    return $health
}

function Get-MBSInventory {
    $os = Get-MBSCimInventory Win32_OperatingSystem
    $computer = Get-MBSCimInventory Win32_ComputerSystem
    $bios = Get-MBSCimInventory Win32_BIOS
    $inventory = @{
        hostname       = $env:COMPUTERNAME
        os_name        = Convert-MBSText $os.Caption
        os_version     = Convert-MBSText $os.Version
        architecture   = Convert-MBSText $os.OSArchitecture
        serial_number  = Convert-MBSText $bios.SerialNumber
        manufacturer   = Convert-MBSText $computer.Manufacturer
        model          = Convert-MBSText $computer.Model
        ip_address     = Get-MBSPrimaryIPv4
        logged_in_user = Convert-MBSText $computer.UserName
        agent_version  = $AgentVersion
        total_memory_bytes = Convert-MBSPositiveNumber $computer.TotalPhysicalMemory
        bios_manufacturer = Convert-MBSText $bios.Manufacturer
        bios_version = Convert-MBSText $bios.SMBIOSBIOSVersion
        bios_release_date = Convert-MBSDate $bios.ReleaseDate
        os_build = Convert-MBSText $os.BuildNumber
        last_boot_at = Convert-MBSDate $os.LastBootUpTime
        uptime_seconds = $null
        cpu_manufacturer = $null
        cpu_name = $null
        processor_count = $null
        core_count = $null
        logical_processor_count = $null
        system_uuid = $null
        memory_modules = $null
        physical_disks = $null
    }
    try {
        if ($inventory.last_boot_at) {
            $inventory.uptime_seconds = [long][math]::Floor(((Get-Date).ToUniversalTime() - ([datetime]$inventory.last_boot_at).ToUniversalTime()).TotalSeconds)
        }
    } catch {
        if ($InventoryDiagnostics) { Write-Warning "Inventory uptime conversion failed (details suppressed)." }
        $inventory.uptime_seconds = $null
    }
    try {
        $processors = @(Get-MBSCimInventory Win32_Processor | Where-Object { $null -ne $_ })
        if ($processors.Count -gt 0) {
            $inventory.cpu_manufacturer = Convert-MBSText (($processors | ForEach-Object { $_.Manufacturer } | Select-Object -Unique) -join "; ")
            $inventory.cpu_name = Convert-MBSText (($processors | ForEach-Object { $_.Name } | Select-Object -Unique) -join "; ")
            $inventory.processor_count = $processors.Count
            $inventory.core_count = Convert-MBSPositiveNumber (($processors | Measure-Object NumberOfCores -Sum).Sum)
            $inventory.logical_processor_count = Convert-MBSPositiveNumber (($processors | Measure-Object NumberOfLogicalProcessors -Sum).Sum)
        }
    } catch {
        if ($InventoryDiagnostics) { Write-Warning "Inventory processor conversion failed (details suppressed)." }
        $inventory.cpu_manufacturer = $null; $inventory.cpu_name = $null
        $inventory.processor_count = $null; $inventory.core_count = $null; $inventory.logical_processor_count = $null
    }
    try {
        $product = Get-MBSCimInventory Win32_ComputerSystemProduct
        $uuid = Convert-MBSText $product.UUID
        if ($uuid -and $uuid -notmatch '^(0{8}-0{4}-0{4}-0{4}-0{12}|F{8}-F{4}-F{4}-F{4}-F{12})$') { $inventory.system_uuid = $uuid }
    } catch {
        if ($InventoryDiagnostics) { Write-Warning "Inventory system identity conversion failed (details suppressed)." }
        $inventory.system_uuid = $null
    }
    try {
        $modules = Get-MBSCimInventory Win32_PhysicalMemory
        if ($null -ne $modules) {
            $inventory.memory_modules = @($modules | Select-Object -First 128 | ForEach-Object {
                @{
                    capacity_bytes = Convert-MBSPositiveNumber $_.Capacity
                    manufacturer = Convert-MBSText $_.Manufacturer
                    part_number = Convert-MBSText $_.PartNumber
                    speed_mhz = Convert-MBSPositiveNumber $_.Speed
                    configured_speed_mhz = Convert-MBSPositiveNumber $_.ConfiguredClockSpeed
                    bank = Convert-MBSText $_.BankLabel
                    locator = Convert-MBSText $_.DeviceLocator
                }
            })
        }
    } catch {
        if ($InventoryDiagnostics) { Write-Warning "Inventory memory modules conversion failed (details suppressed)." }
        $inventory.memory_modules = $null
    }
    try {
        $disks = Get-MBSCimInventory Win32_DiskDrive
        if ($null -ne $disks) {
            $inventory.physical_disks = @($disks | Select-Object -First 64 | ForEach-Object {
                @{
                    model = Convert-MBSText $_.Model
                    serial_number = Convert-MBSText $_.SerialNumber
                    capacity_bytes = Convert-MBSPositiveNumber $_.Size
                    media_type = Convert-MBSText $_.MediaType
                    bus_type = Convert-MBSText $_.InterfaceType
                }
            })
        }
    } catch {
        if ($InventoryDiagnostics) { Write-Warning "Inventory physical disks conversion failed (details suppressed)." }
        $inventory.physical_disks = $null
    }
    try {
        $health = Get-MBSDeviceHealth -Inventory $inventory -OperatingSystem $os -Processors $processors
        foreach ($key in $health.Keys) { $inventory[$key] = $health[$key] }
    } catch {
        if ($InventoryDiagnostics) { Write-Warning 'Device health collection unavailable (details suppressed).' }
    }
    return $inventory
}

# WUA reads the endpoint's configured update source; no download/install objects are created.
function Get-MBSUpdateRebootRequired {
    try {
        $required = (New-Object -ComObject Microsoft.Update.SystemInfo).RebootRequired
        if ($null -eq $required) { return $null }
        return [bool]$required
    }
    catch { return $null }
}

function Get-MBSWindowsUpdates {
    $telemetry = @{
        update_attempted_at = (Get-Date).ToUniversalTime().ToString('o')
        update_scan_status = 'failed'
    }
    try {
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        # Synchronous search runs only inside a windows_update_scan job.
        $result = $searcher.Search('IsInstalled=0 and IsHidden=0')
        # Do not publish incomplete results (SucceededWithErrors is not success).
        if ([int]$result.ResultCode -ne 2) { return $telemetry }
        if ($result.Updates.Count -gt 10000) { return $telemetry }
        $details = @()
        $security = 0
        $drivers = 0
        $securityKnown = $true
        $driversKnown = $true
        foreach ($update in $result.Updates) {
            $categories = @(); $categoryIds = @(); $hasClassification = $false
            try {
                foreach ($category in $update.Categories) {
                    if ($category.Type -eq 'UpdateClassification') { $hasClassification = $true }
                    $categories += ([string]$category.Name).Substring(0, [Math]::Min(200, ([string]$category.Name).Length))
                    $categoryIds += [string]$category.CategoryID
                }
                if (-not $hasClassification) { $securityKnown = $false }
                # Stable Security Updates classification GUID, independent of display language.
                if ($categoryIds -contains '0fa1201d-4330-4fa8-8ae9-b877473b6441') { $security++ }
            } catch { $securityKnown = $false }
            try {
                if ($null -eq $update.Type -or [int]$update.Type -notin @(1, 2)) { $driversKnown = $false }
                elseif ([int]$update.Type -eq 2) { $drivers++ }
            } catch { $driversKnown = $false }
            if ($details.Count -ge 200) { continue }
            $item = @{
                title = ([string]$update.Title).Substring(0, [Math]::Min(1000, ([string]$update.Title).Length))
                update_id = [string]$update.Identity.UpdateID
                revision = [int]$update.Identity.RevisionNumber
                kb_ids = @($update.KBArticleIDs | Select-Object -First 32)
                categories = @($categories | Select-Object -First 32)
                category_ids = @($categoryIds | Select-Object -First 32)
                severity = Convert-MBSText $update.MsrcSeverity
                downloaded = [bool]$update.IsDownloaded
                installed = [bool]$update.IsInstalled
                reboot_may_be_required = $null
            }
            try { $item.reboot_may_be_required = ([int]$update.InstallationBehavior.RebootBehavior -ne 0) } catch { }
            $details += $item
        }
        # Publish atomically only after complete enumeration; failures preserve the old snapshot.
        $telemetry.update_refreshed_at = (Get-Date).ToUniversalTime().ToString('o')
        $telemetry.update_pending_count = [int]$result.Updates.Count
        $telemetry.update_security_count = if ($securityKnown) { $security } else { $null }
        $telemetry.update_driver_count = if ($driversKnown) { $drivers } else { $null }
        $telemetry.update_reboot_required = Get-MBSUpdateRebootRequired
        $telemetry.pending_updates = @($details)
        $telemetry.update_scan_status = 'success'
    }
    catch {
        # Never serialize COM errors or discard prior successful inventory on collection failure.
        return @{ update_attempted_at = $telemetry.update_attempted_at; update_scan_status = 'failed' }
    }
    return $telemetry
}

function Convert-MBSSoftwareText {
    param($Value, [int]$Maximum)
    # Registry binary/multi-string/integer values are not meaningful application metadata.
    if ($Value -isnot [string]) { return $null }
    $valueText = ($Value -replace '[\x00-\x1f\x7f]', ' ').Trim()
    if ([string]::IsNullOrWhiteSpace($valueText)) { return $null }
    return $valueText.Substring(0, [Math]::Min($Maximum, $valueText.Length))
}

function Get-MBSSoftwareRegistryEntries {
    $views = @([Microsoft.Win32.RegistryView]::Registry32)
    if ([Environment]::Is64BitOperatingSystem) {
        $views = @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)
    }
    $seenKeys = 0
    foreach ($view in $views) {
        $base = $null; $root = $null
        try {
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
            $root = $base.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall', $false)
            if ($null -eq $root) { continue }
            foreach ($name in ($root.GetSubKeyNames() | Sort-Object)) {
                $seenKeys++
                if ($seenKeys -gt 10000) { throw 'Software registry limit exceeded' }
                $key = $null
                try {
                    $key = $root.OpenSubKey($name, $false)
                    if ($null -eq $key) { throw 'Software registry changed during collection' }
                    $entry = @{ source_view = $view.ToString().ToLowerInvariant() }
                    foreach ($field in @('DisplayName','DisplayVersion','Publisher','InstallDate','InstallLocation')) {
                        $entry[$field] = $key.GetValue($field, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                    }
                    [pscustomobject]$entry
                } finally { if ($null -ne $key) { $key.Dispose() } }
            }
        } finally {
            if ($null -ne $root) { $root.Dispose() }
            if ($null -ne $base) { $base.Dispose() }
        }
    }
}

function Convert-MBSSoftwareEntries {
    param([object[]]$Entries)
    $apps = @{}
    foreach ($entry in $Entries) {
        if ($null -eq $entry) { continue }
        $name = Convert-MBSSoftwareText $entry.DisplayName 300
        if (-not $name) { continue }
        $version = Convert-MBSSoftwareText $entry.DisplayVersion 100
        $publisher = Convert-MBSSoftwareText $entry.Publisher 200
        # JSON tuple avoids delimiter collisions; hashtable comparison is case-insensitive.
        $identity = ConvertTo-Json -InputObject @($name,$version,$publisher) -Compress
        $view = $entry.source_view
        if ($view -notin @('registry64','registry32')) { throw 'Unknown registry view' }
        $installDate = $null
        $rawDate = Convert-MBSSoftwareText $entry.InstallDate 32
        $parsedDate = [datetime]::MinValue
        if ($rawDate -and [datetime]::TryParseExact($rawDate, 'yyyyMMdd', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$parsedDate)) {
            $installDate = $parsedDate.ToString('yyyy-MM-dd')
        }
        $location = Convert-MBSSoftwareText $entry.InstallLocation 500
        if ($apps.ContainsKey($identity)) {
            if ($apps[$identity].source_views -notcontains $view) { $apps[$identity].source_views += $view }
            if (-not $apps[$identity].install_date) { $apps[$identity].install_date = $installDate }
            if (-not $apps[$identity].install_location) { $apps[$identity].install_location = $location }
            continue
        }
        if ($apps.Count -ge 1000) { throw 'Software application limit exceeded' }
        $apps[$identity] = @{
            display_name = $name; display_version = $version; publisher = $publisher
            install_date = $installDate
            install_location = $location
            source_views = @($view)
        }
    }
    $apps.Values | Sort-Object { $_.display_name }, { $_.display_version }, { $_.publisher }
}

function Get-MBSSoftwareInventory {
    $attempted = (Get-Date).ToUniversalTime().ToString('o')
    try {
        $entries = @(Get-MBSSoftwareRegistryEntries)
        $apps = @(Convert-MBSSoftwareEntries -Entries $entries)
        $snapshot = @{
            software_attempted_at = $attempted
            software_refreshed_at = (Get-Date).ToUniversalTime().ToString('o')
            software_status = 'success'; software_count = $apps.Count
            installed_software = @($apps)
        }
        # Leave room for normal hardware fields in the existing 4 MiB check-in envelope.
        $wire = $snapshot | ConvertTo-Json -Depth 6
        if ([Text.Encoding]::UTF8.GetByteCount($wire) -gt 3MB) { throw 'Software payload limit exceeded' }
        return $snapshot
    } catch {
        return @{software_attempted_at=$attempted; software_status='failed'}
    }
}

function Send-MBSCheckIn {
    param(
        [object]$Config,
        [hashtable]$Inventory
    )

    $uri = "$($Config.server_url.TrimEnd('/'))/api/rmm/agent/checkin"

    $headers = @{
        "x-rmm-agent-id"    = $Config.agent_id
        "x-rmm-agent-token" = $Config.token
    }

    $body = $Inventory | ConvertTo-Json -Depth 6
    if ($InventoryDiagnostics) {
        # Inspect the actual wire JSON, not an earlier copy of the hashtable.
        # Only fixed field names and presence/counts are emitted, never values or headers.
        $serialized = $body | ConvertFrom-Json
        foreach ($field in @("cpu_manufacturer", "cpu_name", "processor_count", "core_count",
            "logical_processor_count", "total_memory_bytes", "bios_manufacturer", "bios_version",
            "bios_release_date", "system_uuid", "os_build", "last_boot_at", "uptime_seconds",
            "memory_modules", "physical_disks", "health_snapshot_at", "cpu_utilization_percent")) {
            $property = $serialized.PSObject.Properties[$field]
            $state = "missing"
            if ($null -ne $property) {
                $state = "null"
                if ($null -ne $property.Value) {
                    $state = "populated"
                    if ($property.Value -is [array]) { $state = "items=$($property.Value.Count)" }
                }
            }
            Write-Host "Inventory JSON ${field}: $state"
        }
    }

    Invoke-RestMethod `
        -Uri $uri `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body
}

function Send-MBSJobResult {
    param(
        [object]$Config,
        [long]$JobId,
        [ValidateSet("started", "completed", "failed")][string]$Status,
        [int]$ResultCode = 0,
        [string]$ResultOutput = "",
        [string]$ResultError = ""
    )

    $headers = @{
        "x-rmm-agent-id" = $Config.agent_id
        "x-rmm-agent-token" = $Config.token
    }
    $body = @{
        status = $Status
        result_code = $ResultCode
        result_output = $ResultOutput
        result_error = $ResultError
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$($Config.server_url.TrimEnd('/'))/api/rmm/agent/jobs/$JobId/result" `
        -Method Post -Headers $headers -ContentType "application/json" -Body $body | Out-Null
}

function Invoke-MBSNextJob {
    param([object]$Config)

    $headers = @{
        "x-rmm-agent-id" = $Config.agent_id
        "x-rmm-agent-token" = $Config.token
    }
    $poll = Invoke-RestMethod -Uri "$($Config.server_url.TrimEnd('/'))/api/rmm/agent/jobs/next" `
        -Method Get -Headers $headers
    if ($null -eq $poll.job) { return }

    $job = $poll.job
    $allowedJobTypes = @("inventory_refresh", "windows_update_scan", "software_inventory_refresh")
    if ($allowedJobTypes -cnotcontains $job.job_type) {
        Send-MBSJobResult -Config $Config -JobId $job.id -Status failed -ResultCode 1 `
            -ResultError "Unsupported job type; no action was executed"
        return
    }

    # Do not execute until the server acknowledges the started transition.
    Send-MBSJobResult -Config $Config -JobId $job.id -Status started
    $failureMessage = "Inventory collection failed"
    try {
        $inventory = Get-MBSInventory
        if ($job.job_type -ceq 'windows_update_scan') {
            $updates = Get-MBSWindowsUpdates
            foreach ($key in $updates.Keys) { $inventory[$key] = $updates[$key] }
        }
        if ($job.job_type -ceq 'software_inventory_refresh') {
            $software = Get-MBSSoftwareInventory
            foreach ($key in $software.Keys) { $inventory[$key] = $software[$key] }
        }
        $failureMessage = "Inventory refresh check-in failed"
        Send-MBSCheckIn -Config $Config -Inventory $inventory | Out-Null
    }
    catch {
        # Fixed stage-specific messages exclude credentials and raw server responses.
        Send-MBSJobResult -Config $Config -JobId $job.id -Status failed -ResultCode 1 `
            -ResultError $failureMessage
        return
    }

    if ($job.job_type -ceq 'windows_update_scan' -and $updates.update_scan_status -ne 'success') {
        Send-MBSJobResult -Config $Config -JobId $job.id -Status failed -ResultCode 1 `
            -ResultError "Windows Update scan failed or unavailable; previous successful snapshot retained"
        return
    }
    if ($job.job_type -ceq 'software_inventory_refresh' -and $software.software_status -ne 'success') {
        Send-MBSJobResult -Config $Config -JobId $job.id -Status failed -ResultCode 1 `
            -ResultError "Software inventory failed or unavailable; previous successful snapshot retained"
        return
    }
    $output = if ($job.job_type -ceq 'windows_update_scan') { 'Windows Update scan completed successfully' } elseif ($job.job_type -ceq 'software_inventory_refresh') { 'Software inventory completed successfully' } else { 'Hardware inventory refreshed successfully' }
    # A reporting failure must not turn successful execution into a failed job.
    Send-MBSJobResult -Config $Config -JobId $job.id -Status completed `
        -ResultOutput $output
}

try {
    $config = Get-MBSAgentConfig -Path $ConfigPath
    $inventory = Get-MBSInventory
    $response = Send-MBSCheckIn -Config $config -Inventory $inventory

    Write-Host "MBS RMM check-in successful."
    Write-Host "Hostname: $($inventory.hostname)"
    Write-Host "Status: $($response.device.status)"
}
catch {
    Write-Error "MBS RMM check-in failed: $($_.Exception.Message)"
    exit 1
}

try {
    Invoke-MBSNextJob -Config $config
}
catch {
    Write-Error "MBS RMM job polling or result reporting failed."
    exit 1
}
