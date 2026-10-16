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
