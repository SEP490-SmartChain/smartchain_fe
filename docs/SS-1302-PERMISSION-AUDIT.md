# SS-1302 — seven-role UI, field and download audit

## Scope

This audit starts from `origin/develop` at `566488d`, on
`codex/SS-1302-permission-audit`. SS-990 stays on its separate branch;
its uncommitted work is preserved in the named SS-990 stash. Commercial screens
from that branch are outside this snapshot.

Expected roles follow [RBAC scope](RBAC_UI_SCOPE.md), the ORCA baseline references
in the backend traceability, and the independent tables in the executable tests.
Original Report 1–3 files were unavailable in the workspace. This is evidence for
implemented surfaces, not approval of the reports or completion of every ORCA UC.

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

Business CSV/XLSX/PDF exports and outbound packing labels are not implemented in
the audited snapshot and are **not verified**. Unknown export/print capabilities
fail closed. Seller ASN carton printing is an existing operational feature, not
a financial export. Download testing covers private receipt photos; a signed URL
already issued remains valid for its backend TTL (up to five minutes).

Core backend `contract.read` now excludes Seller Staff; `contract.approve` excludes
Accountant. The backend audit records the exact route inventory, narrowed handler
rules, RLS evidence and limits in `smartchain_be/docs/SS-1302-PERMISSION-AUDIT.md`.
Unimplemented workflows and SS-990 acceptance testing remain separate.

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

On 2026-10-13 the full suite (32 test files) passed with concurrency one.
Strict `tsc --noEmit`, full lint, source formatting and production build passed.
Lint retains 24 pre-existing warnings; Vite reports the existing large bundle
warning. Checkout CRLF was normalized to LF without unrelated content changes.
No project database or new dependency is required by these frontend tests.
