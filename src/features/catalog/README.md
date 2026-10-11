# features/catalog

Kho logic, SKU, hãng vận chuyển, bảng giá hợp đồng, credential 3PL (BYOA) và ping-test. BE: `catalog`. SRS: FE-08 → FE-11.

## ORCA warehouse calendar (SS-1305)

The platform warehouse directory includes the current business calendar,
local closed dates and eligibility/capacity at a selected Vietnam time. Assigned
Managers edit weekdays/closed dates using the warehouse version; Admin and Ops
review the calendar without write controls. Scope changes abort reads/reset the
panel. Existing outstanding-work and downtime panels remain available.

`warehouseApi.calendar` and `updateCalendar` validate the real backend envelope;
forms reject impossible/duplicate dates and an empty weekday set. Stale edits
retain the form and offer reload. The panel reports same-day eligibility without
claiming an implemented SLA alert or changing existing work/bin labels.

Backend contract: `smartchain_be/docs/SS-1305-WAREHOUSE-CALENDAR.md`.

## ORCA API response contract

Directory APIs return arrays in `data` and cursor information in `meta.pagination`.
Warehouse DTOs include nullable `tenantId`/`districtCode`, region, operating hours and
`version`; ORCA platform ownership is represented by `tenantId: null`.
Creation requires `region`. Status changes call `PATCH /v1/warehouses/:id/status`
with `status`, `reason` and `expectedVersion`, and reload confirmed server data.
Request/validation errors render a retry state rather than an empty directory.

Regression checks: `node --test tests/orca-api-contracts.test.mjs`.
