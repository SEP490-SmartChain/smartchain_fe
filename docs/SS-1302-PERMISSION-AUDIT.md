# SS-1302 — seven-role UI, field and download audit

## Scope

Updated 2026-10-14 on `feat/SS-1302-permission-audit`, after the existing merge of
`origin/develop` at `cceff92`. Commercial screens inherited from the SS-990 merge
are included. SS-990 branches/stash and provider templates are not changed.

Expected roles follow [RBAC scope](RBAC_UI_SCOPE.md), the ORCA baseline references
in the backend traceability, and the independent tables in the executable tests.
ORCA Report 1/2 `(1)` and Report 3 `(3)` were found and rechecked in Downloads;
the paired BE audit records the Report 3 hash and source limitations. This is
evidence for implemented surfaces, not approval of reports or every ORCA UC.

## Executable acceptance evidence

| Area                         | Test                                             | Boundary                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actions                      | `tests/ss-1302-action-matrix.test.mjs`           | Every implemented capability, all seven roles; catalogue completeness; same-scope grants; mixed, unknown, legacy and proposed grants deny                                |
| Routes and discovery         | `tests/ss-1302-route-surfaces.test.mjs`          | Every implemented route policy, all roles; sidebar/search agree; production component catalogue denied; revoked Owner grants disappear                                   |
| Blind receiving              | `tests/ss-1302-blind-receiving.test.mjs`         | Minimal warehouse DTO accepted; declaration, price, financial and secret fields rejected, including nested lines; foreign warehouse and duplicate IDs rejected           |
| Physical receipt and arrival | `tests/ss-1302-receipt-field-contracts.test.mjs` | Exact arrival allowlist and ASN/warehouse binding; private header/line/count/lot fields rejected                                                                         |
| Private downloads            | `tests/ss-1302-download-scope.test.mjs`          | All seven roles retain their session on 403; unsafe URLs/private fields rejected; role, seller, warehouse assignment changes and logout discard pending signed responses |

Tests exercise real policy, Zod schemas, API client and auth store through Vite
SSR. HTTP/storage responses are synthetic; backend authorization is established
by the paired backend route, projection and disposable PostgreSQL audit.
UI visibility does not grant API actions. A same-scope token refresh can retain a
pending response; changing authority cannot.

## Corrections

Completion review extends the independent tables with `contract.sign`,
`invoice.bankReceipt.post` and `/settings/contract` from the develop merge.
`tests/ss-1302-commercial-downloads.test.mjs` checks four PDF entry points,
unsafe URLs, exact fields, all seven roles on 403 and revoked pending responses.
Before correction, 24 of its 36 tests failed. All 36 pass with the strict
shared commercial download schema. This does not change signing behavior.

The existing Admin seller-directory CSV was omitted from the initial audit.
`tenantCsvExport` now requires the current PLATFORM Admin principal before
reading cached rows, quotes every cell, neutralizes spreadsheet formulas and
projects exactly nine visible directory columns. The button uses current policy;
a revoked role cannot issue a download. `tests/ss-1302-csv-export.test.mjs`
covers seven roles, mixed/unknown authority, formula/control characters, CSV
escaping and private extra fields. Only the displayed authorized page is exported.

The warehouse directory previously parsed the seller ASN DTO and displayed
`declaredQty`. That failed on the backend's minimal warehouse projection and
conflicted with blind receiving. `warehouseAsnSchema` now strictly accepts only
operational fields, and the receiving workspace displays actual quantities.
Seller ASN declarations and carton printing retain their existing owner/staff
scope.

Arrival responses now reject unknown fields and must match the requested ASN and
warehouse. This closes a response identity gap before data enters UI state.
The regression tests failed before each corresponding correction.

## Export and remaining scope

Implemented file/export surfaces are Admin directory CSV, commercial agreement
previews and private original/signed PDF downloads, receipt photos, avatar/logo
URLs, seller ASN carton printing and platform bin printing. Print allowlists are
code/carton references and warehouse/bin/barcode; they contain no money or
recipient fields. Unknown export/print capabilities fail closed. Reconciliation
XLSX, invoice PDF generation and outbound packing labels are separate unimplemented
use cases, not features introduced by this permission audit. A URL already issued
retains its documented backend TTL (up to five minutes).

Core backend `contract.read` now excludes Seller Staff; `contract.approve` excludes
Accountant. The backend audit records the exact route inventory, narrowed handler
rules, RLS evidence and limits in `smartchain_be/docs/SS-1302-PERMISSION-AUDIT.md`.
Unimplemented workflows and provider/legal acceptance testing remain separate.

## Browser verification

Run `node tests/ss-1302-browser-server.mjs` for an explicitly synthetic, loopback-only
transport fixture. It loads the real application, guards, screens and styles,
disables .env/proxy and all provider or financial operations, and is not a backend
integration or production acceptance environment.

On 2026-10-14 the browser showed Admin CSV access and 403 without export controls
for all six other roles. Staff receiving rendered only actual quantity after
warehouse selection. Owner contract screens rendered; Seller Staff was denied
on desktop and at 390×844. Screenshots were saved outside the source repositories.
Browser download-event capture timed out, so the local fixture now observes the
real UI-created CSV anchor without writing a file. The captured bytes showed nine
columns, a neutralized HYPERLINK formula and one authorized row. An empty selected
plan filter denied export instead of exporting hidden rows. This validates the
real click/serialization path alongside executable CSV tests; it does not claim
a browser filesystem download.

## Verification

Run the full Node suite sequentially to keep one Vite server at a time:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=768'
node --test --test-concurrency=1 tests/*.test.mjs
npm.cmd exec -- tsc --noEmit
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
```

On 2026-10-14 the full suite passed 653 tests across 35 files, concurrency one.
The earlier 2026-10-13 snapshot had 32 test files.
Strict `tsc --noEmit`, full lint, source formatting and production build passed.
The merged baseline retains 27 lint warnings, with zero errors and no warning in
the new CSV helper after formatting. Source formatting and production build pass;
checkout CRLF was normalized to LF without unrelated content changes.
No project database or new dependency is required by these frontend tests.
