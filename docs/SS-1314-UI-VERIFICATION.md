# SS-1314 UI verification

Run `node tests/fixtures/preview-claims.mjs`, then open `http://127.0.0.1:2328/tests/fixtures/claims-preview.html` in Chrome. `?role=accountant` selects the decision role. This isolated preview renders production components against synthetic API responses, never a project database. Its first warehouse-A create persists but returns503 to exercise an uncertain result; its first image intent returns EVIDENCE_EXPIRED. The preview-only PNG button creates a fixed synthetic File through the actual image input/change handler, then the production checksum/upload/confirm code runs. Native browser file chooser transport was not verified.

2 November browser checks:

- Warehouse A uncertain create; switch B opens a blank independent form and creates a different case; return A restores its original payload/reference, retry reveals one original case.
- Expired image shows a localized instruction and clears the stale file reference; replacement image verifies and enables completion of investigation.
- Ops records warehouse responsibility and completes investigation after evidence; Accountant reviews and approves the exact capped amount (150,000 VND in this fixture); the credited case hides mutation controls.
- All-status filter is explicit/selectable. Pending requests show same-request retry guidance without conflicting refresh instructions. Snapshot and declared-cost inputs have separate React identities.

The fixture posts credit immediately for UI presentation. Real asynchronous credit, private object integrity/download, invoice attribution and access isolation are verified separately by BE disposable PostgreSQL/Redis/MinIO suites; this is not live full-stack E2E. Browser download/view and native file picker are outside this UI proof.

FE TypeScript, lint, format, all1,392tests and production build passed. The warehouse pending regression first failed against the old key and then passed. Additional auth-scope, checksum and strict-schema tests remain in the full suite.
