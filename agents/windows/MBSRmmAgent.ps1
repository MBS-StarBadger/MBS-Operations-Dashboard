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
