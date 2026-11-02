# features/inventory

ORCA stock visibility: UC-45 aggregate view, UC-46 lot/bin/expiry drill-down,
UC-47 immutable movement ledger. SS-1118 extends the existing Inventory page.

- `GET /api/v1/inventory/positions`: Seller Owner/Staff own stock; Warehouse Manager
  in assigned warehouses. Includes physical unreserved quantity and eligibility explanation.
- `GET /api/v1/inventory/ledger`: Seller Owner, Ops Dispatcher, Warehouse Manager.
  Stock movement evidence is distinct from the financial ledger; no COD, costs or contact fields.
- Platform readers select an assigned warehouse. Seller/role/session changes discard pending
  responses and prior cached rows. A failed read is an error, never zero stock.
- Ledger has no mutation control. Seller Staff has no ledger tab or manual stock write.
- Existing aggregate and reservation screens keep their contracts; manual reservation release
  remains fail closed. SS-1116 Figma was excluded by the user.

Dependency: matching backend `feat/SS-1118-inventory-detail-api` and its parent branches.
Contract tests: `node --test tests/inventory-detail.test.mjs`. Full gate follows AGENTS.md.

## Inventory workspace UI

`InventoryWorkspace` composes role-specific tabs and one shared warehouse selector.
`inventory.stocks.view` is tenant-only, matching the existing aggregate controller;
`inventory.view` remains the route capability. Manager/Ops start on their first supported
view. Scope changes discard reader state. Failed reads never become empty inventory.

Design decisions, state matrix, verification and limits:
[Inventory UI review](../../../docs/INVENTORY-UI-REVIEW.md).
Local visual fixture: `node tests/inventory-ui-browser.mjs`. Role/render regressions:
`node --test tests/inventory-ui.test.mjs`.

## Sprint 6 returns and trace

`ReturnsWorkspace` uses the warehouse-scoped return API. Owner `/returns` can
request a partial post-delivery return and reuse the existing disposal/withdrawal
forms for quarantined stock. `/warehouse/returns` gives Ops authorization,
Staff arrival/QC/scanned stock and independent Manager review. Each action has
its own capability; hidden controls do not replace backend action/RLS checks.
Scope changes unmount pending forms and readers. An uncertain mutation retains
its operation ID and exact command for retry.

`LotTracePanel` is the last Inventory tab for Ops/Manager. Manager receives reverse
parcel trace; Ops also receives forward trace, masked audited CSV and recall.
CSV output neutralizes spreadsheet formulas. Return/trace Zod response schemas
reject unexpected financial/contact fields. Evidence bytes use the signed upload
URL without application authorization headers.

Contract/policy regressions: `node --test tests/sprint6-p3.test.mjs`. Synthetic
visual fixture: `node tests/fixtures/sprint6-preview-server.mjs`, then
`http://127.0.0.1:2346/tests/fixtures/sprint6-p3-preview.html?role=SELLER_OWNER`.
It overrides fetch with fictional local data; it is not a live-API acceptance
environment. Role may be OPS_DISPATCHER, WAREHOUSE_MANAGER or WAREHOUSE_STAFF;
locale and empty/error states are fixture options in its source.

Ops authorization now requires declared reverse-parcel weight/dimensions. The
queue shows verified reverse tracking and warehouse SMTP status without contacts
or money. An authorized request remains pending until carrier confirmation.
Ops can queue customer recall notices in bounded pages through the configured
seller webhook; the UI reports queued work and the webhook report shows ACKs.
The seller channel contacts the customer, as selected for this workflow.
Backend contract and migration limits:
`smartchain_be/docs/SPRINT6-P3-RETURNS-RECALL.md` in the sibling repository.
