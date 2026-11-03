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
  records the agreed amount only, no money is posted from the UI.
