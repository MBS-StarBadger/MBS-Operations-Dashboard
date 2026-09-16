# RMM Software Inventory v1

Read-only machine-wide installed software visibility. No installation, uninstall, execution, package management, remote shell, reboot or policy operations are provided. Existing admin/agent authentication, asset scope, correlation, audits and job transition enforcement remain in use.

## Source and normalization

The Windows agent opens HKLM with .NET `RegistryKey.OpenBaseKey` and explicit `Registry64` / `Registry32` views. Each uninstall root/subkey is opened read-only using `OpenSubKey(..., false)`. On 64-bit Windows this covers:

- `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall`
- `HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`

On 32-bit Windows only Registry32 is read. This works independently of PowerShell process bitness. No `Win32_Product`, MSI enumeration, user-hive loading, registry writes or executable/uninstall commands are used. V1 intentionally excludes per-user installs, Store packages and portable apps not registered in these machine-wide uninstall locations. Named system components and patches registered there may be included; this is not a license/compliance inventory.

Collected fields: `display_name` (300 characters), `display_version` (100), `publisher` (200), `install_date` (YYYY-MM-DD or null), `install_location` (500), and `source_views` (registry64/registry32). Registry view is reported as provenance, not inferred application architecture. Registry `InstallDate` may reflect servicing, rather than original installation.

Text must be a registry string; it is trimmed, control characters replaced with spaces and truncated to its bound. Missing, non-string or malformed optional values become null. Blank/non-string names are skipped. Invalid/non-YYYYMMDD install dates become null. Environment references in registry strings are retained literally, not expanded.

Deduplication uses a case-insensitive JSON tuple of normalized name/version/publisher. Different versions/publishers remain separate. Matching entries merge registry views; the first available date/location wins (Registry64 first, then sorted subkeys), with missing fields filled from duplicates. Distinct installs with identical name/version/publisher may therefore be merged; truncation can also make exceptionally long identifiers identical.

A scan allows at most 10,000 raw subkeys and 1,000 normalized applications, with a 3 MiB serialized software snapshot budget inside the existing 4 MiB check-in limit. Exceeding a cap or failing registry access produces a failed attempt, never a truncated snapshot. Missing uninstall roots are treated as empty. Registry races can fail the attempt; the previous snapshot is retained. Handles are disposed in finally blocks.

## Jobs and scheduling

`software_inventory_refresh` is the only software job added to the allowlists. It collects software only after the claimed → started acknowledgment and sends telemetry through the existing authenticated check-in, alongside normal hardware inventory to retain legacy fields and correlation. After telemetry is sent, the job reports completed on success or failed on collection failure. Fixed failure messages exclude raw registry exceptions/credentials.

Normal heartbeat collection, `inventory_refresh`, and `windows_update_scan` never collect software. Their omitted software fields leave the previous snapshot unchanged.

The existing `rmmUpdateScheduler` is generalized with two fixed schedules, sharing one startup/hourly timer. Software eligibility uses its own persisted attempted/refreshed timestamps, with a seven-day target interval. Recent software-job creation also imposes seven-day backoff for old agents or failures before telemetry. Eligibility excludes non-Windows devices and out-of-scope linked assets. Automatic creation uses null created_by and existing RMM_JOB_CREATED audit events. It does not depend on a browser being open.

A partial unique index prevents more than one active software job per device across queued/claimed/started states, concurrent requests, or server restarts. Its predicate is independent of the Windows Update index, so each job type can have its own active job. Manual Refresh Software Inventory ignores age but returns HTTP 409 for an existing active software job. Offline agents run queued jobs when they next poll. Abandoned active jobs continue to block duplicates; automatic expiry/reclaim is outside v1. Older agents reject the new job type until upgraded.

## Persistence and validation

Startup initialization adds nullable columns to `rmm_devices` with ADD COLUMN IF NOT EXISTS:

| Column | Type | Meaning |
| --- | --- | --- |
| software_attempted_at | TIMESTAMPTZ | Latest collection attempt |
| software_refreshed_at | TIMESTAMPTZ | Last successful collection completion |
| software_status | VARCHAR(20) | success / failed / unavailable / null |
| software_count | INTEGER | Normalized application count, 0–1000 |
| installed_software | JSONB | Full successful application snapshot |

Initialization also adds `idx_rmm_jobs_active_software_inventory`, unique on device_id for active software_inventory_refresh jobs.

Validation extends `rmmInventory.js`; SQL columns remain allowlisted and values parameterized. Arrays, metadata keys/types/lengths, dates, statuses, counts and registry-view enums are checked. Unknown application keys are rejected. Supplied count and array length must match. Zero and an empty array represent a successful empty inventory; null means unknown. Omitted fields never enter SQL SET. Explicit null can clear supplied fields under existing partial-update semantics.

Failed/unavailable payloads may update attempt/status but must omit count, snapshot and successful refresh time; attempts to supply these fields alongside failure are rejected. The agent follows this contract. Thus a failed attempt cannot erase a prior successful snapshot.

## UI

Device details include Software summary/count, last success and attempt times, status, and a Refresh Software Inventory button. Feedback follows its exact job ID/device through existing Recent Jobs polling: waiting, in progress, completed or failed with safe job result text. Software entries support name/version/publisher search and a registry-view filter. The primary table shows application, version, publisher and install date; expanding an application reveals install location and registry views. React renders metadata as text.

Fleet rows show current/stale/never-scanned/last-attempt-failed state without listing applications. A snapshot becomes stale after eight days; heartbeat health does not imply current software inventory. A failed recent attempt remains visible alongside the prior snapshot's freshness.

## Validation and limitations

Jest tests cover validation/bounds, SQL storage and omission semantics, failure preservation, manual creation/auth/scope, duplicate conflicts, shared scheduling eligibility, frontend filtering/state and polled feedback. Database queries are mocked in this suite; PostgreSQL migration/concurrent uniqueness still require live validation.

Run `agents/windows/tests/SoftwareInventory.Tests.ps1` on Windows PowerShell 5.1 for mocked registry normalization, deduplication, malformed values, bounds, serialization, failure preservation and isolated job dispatch. Also run the existing HardwareInventory and WindowsUpdates PowerShell tests. PowerShell is unavailable on DEV; none of these PowerShell tests were run here.

Live acceptance: upgraded SYSTEM agent on 32-/64-bit Windows and both process views, denied/missing registry roots, duplicate software, old agents, successful/failed refreshes, PostgreSQL upgrade and concurrent job requests, and rendered light/dark device/fleet layouts. No browser rendering test was performed here.

References: [Microsoft registry-based software inventory guidance](https://learn.microsoft.com/en-us/powershell/scripting/samples/working-with-software-installations), [uninstall registry metadata](https://learn.microsoft.com/en-us/windows/win32/msi/uninstall-registry-key).

Normal check-ins and all existing inventory jobs also include lightweight [Device Health](RMM-DEVICE-HEALTH.md) snapshots. This does not trigger update or software collection outside their dedicated jobs.
