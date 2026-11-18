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

## Sprint 7 cycle count (P3 C07)

`/warehouse/counts` opens `InventoryWorkflowWorkspace` on the count tab. The
screen capability is `inventory.counts.view`; mutations are narrower:
`inventory.counts.plan` covers Manager create/assign/review/resnapshot/post and
`inventory.counts.observe` covers Staff blind observation. The generic
`inventory.workflows.view` screen grant never substitutes for either action, and
a direct URL outside the route policy is denied by the shared guard.

Request bodies are typed from the P3 C02 artifact
`api/p3-wire.generated.ts` (`P3WireRequests` → `CountPlanRequest`,
`InventoryWorkflowCommandInput`, `EvidenceDigest`). Types are compile-time only;
count/options/result/page responses still pass the existing strict Zod schemas,
so a server payload with extra financial/contact/expected-qty fields on a Staff
blind projection fails parsing instead of reaching the UI.

Each modal keeps one `operationId` UUID for its lifetime and retries the exact
same command body (including `expectedVersion`) after an unknown outcome; the
response `version` is never reused as the operation key. Count review/post do not
optimistically write stock: the list only reloads after server confirmation.
`observedQty: 0` is a real counted result, while `null` means not counted yet.
Evidence upload signs the bytes first and re-checks the auth-store revision before
and after the signed PUT and after the download URL read, so a session/scope
change cannot show a previous seller/warehouse's evidence. The workspace wrapper
is keyed by `revision` and its reads also verify the revision before rendering,
so an in-flight response from a previous scope is discarded.

Regressions: `node --test tests/sprint7-cycle-count.test.mjs` (typed payload
against the frozen wire catalog, Staff/Manager authority and route denial, zero
observed quantity, durable operation/version retry, scope-change rejection).
The connected browser proof belongs to C08/C12 and is not asserted here.
