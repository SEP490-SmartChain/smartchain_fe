# SS-1314 UI verification

Run `node tests/fixtures/preview-claims.mjs`, then open `http://127.0.0.1:2328/tests/fixtures/claims-preview.html` in Chrome. `?role=accountant` selects the decision role. This isolated preview renders production components against synthetic API responses, never a project database. Its first warehouse-A create persists but returns503 to exercise an uncertain result; its first image intent returns EVIDENCE_EXPIRED. The preview-only PNG button creates a fixed synthetic File through the actual image input/change handler, then the production checksum/upload/confirm code runs. Native browser file chooser transport was not verified.

2 November browser checks:

- Warehouse A uncertain create; switch B opens a blank independent form and creates a different case; return A restores its original payload/reference, retry reveals one original case.
- Expired image shows a localized instruction and clears the stale file reference; replacement image verifies and enables completion of investigation.
- Ops records warehouse responsibility and completes investigation after evidence; Accountant reviews and approves the exact capped amount (150,000 VND in this fixture); the credited case hides mutation controls.
- All-status filter is explicit/selectable. Pending requests show same-request retry guidance without conflicting refresh instructions. Snapshot and declared-cost inputs have separate React identities.

The fixture posts credit immediately for UI presentation. Real asynchronous credit, private object integrity/download, invoice attribution and access isolation are verified separately by BE disposable PostgreSQL/Redis/MinIO suites; this is not live full-stack E2E. Browser download/view and native file picker are outside this UI proof.

FE TypeScript, lint, format, all1,392tests and production build passed. The warehouse pending regression first failed against the old key and then passed. Additional auth-scope, checksum and strict-schema tests remain in the full suite.

## 3 November follow-up

The warehouse selection now derives from the current validated URL, so history navigation changes the scope boundary instead of retaining the initial warehouse state. The preview detail endpoint enforces warehouse matching to expose stale-scope requests.

Current-profile Chrome verified warehouse A uncertain create, isolated blank warehouse B form, and successful warehouse B creation with the correct detail, source, quantity and 150,000 VND ceiling. Browser automation disconnected during Back and was then stopped by its URL-confidence safety check. Back/Forward and A replay in this follow-up are therefore **not verified**. The earlier 2 November proof above does not certify the new Back/Forward correction. The latest browser session also did not repeat photo upload or Accountant approval.

FE TypeScript, format check, all 1,415 Node tests and production build passed. Lint completed with zero errors and existing warnings; the incoming Topbar formatting warning was subsequently fixed. PostgreSQL/Redis/MinIO claim integration passes 36 scenarios on the BE branch. This remains component UI with synthetic API responses plus separate real-service integration, rather than browser-to-database E2E.

## 3 November history acceptance — resolved

The earlier Back/Forward verification gap is now closed for the component UI preview. The current Chrome profile containing Sprint 7 Jira/Drive tabs was used again after the browser connection recovered. No browser protection was disabled.

A second issue was reproduced on `d91944e`: opening/closing the create form on the queue pushed the same queue URL into history. After creating B, Back returned to B list, a second Back still showed B, and only a third Back returned to A. The form toggle now navigates to the queue only when clearing an existing claim detail (`claimId` is present). Opening/closing a queue form only changes its local visibility.

Repeatable regression scenario with the production ClaimsPage and synthetic fixture API:

1. Enter the canonical A queue by selecting B then A. Create A; the fixture persists it and returns503.
2. Select B. Its form is blank and independent. Open, close, reopen the form, then create B.
3. Back once: B queue, no detail. Back again: URL warehouse A, selected A and only the A claim. No extra Back is needed after any form toggle.
4. Forward once: B queue and only B claim. Forward again: the original B detail ID and B warehouse.
5. Back twice to A, reopen the form: the pending A note is restored. Replay returns the one A claim, with no duplicate row.

The fresh run passed all these steps after the change. UI assertions additionally checked URL suffixes, warehouse selection, A/B row counts and original B detail identity. The same run verified expired image feedback, selecting the synthetic PNG again through the actual input handler, verified evidence, Ops investigation completion, then Accountant approval of150,000VND. The credited case hid the decision action. The preview posts credit immediately; this is not proof of asynchronous live ledger posting.

Proof artifacts in the parent workspace `outputs/`: `qa-claims-history-duplicate-red.md`, `qa-claims-history-green-back1-b.txt`, `qa-claims-history-green-back2-a.txt/.png`, `qa-claims-history-green-forward1-b.txt`, `qa-claims-history-green-forward2-b.txt/.png`, `qa-claims-history-green-a-replayed.txt`, `qa-claims-history-green-evidence-expired.txt`, `qa-claims-history-green-ops-reviewed.txt`, `qa-claims-history-green-accountant.txt/.png`, and `qa-claims-history-green-checks.json`. These contain synthetic data only. Native file chooser, browser download and live browser-to-database E2E remain outside this acceptance.

Post-change verification: TypeScript, lint (zero errors;35existingwarnings), source formatting, all1,415Node tests (zero failed/skipped), and production build passed. The existing Vite large-chunk warning remains. The browser RED/GREEN proof is the maintained scenario above; no source-text assertion or production test hook was added.

## 3 November live search usability correction

An explicit search previously filtered the parcel-item dropdown but left its placeholder
selected even when the server returned only one eligible result. The live Seller Owner
page reproduced this with an exact order reference. The result now selects automatically
after an explicit nonempty search only when the complete result has exactly one item
with remaining claimable quantity. Exhausted items and incomplete pages never cause an
implicit selection. Multiple and empty results have localized status feedback.

A new search clears the previous source, entered unit cost and quantity, while keeping
the incident description. Changing the selected source also clears its prior cost and
resets quantity. Submit stays disabled while loading. Enter in the search field performs
the lookup instead of submitting the claim. Pending uncertain commands retain their
disabled form and original payload/reference.

Current-profile Chrome verified the production localhost API: exact order search
selected its one item without opening the dropdown; a shared SKU returned three
results and required an explicit choice; an unmatched reference displayed the empty
message and disabled creation. The previous entered cost cleared on search. The form
was returned to the user's exact order, selected, without creating a claim. Snapshot
evidence is in the parent workspace outputs `claims-search-single-green.txt/.jpg`,
`claims-search-many.txt` and `claims-search-none.txt`.

The selection regression failed before implementation and passed afterward, including
exhausted, ambiguous and paginated results. Final TypeScript, lint (zero errors,35existing
warnings), format check, all1,417Node tests (zero failed/skipped), and production build
passed. No BE or database change was needed.
