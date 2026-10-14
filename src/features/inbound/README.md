# Inbound ASN

The ASN feature owns the seller-side draft, submit, track and cancel workflow
for SS-1063. Requests go through the shared API client so session refresh and
403 handling remain consistent with the rest of the frontend.

Owner and Staff use paginated own-SKU operational lookups, multiple declared lines,
carton count, optional lot/expiry and expected arrival. The detail dialog reads the
latest server revision, actual quantities and receipt/discrepancy references.
Draft edit, versioned submit and cancellation are state guarded. Creation retries
reuse an operation UUID; mutations and pending reads ignore obsolete identities.
Submitted cartons have an SVG Code 128 preview and print layout using the existing
encoder. Cancelled carton labels cannot be printed from this screen.

UC-36 replenishment suggestions await P1 SS-1004. Receiving/QC/putaway effects are
separate P2 tasks. This screen never fabricates available stock or receiving results.

## Warehouse arrival (SS-1071 / FU-21 / UC-37)

`/warehouse/receiving` lists ASNs in the selected assigned warehouse. Warehouse
Staff can enter an ASN code or scan the seller's carton reference, then confirm
physical arrival. Manager can read the directory but cannot check in without a
Staff role. The command posts only the displayed ASN version to
`POST /v1/warehouses/:warehouseId/asns/:id/arrival`.

Arrival displays the server timestamp and receipt reference after confirmation;
it does not increment received, accepted or sellable quantities. Repeated scans
return the original receipt. Conflicts retain the confirmation dialog and offer
reload; obsolete warehouse/identity responses do not populate the new view.
UC-38 uses the receiving count dialog and the separate physical-count API.

SS-1302 uses a strict warehouse-only directory DTO. Seller declarations and
expected quantities are absent from this workspace; rows must belong to the
selected warehouse. Arrival confirmation must match the requested ASN and
warehouse and cannot contain private extra fields. See
[`SS-1302-PERMISSION-AUDIT.md`](../../../docs/SS-1302-PERMISSION-AUDIT.md).

## Physical count (SS-1071 / FU-21 / UC-38)

Staff opens an arrived receipt, selects an uncounted SKU and enters observed
total plus lot breakdown and packaging dates. The form starts without seller
declarations or expected quantities. Explicit zero creates no lot. Lot quantities
must total the observed count, codes must be unique and dates must be real.
Warehouse-local shelf-life and existing provenance are validated by the backend.

The dialog reads `GET /v1/warehouses/:warehouseId/asns/:id/receiving` and posts
`POST /v1/warehouses/:warehouseId/asns/:id/receiving/counts` with the receipt
revision and operation UUID. An uncertain result freezes the attempted count and
offers replay with the same UUID or a read to check saved evidence. Saved counts
are immutable through this initial-count form. Manager sees actual counts only;
current role/assignment and writes remain server enforced.

Response schemas reject mismatched receipt/line/quantity, invalid lot totals and
unexpected private fields. Old warehouse or identity responses are discarded.
Recorded units and quarantine eligibility are evidence pending QC; they do not
become stock on this screen. QC classification, discrepancy and Manager review
remain separate work.

## Receipt photos (SS-1071 / FU-21 / UC-39)

Staff expands photos on a saved counted lot, selects JPEG/PNG/WebP (12 bytes to
5 MiB), then uploads and confirms evidence. Manager has a read-only list and
private preview. The backend owns live warehouse/receipt/uploader authorization;
the UI does not grant QC approval or stock posting.

`evidenceApi` validates minimal metadata, matching record/photo IDs, signed
checksum headers and HTTPS or loopback storage URLs. Private fields in a response
are rejected. PUT runs through `apiClient.uploadSignedImage` with credentials
omitted, no bearer token and redirect rejection. App APIs retain normal auth handling.

The exact file, SHA-256 and operation UUID are retained after an uncertain response.
Retry reuses the original intent; a verified replay skips PUT/confirmation. The
native file input resets after success so the same file can be selected again.
Scope or identity changes abort requests and discard obsolete responses/previews.
Pending photos cannot be previewed. At ten visible intents the picker is disabled;
the backend enforces the authoritative total including intents hidden from that user.

The API contract and storage deployment requirements are documented in
`smartchain_be/docs/SS-1071-RECEIPT-PHOTOS.md`. Classification and Manager disposition
must be implemented before SS-1071/SS-1070 can be considered complete.
