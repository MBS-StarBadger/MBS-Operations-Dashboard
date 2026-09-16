# Windows Update visibility v1

Inventory only. Existing agent authentication, audit, correlation and job transitions remain in force. The fixed job allowlist contains only `inventory_refresh` and `windows_update_scan`. No install, approval, reboot, policy changes or command execution was added.

## Collection and scheduling

`MBSRmmAgent.ps1` creates `Microsoft.Update.Session`, calls `CreateUpdateSearcher()`, then `Search('IsInstalled=0 and IsHidden=0')`. It uses the machine's configured update source without overriding WUA source/policy. WUA may retrieve scan metadata; no update downloader or installer is created. Only ResultCode 2 (complete success) publishes a new snapshot. Failed/partial queries report a fixed failed status and attempt timestamp while preserving the last successful snapshot.

The scan runs only inside a `windows_update_scan` job, after its started transition is acknowledged. Jobs use the existing queued → claimed → started → completed/failed lifecycle. The normal scheduled check-in runs first and does not perform any Windows Update query. `inventory_refresh` / **Refresh Inventory** collects and sends normal hardware inventory without calling WUA. The update-scan job includes normal inventory in its authenticated check-in to preserve legacy check-in and Asset correlation behavior. Failed/unavailable scans send only attempt/status update fields alongside hardware, then report the job failed; successful counts/details and `update_refreshed_at` remain untouched.

**Scan for Updates** in the Windows Update device section queues `windows_update_scan` through the existing admin-only device-job API. This force-scan bypasses weekly eligibility, but an existing queued/claimed/started scan returns HTTP 409. It never executes directly in the browser. **Refresh Inventory** remains a separate control.

After database initialization, the server scheduler runs immediately and hourly, independently of browser activity. It considers devices reporting a Windows OS and excludes linked assets outside Desktop/Laptop/Server scope. Devices with no scan history are eligible immediately. The target interval is seven days after the latest persisted `update_attempted_at` or `update_refreshed_at`. Recent scan-job creation also imposes a seven-day backoff for older agents or failures before telemetry arrives. Failed attempts therefore normally retry weekly; administrators can force an earlier retry. Offline devices retain their queued scan until the agent polls.

A partial unique index on `rmm_jobs(device_id)` for `windows_update_scan` in queued/claimed/started states prevents duplicates across manual requests, hourly scheduling, concurrent processes and server restarts. Completed/failed scans permit another manual job immediately. Automatic jobs have null `created_by` and an `RMM_JOB_CREATED` system audit entry. Active jobs are not automatically expired or reclaimed by this phase; an abandoned claimed/started scan continues to block another scan.

The scan is synchronous and native WUA controls its duration. With the existing scheduled task's IgnoreNew setting, an unusually long update scan may defer subsequent scheduled runs until it finishes. There is no disk cache or custom scan timeout. Devices remain unknown until an upgraded agent processes a successful update-scan job. Snapshot freshness is independent of heartbeat health and becomes stale after eight days, allowing weekly scans a one-day margin. Deploy the updated agent to enable the new job; older agents reject it through their existing allowlist.

## Data and API

Initialization adds nullable columns with `ADD COLUMN IF NOT EXISTS`:

- `update_attempted_at`, `update_refreshed_at`: TIMESTAMPTZ (last attempt and successful scan completion, respectively).
- `update_scan_status`: VARCHAR(20), success/failed/unavailable/null. Agent exceptions and partial results currently use failed.
- `update_pending_count`, `update_security_count`, `update_driver_count`: INTEGER.
- `update_reboot_required`: BOOLEAN; null means unknown.
- `pending_updates`: JSONB array retaining title, update ID/revision, KB IDs, category names/IDs, severity, downloaded/installed flags and potential reboot relevance.

Existing authenticated check-in accepts these top-level fields. Omission preserves a field; explicit null clears it to unknown; zero/false/empty arrays are retained. Supplied values are validated before SQL. Nested unknown keys are rejected. Counts are bounded at 10,000; details at 200; KB/category arrays at 32; title at 1,000 characters; KB at 32; category name at 200; category/update IDs and severity at 100. Counts include all results even when details are capped. The check-in JSON body cap is 4 MiB; other routes retain their existing default. Summary/detail fields can be supplied independently under existing partial-update semantics; supplied classification counts/details may not exceed a supplied total.

Security count uses the stable Security Updates classification GUID `0fa1201d-4330-4fa8-8ae9-b877473b6441`, not localized title matching or severity inference. If any item's classification is unavailable, the security count is unknown. Driver count uses WUA UpdateType 2; unknown types make that count unknown. Hidden updates and installed updates are excluded. Counts reflect applicability from the configured source, not compliance against every Microsoft release.

Reboot state comes from read-only `Microsoft.Update.SystemInfo.RebootRequired` at successful scan completion. COM failure/missing value yields null. This is WUA's update-related restart requirement, not a universal pending-reboot detector for every Windows subsystem. Per-update potential reboot uses `InstallationBehavior.RebootBehavior` (0 = never; other documented values = may/always).

Fleet and detail APIs return the new stored fields through existing authorized routes. UI adds a compact fleet indication beneath hostname and a themed detail section with scan timestamps/status, counts, tri-state reboot state and scrollable update metadata. Failure, stale, unknown and zero are distinct. Reboot and counts shown after failure belong to the prior successful snapshot. There is no installation control.

## Verification and live acceptance

Automated server tests cover SQL bindings/JSON serialization, omission and explicit values, null/false/true, zero, validation/limits and large metadata bodies. Existing RMM tests cover old agents, hardware, correlation, jobs and auth. Additional tests cover manual force-scans, HTTP 409 on duplicate creation, Windows/asset scheduling scope, seven-day timestamp eligibility and retry backoff, hourly server scheduling, eight-day freshness, and mock PowerShell dispatch/lifecycle separation. Database calls are mocked; an actual PostgreSQL upgrade has not been exercised here.

On Windows PowerShell 5.1 run `agents/windows/tests/HardwareInventory.Tests.ps1` and `agents/windows/tests/WindowsUpdates.Tests.ps1` (mock CIM/HTTP/COM only). PowerShell is unavailable on DEV, so these tests have not been run here.

Live validation should cover SYSTEM scheduled execution, managed WSUS/default-source endpoints, zero/populated results, security/driver classifications, reboot true/false, COM/source failure, scan duration, existing-device schema upgrade and rendered light/dark layouts. Check that normal check-ins omit update telemetry and that a failed update scan leaves the prior successful snapshot visible with a failure indication.

References: [WUA Search](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nf-wuapi-iupdatesearcher-search), [WUA reboot state](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/nf-wuapi-isysteminformation-get_rebootrequired), [installation reboot behavior](https://learn.microsoft.com/en-us/windows/win32/api/wuapi/ne-wuapi-installationrebootbehavior).

Validate the partial unique index against concurrent manual/automatic requests on PostgreSQL, and verify a weekly job is queued without an open browser. Check manual scans before the seven-day interval and that Refresh Inventory never triggers WUA.
