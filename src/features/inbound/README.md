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

## Manager receipt review (SS-1071 / FU-21 / UC-41)

The physical receipt dialog shows current lot QC partitions, missing discrepancy reports
and immutable Manager decisions. Assigned Staff reads the history; only assigned Manager
has `warehouse.asn.review` and sees APPROVE/RETURN with a required reason. A decision binds
the complete current evidence IDs and receipt revision. Approval is disabled until all
physical exceptions have been reported; RETURN allows Staff to append a new inspection.

`reviewApi` uses the matching `receiving/reviews` GET/POST endpoint and validates scoped,
minimal responses, evidence identities and full physical QC partitions. After an uncertain
transport result, the exact operation, payload and receipt identity are frozen for retry.
Known validation/permission/conflict responses reload evidence. Warehouse, ASN or actor
changes abort requests and clear obsolete state. Saved decisions refresh both the receipt
and ASN directory so the current operational status appears immediately.

An approved receipt does not itself create stock. The UI explicitly shows Seller notification
as pending integration; a durable outbox intent is not proof of delivery. Original discrepancy
reports remain immutable OPEN submissions; Manager history describes their disposition.
SS-1072 receive, SS-1073 billing/webhooks and actual Seller notification delivery remain
outstanding. Do not mark the entire SS-1070/1071 task complete based on these screens.

## Reviewed stock recognition (SS-1072 / FU-21)

Each physical lot has a stock-recognition section. Assigned Staff searches by receiving-bin
code/barcode, chooses receiving/quarantine locations and submits only operation, receipt
revision and bin references. Manager reads physical recognition history without a write form.
The backend derives quantities from Manager-approved QC and delegates stock effects to P3.
Rejected units are excluded; receiving/quarantine stock is not sellable before confirmed putaway.

Strict response schemas check record/receipt identity, physical partitions, selected bins and
actual source quantities. Unknown replies preserve the same command and operation for retry;
confirmed conflicts reload evidence. Scope/identity changes abort requests and clear old data.
The list offers a bounded server search; it never loads unrelated Seller inventory or finance.

## Assigned putaway (SS-1078 / FU-22 / UC-42/43)

`/warehouse/putaway` reads the assigned warehouse's cursor-paginated tasks. Manager
selects a live assigned Staff from IAM's minimal picker; Staff claims an OPEN task
and scans receiving bin, storage bin, SKU, lot and the observed whole task quantity.
The form starts blank. Wrong quantity is rejected locally and the server remains
authoritative for scans, version, current assignment, lot eligibility and capacity.
Manager reads outcomes without a physical-confirmation form.

Strict adapters reject private/unrelated fields, inconsistent task states and
mismatched task/actor/revision/quantity replies. Unknown transport results retain
the exact attempted command and operation UUID. Controls that would change scope
or replace the attempted task are locked until replay resolves it. Identity/scope
changes abort old requests and discard stale records. The backend posts physical
movements through P3 and only confirmed accepted goods become SELLABLE.

UC-44 relocation and whole-parent demo/UAT remain separate work; this page does
not imply billing, Seller notification delivery or completed quarantine handling.
