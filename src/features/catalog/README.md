# features/catalog

Carrier catalogue management UI (UC-91): create/edit carrier metadata and create/edit/enable/disable services in carrier details. Contract and ownership handoff: [carrier management API](../../../docs/CARRIER-CATALOG-MANAGEMENT-API-HANDOFF.md). Adding a carrier does not implement its provider adapter.

Carrier details include a paginated route/zone panel for Admin. It uses province directory options and existing carrier-zone POST/PATCH endpoints; edits send `expectedUpdatedAt` and preserve drafts on failure. Routes are directional and province-level, not ward-level. No automatic coverage, tariff publication or live carrier booking is implied.

Purchase tariffs select configured zone codes by carrier through `GET /v1/platform/tariffs/carriers/:carrierId/zone-codes`, available to existing Admin/Accountant tariff roles. Empty or failed zone reads block saving and explain how an Admin can add routes. Carrier changes clear the zone; obsolete reads are aborted. The declared-value policy input is labelled ppm to match the API calculation, without implying a fee exemption threshold.

Seller SKU, platform warehouse/carrier catalogue, ORCA-owned carrier accounts/ping và purchase/sell tariff UI. Report3 UC-91–95/118/119; không BYOA. Tariff contract và role/state mapping ở `docs/SS-1246-RATE-CARDS.md`.

## Warehouse directory interaction

Warehouse details expand beneath the selected row; the directory, filters and
pagination remain visible. The collapse action returns focus to its trigger.
Overview, layout, calendar and downtime stay in one detail region. Saving refreshes
the current cursor page in the background, preserving the selected tab; previous
pages can be fetched again after invalidating the cache.

The public `WarehouseStorageSetup` entry reuses layout management in inbound putaway.
Only assigned Managers can open it. It resolves the exact warehouse ID and code through
the existing paginated directory, aborts obsolete identity/scope reads, and filters the
layout to STORAGE zones. It reports open forms to the parent navigation lock. Changes
use existing versioned catalog commands; physical fit and task creation remain server
responsibilities.

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

Backend contract: `orca_be/docs/SS-1305-WAREHOUSE-CALENDAR.md`.

## ORCA API response contract

Directory APIs return arrays in `data` and cursor information in `meta.pagination`.
Warehouse DTOs include nullable `tenantId`/`districtCode`, region, operating hours and
`version`; ORCA platform ownership is represented by `tenantId: null`.
Creation requires `region`. Status changes call `PATCH /v1/warehouses/:id/status`
with `status`, `reason` and `expectedVersion`, and reload confirmed server data.
Request/validation errors render a retry state rather than an empty directory.

Regression checks: `node --test tests/orca-api-contracts.test.mjs`.
