param(
    [string]$ConfigPath = "C:\ProgramData\MBS-RMM\agent.json"
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

function Get-MBSInventory {
    $os = Get-CimInstance Win32_OperatingSystem
    $computer = Get-CimInstance Win32_ComputerSystem
    $bios = Get-CimInstance Win32_BIOS

    return @{
        hostname       = $env:COMPUTERNAME
        os_name        = $os.Caption
        os_version     = $os.Version
        architecture   = $os.OSArchitecture
        serial_number  = $bios.SerialNumber
        manufacturer   = $computer.Manufacturer
        model          = $computer.Model
        ip_address     = Get-MBSPrimaryIPv4
        logged_in_user = $computer.UserName
        agent_version  = $AgentVersion
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

    $body = $Inventory | ConvertTo-Json

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
    $allowedJobTypes = @("inventory_refresh")
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
        $failureMessage = "Inventory refresh check-in failed"
        Send-MBSCheckIn -Config $Config -Inventory $inventory | Out-Null
    }
    catch {
        # Fixed stage-specific messages exclude credentials and raw server responses.
        Send-MBSJobResult -Config $Config -JobId $job.id -Status failed -ResultCode 1 `
            -ResultError $failureMessage
        return
    }

    # A reporting failure must not turn successful execution into a failed job.
    Send-MBSJobResult -Config $Config -JobId $job.id -Status completed `
        -ResultOutput "Inventory refresh completed successfully"
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
