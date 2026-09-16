# RMM Device Health & Telemetry v1

Read-only lightweight health visibility alongside existing RMM check-ins. **V1 stores the latest snapshot only and does not provide historical performance graphs.** No history/time-series tables, extra scheduler or health job are introduced.

## Metrics and Windows sources

`Get-MBSDeviceHealth` consumes the existing inventory's OS, processor and physical memory results and adds one system-volume query. Existing shared fields retain their hardware inventory meaning.

| Field | Source / calculation |
| --- | --- |
| health_snapshot_at | Agent UTC time when health collection begins |
| cpu_utilization_percent | Arithmetic mean of Win32_Processor.LoadPercentage across reported sockets, rounded to two decimal places |
| total_memory_bytes | Existing Win32_ComputerSystem.TotalPhysicalMemory |
| memory_available_bytes | Win32_OperatingSystem.FreePhysicalMemory (KiB) × 1024 |
| memory_utilization_percent | 100 × (1 − available / total physical bytes), rounded to two decimals |
| system_drive | Win32_OperatingSystem.SystemDrive, normalized to uppercase drive letter and colon |
| system_drive_total_bytes | Win32_LogicalDisk.Size for that DeviceID only |
| system_drive_free_bytes | Win32_LogicalDisk.FreeSpace for that DeviceID only |
| system_drive_utilization_percent | 100 × (1 − free / total drive bytes), rounded to two decimals |
| last_boot_at | Existing Win32_OperatingSystem.LastBootUpTime, converted to UTC |
| uptime_seconds | Existing elapsed whole seconds between last boot and agent collection time |

Microsoft describes CPU LoadPercentage as processor load averaged over the last second. Collection adds no sleep, sampling loop or process enumeration. A socket lacking a valid load makes aggregate CPU unknown, rather than averaging only the available sockets. The equal-socket mean is not weighted for machines with heterogeneous processors. It is a brief point-in-time signal, not sustained-load measurement.

Memory calculation uses installed physical memory to reuse existing total_memory_bytes. Reserved memory and Windows cache/availability definitions can make this differ from Task Manager. Zero available/free bytes is valid. Percentages require positive total capacity and valid available/free bytes not exceeding total. Missing, invalid or unavailable values become null. A valid disk total is retained even if free space is unavailable. System-drive identification is not hardcoded to C:.

The additional Win32_LogicalDisk query has a five-second operation timeout, is filtered to the Windows system volume and uses the validated drive letter in its filter. Existing hardware CIM query timeouts are unchanged. CPU, memory and disk collection are isolated with fixed/no diagnostic error text; a metric failure does not stop other telemetry. An unexpected whole-collector exception is caught by Get-MBSInventory so check-in still proceeds.

References: [Win32_Processor](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-processor), [Win32_OperatingSystem](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem), [Win32_LogicalDisk](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-logicaldisk).

## Cadence and existing jobs

Health is collected whenever Get-MBSInventory runs: normal scheduled check-ins, inventory_refresh, windows_update_scan and software_inventory_refresh. No high-frequency sampling, new manual action or job type is added. Existing Windows Update and software collectors remain restricted to their respective jobs. Health is sampled before those potentially longer job collectors; the timestamp remains the actual health collection timestamp, so a delayed submission can already be stale.

The existing check-in API, agent authentication, admin device access, asset correlation, auditing, job transitions, and weekly update/software schedules remain unchanged.

## Persistence and validation

Startup's idempotent ALTER TABLE adds nullable fields on rmm_devices:

- health_snapshot_at: TIMESTAMPTZ.
- cpu_utilization_percent, memory_utilization_percent, system_drive_utilization_percent: DOUBLE PRECISION.
- memory_available_bytes, system_drive_total_bytes, system_drive_free_bytes: BIGINT.
- system_drive: VARCHAR(2).
- health_sample_fields: JSONB, server-generated list of fields included in the latest timestamped health submission.

Existing total_memory_bytes, last_boot_at and uptime_seconds are reused. No new row is created for a measurement. Values are bound to an allowlisted SQL UPDATE; omitted fields do not enter SET, explicit null means unknown, and valid zero values are retained. Legacy check-ins therefore preserve existing health data. Partial check-ins change only supplied metrics.

Validation requires finite numeric percentages in 0–100, safe non-negative integer capacities, existing timezone-qualified timestamp syntax with valid calendar date for health_snapshot_at, and a letter/colon system-drive identifier. It rejects malformed timestamps, NaN/infinity, negative/overflow/fractional capacities, oversized drive strings, and supplied free bytes exceeding a supplied total.

Null fields are not listed as successfully sampled. They are still explicitly written as SQL NULL, and omitted fields remain preserved. The agent explicitly supplies null for unavailable current health measurements so old measurements cannot masquerade as newly sampled. It omits all new health fields if the complete collector unexpectedly fails. Partial API clients may omit fields to preserve storage, but a new timestamp must not refresh the apparent age of those omitted metrics. The server generates health_sample_fields from supplied, non-null metric keys (including numeric zero); caller-provided coverage is ignored. The UI treats retained fields absent from the latest timestamped sample as unknown, while the stored values remain intact. Submit health_snapshot_at with each sample; metric-only updates do not advance freshness or coverage. This adds provenance for a single snapshot, not metric history.

## Freshness, warnings and UI

Centralized constants and deterministic presentation rules live in server/public/rmmHealth.js. They are calculated from stored telemetry in the UI, never decided by the agent.

- Current: snapshot age ≤15 minutes; stale: >15 minutes.
- No snapshot: unknown/never reported. A future endpoint timestamp is unknown pending clock reconciliation.
- CPU warning: utilization ≥90%.
- Memory warning: utilization ≥90%.
- Disk warning: utilization ≥90% **or** free bytes <10 GiB (10 × 1024³ bytes). Exactly 10 GiB does not trigger the free-space warning.
- Uptime warning: ≥30 days (2,592,000 seconds).

Flags remain separate. Either known disk violation can warn; if neither violates and a required disk input is missing, the disk check is unknown. Healthy/current requires all four checks known and non-warning. A partial current sample with no known warnings is unknown/current. Stale data never yields Healthy/current, though last-known warnings remain visible as snapshot warnings. Online/offline continues using existing heartbeat semantics and is not inferred from health.

Fleet rows add a compact expandable health label, first warning and count of additional causes. Expansion/title exposes all causes without widening the table. Device details show CPU, memory utilization and used/available/total GiB, system-drive utilization and used/free/total GiB, uptime, last boot, snapshot time and age. Unknowns render explicitly; warning text accompanies color. Stale values are labeled last-reported. No chart library or score is introduced. A shared 30-second UI clock updates age classification even without new browser fetches; it does not collect or persist telemetry.

## Privacy, scope and limitations

No process lists, user activity, browsing history, files, keystrokes, screenshots, network payloads or credentials are collected by this feature. No third-party software, commands, shell, installation/removal, update management, reboot or policy changes are added. Diagnostics suppress exception details. Existing unrelated inventory fields are unchanged.

CPU is a brief sample; short spikes may be missed. Memory/drive values are sequential reads, not an atomic OS measurement. Agent clock skew affects freshness and uptime. Only the Windows system volume is measured here. An unavailable counter is unknown rather than a health verdict. Capacity/UI values use binary GiB. Floating percentages are rounded to two decimals, so readings very near a threshold can round to it.

## Validation

JavaScript regressions cover authenticated storage, valid and invalid payloads, omission/null/partial semantics, server-owned coverage, reused hardware fields, threshold boundaries, stale/unknown classification, bigint formatting and fleet/detail presentation. Existing RMM tests cover Windows Update, software, jobs, correlation and access controls.

`agents/windows/tests/DeviceHealth.Tests.ps1` loads agent functions only and mocks CIM/HTTP/update/software collectors. It covers serialized metrics, partial metric failures, zero values, system-drive filtering, equal-socket CPU averaging, complete collector failure, normal check-in and all three jobs. The mock suites have now run successfully with an isolated PowerShell 7.4.6 Linux runtime. Windows-native client-only CIM cases are explicitly skipped on Linux; run the suites on Windows PowerShell 5.1 to validate native adaptation.

Live validation remains necessary for SYSTEM scheduled execution, Windows CIM counter availability, real system-drive/memory values, wall-clock skew, PostgreSQL additive migration/storage and rendered light/dark fleet/detail layouts. Jest database calls are mocked; no live database migration or rendered browser verification was performed here.

## CPU null investigation

The live LT226 report establishes that Windows returns valid CPU load, but does not establish where the deployed agent loses it. The original single-processor mock collector succeeds locally; therefore a specific endpoint root cause has not yet been reproduced. The old CPU block swallowed every exception and left CPU null. The updated helper reads the native CimInstanceProperties LoadPercentage value once, validates a finite numeric value in 0–100, and averages explicitly without pipeline/Measure-Object dependence. Missing/invalid samples remain unknown, including any unavailable socket; zero is a valid sample. Optional diagnostics report only fixed failure-stage names and wire field presence, never raw CIM objects, exceptions, tokens or responses.

Run `agents/windows/tests/Inspect-DeviceHealth.ps1 -AgentPath <path-to-deployed-agent.ps1>` on the affected Windows machine to identify whether the deployed script loses CPU during direct collection, full inventory collection or JSON serialization. It loads only allowlisted read-only collector/helper function definitions, serializes JSON locally without loading or calling transport/check-in/job functions, never reads agent configuration/credentials, and reports the deployed script hash, PowerShell version, numeric CPU measurements and exception type names from legacy silent catches. Direct and inventory CPU values may differ because they are sampled at different times. Native Windows validation remains required before claiming the LT226 CPU defect is resolved.

The probe instruments legacy empty catches using the .NET Regex.Replace MatchEvaluator overload, supported by Windows PowerShell 5.1. A replacement string containing `$_` is unsafe here: .NET expands it to the entire input source, corrupting generated PowerShell. `InspectDeviceHealth.Tests.ps1` reproduces that former parser failure and exercises the corrected probe end-to-end with multiple empty catches and mocked CIM, checking local serialization and suppression of sensitive exception messages. It passed under PowerShell 7.4.6/Linux; Windows PowerShell 5.1 execution on LT226 remains unverified. The recent production CPU helper uses no identified PowerShell 7-only constructs; this source review does not substitute for native Windows validation.
