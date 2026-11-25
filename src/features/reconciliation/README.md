# features/reconciliation

Tải file quyết toán, lô đối soát, cờ sai lệch, ticket khiếu nại, xuất báo cáo. BE: `reconciliation`. SRS: FE-41 → FE-46.

## SS-1288 Accountant review (UC-140–143)

- `SettlementExceptionsModal`: exception rows of a batch; `NOT_FOUND`/`AMBIGUOUS` rows of an open batch
  can be matched manually (waybill + reason); disputable rows can be selected to open one carrier dispute.
  Success is shown only after the API confirms; the batch list is then reloaded.
- Batch list: **Export to Excel** downloads the exceptions workbook streamed by the API
  (`apiClient.downloadXlsx` accepts only an `.xlsx` ZIP response, ≤ 200 MB).
- `CarrierDisputes` (tab "Khiếu nại hãng"): list by status, detail with rows and correspondence, status
  change `OPEN → SUBMITTED → ACKNOWLEDGED → RESOLVED | REJECTED` with the dispute version; resolving
  submits explicit gross COD allocations per matched discrepancy and requires linked bank evidence. Only the backend posts COD and sourced corrections.

## Verified COD and weekly payout (22 November 2026)

Accountants use **Bank evidence** on a batch (including completed batches with open
COD disputes) to link manual receipts or select authenticated unmatched production
SePay transfers. Amounts remain exact strings; immutable evidence can be retried
without creating another link. The bank reference and receipt reference must be
retained. Sandbox SePay transfers are excluded from the picker and rejected by BE.

Batch deadlines and late badges use the server schedule; the list warns about
unfinished/exception batches. The expandable COD aging report groups overdue
uncredited parcels by carrier and seller with bounded pagination. Statement details
show pending reconciliation count and late transfers; Accountant approval remains
available Thursday through before the next Monday 06:00 cutoff.

Deploy backend migrations `20261122090000`–`20261122094000` first. Native GHN/GHTK
files still require real examples before adapters can be implemented.

## Isolated browser regression (23 November 2026)

Run `node tests/fixtures/recon-money-preview.mjs` from the frontend root and open
`http://127.0.0.1:2347/tests/fixtures/recon-money-preview.html`. This serves the real
settlement and payout components with a synthetic API; it never connects to the
project database, carrier, SePay or bank. `?fail=sepay` and `?fail=receipts` test
independent read failures; `?payout=APPROVED` and `?payout=PAID&locale=en` exercise
transfer forms and recorded evidence. The fixed sample period is intentionally
closed after 23 November 06:00 Vietnam time; the approval button must be disabled.

SePay read failures preserve linked bank evidence and manual entry. A failed evidence
read displays an error instead of a misleading empty list. Export failures are
visible on the batch screen. Money follows the selected vi/en locale without
converting integer strings to floating point. This fixture verifies UI behavior,
not backend financial posting or real delivery.
