# features/catalog

The Admin carrier page includes a **Carrier webhooks** tab for inbound GHN,
GHTK and Viettel Post setup (UC-92/102). It uses the existing
`carriers.credentials.manage` capability and `/v1/platform/carrier-webhooks` API.
Saves use version checks; secrets are never loaded back. A newly saved secret and
the GHTK URL can be copied before leaving. Provider registration remains manual;
configured status does not verify live delivery. J&T is explicitly unsupported.

## Manual testing feedback (5 November 2026)

Optional shelf-life input preserves `null` on form reset and clearing. Expiry thresholds
are shown only when expiry tracking is enabled; disabling it clears the duration and
restores valid saved thresholds. SKU deactivation retains stock, lots and document
history; the catalog explains this existing lifecycle action instead of offering a
destructive delete. Zone/bin setup records the Manager's physical layout.

Carrier catalogue management UI (UC-91): create/edit carrier metadata and create/edit/enable/disable services in carrier details. Contract and ownership handoff: [carrier management API](../../../docs/CARRIER-CATALOG-MANAGEMENT-API-HANDOFF.md). Adding a carrier does not implement its provider adapter.

Carrier details include a paginated route/zone panel for Admin. It uses province directory options and existing carrier-zone POST/PATCH endpoints; edits send `expectedUpdatedAt` and preserve drafts on failure. Routes are directional and province-level, not ward-level. No automatic coverage, tariff publication or live carrier booking is implied.

## Carrier API pricing (`/admin/tariffs`, 18 November 2026)

Freight pricing uses carrier API quotes only (GHN/GHTK negotiated prices). Nobody creates
purchase rate cards or seller freight tariffs in the UI any more: the manual editor, close
window, contract file import and setup guide were removed. The backend keeps the old tariff
tables read-only and publishes a system seller freight tariff with code `CARRIER_API`;
contract and plan forms label it "Cước vận chuyển: theo giá hãng tại thời điểm tạo vận đơn".

The page has three tabs, one job each:

1. **Giá hãng** (`CarrierPriceBoard`, default, read-only): last update time, the
   "Cập nhật giá ngay" collection job, the warehouse × province × weight comparison with a
   delivery tier filter, prices by weight band (`RateSnapshot`) and update history.
2. **Chọn hãng tự động** (`CarrierAutoSelection`, `?tab=selection`): tier-scoped proposals
   and applied rules (`RateProposalPanel`) plus the routes sampled for quotes
   (`RateWatchedRoutes`).
3. **Phí dịch vụ** (`ServiceTariffManager`, `?tab=service`): unchanged.

`useRateCollection` shares services, connected sandbox accounts and collection jobs between
the first two tabs and polls while a job runs. Access stays on `tariffs.manage`.

Seller SKU, platform warehouse/carrier catalogue, ORCA-owned carrier accounts/ping and carrier
price monitoring. Report3 UC-91–95/118/119; không BYOA. The earlier rate-card contract history
is in `docs/SS-1246-RATE-CARDS.md`.

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

## Warehouse 3D (SS-1057)

The standard directory layout panel hides the 3D entry and keeps the zone/bin actions.
The retained Three.js planner provides a schematic with OrbitControls,
raycast selection and grid-snapped zone/bin dragging. Rack/body instancing keeps GPU
work bounded. Manager edits require the current warehouse assignment; Admin reads only.
Native object selection, coordinate/zone-size forms and cell nudges also work without
WebGL. Search matches code/barcode; zone/type/status/placement filters dim non-matching
objects without removing collision obstacles or changing whole-catalog KPIs. Excluded
selections stay labelled. Camera focus resolves bin coordinates through the actual parent
zone and reserves desktop HUD space; top view and a projected status chip aid navigation.
Manager floor resizing uses schematic cells (16–256), refuses clipped zones and participates
in the same undo/save revision flow. Unsaved edits are guarded on close/reload/unload; scope changes abort/reset.

Shared layouts use the backend visual-layout GET/POST revision contract. Full catalog
pagination completes before editing (100 zones / 1,000 bins); larger/inconsistent
responses block partial saves. Counts/status/capacity come from catalog, with no invented
occupancy or vehicle telemetry. Cells are schematic units and saving cannot move stock.

Contract: backend `docs/SS-1057-WAREHOUSE-3D-LAYOUT.md`.
Local labelled fixture: `node tests/ss1057-visual-browser.mjs` (loopback, no .env/real API).
