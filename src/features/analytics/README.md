# features/analytics

SS-1029 implements role-scoped ORCA reports (UC-147–154, FE-53/54) through GET /v1/reports. Dashboard, Admin Audit and health pages share ReportWorkspace; Analytics redirects to Dashboard; source errors are never replaced by fixture success.

Server options determine the available views and required warehouse per view. Existing route guards stay in force; Seller Staff has no financial fields, Seller audit remains denied, and no report action mutates business data. Changing auth revision unmounts the workspace and aborts requests.

Integer-string money is formatted with BigInt. Stock is current; date ranges apply to the stated event/cohort basis. Null metrics retain unavailable state. Health separates validation, timeout, circuit and unknown outcomes, with bounded safe business references and retry timestamps. Never infer payment, stock confirmation or resolved failures from these views.

See backend docs/SS-1029-ROLE-REPORTS.md for role/metric contracts, isolated source tests and historical-SLA/telemetry limitations.

## Canonical dashboard (SS-1029 UI consolidation)

/dashboard contains overview metrics, charts, date/warehouse filters and detailed
metric bases in one screen. /analytics is a guarded compatibility redirect using
replace, preserving query and hash. Sidebar/global search expose Dashboard once
for each report-capable role; Warehouse Staff remains denied. Server options
still determine report views; an ungranted/unknown view query cannot select it.
Audit and technical/health routes retain their existing guards and APIs.

Headline metrics only select fields actually supplied by the server. Exact VND,
null measurements, current stock versus period events, and partial sources keep
their original meanings. Charts also provide an accessible daily data table.
The tenant-administration /platform/dashboard/overview API is not a report API
and is unchanged. This UI change has no backend mutation or migration.

Carrier charts aggregate only the returned carrier/status groups. Neutral
numbered carrier labels do not guess a provider name; full identifiers remain
in expandable reference details. The ring total describes displayed records,
not a recomputed delivery rate. Partial source warnings remain visible. Status
colors differentiate delivered, in-transit, failed/returned and unknown outcomes.
No invented trend, percentage change, carrier name or healthy service is shown.

Metric definitions use compact two-column label/value rows. Each row opens its
calculation note on click or keyboard; the note is retained rather than removed.
On mobile, filters start collapsed and restore keyboard focus after applying.
