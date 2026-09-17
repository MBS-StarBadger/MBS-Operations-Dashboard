# Main RMM Alert Dashboard v1

The dashboard derives read-only alerts from existing device snapshots and RMM job state. There is no alert table, history, acknowledgement state or new endpoint collection. `server/public/rmmAlerts.js` normalizes alerts, calls the authoritative `rmmHealth.js` evaluator, orders alerts, calculates severity counts and per-device highest severity, and applies frontend search/filters. JSX renders the results and uses the existing device-console navigation.

## Sources and severity

| Source | Severity | Rule |
| --- | --- | --- |
| Storage critical/full | Critical | Shared health evaluator: >=90% used, <10 GiB free; full >=98% or zero usable free bytes |
| Storage elevated | Attention | Shared evaluator: >=80% used, unless a more severe condition wins |
| High RAM / CPU | Attention | Shared evaluator: >=90%; CPU is explicitly a current snapshot, not sustained load |
| Long uptime | Attention | Shared evaluator: >=30 days |
| Stale health | Info | Shared evaluator: snapshot older than 15 minutes |
| Unknown health | Info | Missing/future/unusable or incomplete samples must not be called healthy |
| Pending Windows Updates | Info | Positive successful snapshot count |
| Pending security updates | Attention | Positive security count; security updates are included in the pending total |
| Machine requires reboot | Attention | Successful snapshot reports `update_reboot_required=true` |
| Update may require reboot | Info | A pending update reports `reboot_may_be_required=true`; does not imply the machine currently needs reboot |
| Update/software scan stale | Info | Last successful snapshot older than 8 days |
| Update/software never scanned | Info | No successful snapshot; distinct from latest attempt failure |
| Update/software timestamp ahead | Info | Future successful timestamp; freshness is unknown |
| Latest update/software scan failed/unavailable | Attention | Latest persisted scan status is failed/unavailable; previous successful data is retained |
| Offline endpoint | Info | Existing fleet connectivity status is offline; not a hardware failure |
| Recent failed job | Attention | Completed failure within the last 24 hours, inclusive |
| Possibly stuck job | Attention | Claimed/started for more than 1 hour, using started timestamp when available, otherwise claimed timestamp |

Hardware thresholds live only in `rmmHealth.js`; this module does not repeat them. Stale/unknown hardware samples cannot produce active hardware alerts. Last successful update counts/reboot state remain useful when stale but are explicitly labeled **Last reported**. Future or absent update snapshots cannot assert pending/reboot state. A latest failed scan and stale successful snapshot are separate conditions. Latest scan failure remains visible until that persisted status changes; generic job-failure alerts expire after 24 hours. Queued jobs are not considered stuck.

Each alert has a deterministic device/source ID. Duplicate job rows cannot double-count an alert. Different conditions (pending total versus security subset, or scan failure versus failed job) are distinct alerts; the counter counts conditions, not affected devices or updates. Critical sorts before Attention before Info; within severity, newest source timestamp first, then stable alert ID. Endpoints with alerts precede quiet endpoints.

## Data and UI

The existing admin-only device-list response now includes `alert_jobs`, a correlated projection of claimed/started jobs and failures within 24 hours. Only job ID/type/status and lifecycle timestamps are included, not payloads, result output/errors or credentials. The controller also removes `agent_token_hash` from fleet responses. Existing authentication, authorization and asset joins are unchanged.

The fleet-scale **Alert Overview** replaces the individual alert card wall. `rmmAlertOverview.js` consumes the unchanged normalized alert objects from `rmmAlerts.js`; derivation, severity rules, polling and backend responses are unchanged. Overview totals remain fleet-wide: individual active alerts, unique affected endpoints, Critical/Attention/Info counts, and category counts. Alert IDs are deduplicated before counting, and each alert belongs to exactly one presentation category:

- Hardware: normalized hardware alerts, including unknown health.
- Updates: normalized updates alerts.
- Offline/Connectivity: normalized offline alerts.
- Stale/Monitoring: normalized stale alerts and software scan issues (never scanned, future timestamp, failed/unavailable).
- Jobs: normalized job alerts.

A stale update scan belongs to Stale/Monitoring, while its separately reported pending-update conditions belong to Updates. Category counts sum to the active-alert total; severity counts do likewise. These are counts of alert conditions, not pending update packages.

Clickable, keyboard-accessible summary buttons select All alerts, Critical, Attention, Info, Hardware, Updates, Offline, Stale or Jobs; the selected button exposes `aria-pressed`. Hostname/asset search combines with the selected filter. **Affected Endpoints** appears beneath the summaries with one row per matching device, sorted by its highest severity then hostname. A device matches when any of its alerts matches the selected severity/category. Row alert counts, highest severity and reasons always describe all alerts on that device, including when filtering by a lower severity. Quiet devices are excluded. The row shows hostname, an asset action when a linked asset is available, connectivity, highest severity, individual-alert count, up to three distinct concise reasons (with an additional-reasons count), and **View Endpoint**, using the existing console navigation. Stale update reasons retain “Last reported” context.

The affected list renders at most **25 endpoint rows per page**, with Previous/Next controls. No individual-alert cards or hidden per-alert DOM are created. This bounds alert rendering for approximately 200 endpoints and hundreds of simultaneous alerts; individual normalized alert objects remain intact. Filter/result membership changes reset pagination, and shrinking results clamp the current page. The normal **Managed Endpoints** fleet table remains below the overview, retains its compact highest-severity/health indicator and follows hostname/asset search. Severity/category selection applies only to the affected list, so the normal fleet table remains available.

The dashboard's existing 30-second health timer now also refreshes the existing device-list request, with overlapping timer requests suppressed and cleanup on unmount. It does not repeatedly fetch the audited dashboard-open endpoint. A refresh failure leaves the previous data visible with an explicit warning. No per-endpoint job fan-out or additional timer is introduced. Existing console job polling is unchanged.

## Limitations and validation

This is a snapshot exception console, not a monitoring engine. Browser time drives alert age calculations; database time bounds the recent-job projection. Fleet online/offline uses the existing fleet status policy, which differs from the console's connectivity labels. The job query returns all qualifying active/recent failed jobs, not only the latest 25. Affected endpoints use client-side pagination; substantially larger fleets may eventually need server-side aggregation. Latest scan failures intentionally remain until a later scan changes status. No historical metric trends or duration-based CPU diagnosis are inferred.

Regression coverage includes 200-endpoint/1,000-alert rendering limits, unique endpoint aggregation, individual-alert totals, severity/category counts and filtering, concise reasons, asset/endpoint actions, and every source, shared threshold use, freshness/window boundaries, future timestamps, partial sample coverage, deduplication/counts, severity ordering, filters/search, endpoint navigation, protected job projection and token-hash exclusion. Live browser validation remains necessary for light/dark contrast, narrow layouts, keyboard interaction, endpoint navigation and polling on the deployed fleet. Query performance should be observed against production fleet size; automated repository tests use mocked PostgreSQL results.

Future acknowledgement, notifications and remediation require separately designed persistence, permissions, audit and lifecycle semantics. This milestone provides none of those actions and adds no update installation, reboot, script execution, remote command, collection or scheduling behavior.
