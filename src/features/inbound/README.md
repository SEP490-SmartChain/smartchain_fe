# Inbound ASN

## Web receiving media and SKU policy (16 October 2026)

Starting arrival opens the receipt workspace immediately. Receipt-level photos,
MP4/WebM videos and observation notes can be saved before counting, including when
zero units arrive. Camera capture has a local preview and file-picker fallback;
recording is silent and stops at 60 seconds. Images are limited to 5 MiB and videos
to 50 MiB. Draft camera/files and unknown uploads protect receipt navigation;
retry keeps the same file, metadata and operation reference. LAN HTTP uses native
capture/file selection and SHA-256 fallback. The Vite development storage proxy
removes app credentials and preserves signed object requests, avoiding CORS and
phone-localhost failures; production keeps direct signed HTTPS storage URLs.
Only the original uploader can remove their receipt-level media while the receipt
is open. Removal is confirmed in the UI and retried safely if object cleanup is
interrupted; counted-lot QC photos remain attached to their inspection history.

Count validation uses the selected SKU's `trackLot`, `manufactureRequired`,
`trackExpiry` and duration. Staff never types a lot code; the server creates an
internal receiving reference. Date
labels indicate conditional requirements and preview expiry derived from physical
manufacture plus configured duration. Missing required dates block submission;
SKUs without expiry tracking never require an expiry date. Manufacture is a
separate SKU policy. Required count fields use the shared red asterisk, including
conditional date requirements; expiry becomes optional when it can be derived.
The form explains the current SKU policy and a missing duration without showing
an empty duration as a number of days.
The receipt evidence note can record an unreadable or missing label without
inventing a date. Manager approval requires at least one verified receipt or lot
evidence item; the server returns an actionable `EVIDENCE_REQUIRED` blocker.

Backend contract and required migration:
`smartchain_be/docs/RECEIVING-WEB-MEDIA.md`. Release the API and web together.
Manager RETURN starts a new receiving round. Staff sees the return reason and
must capture new media, recount each line, submit new QC and report current
exceptions. Previous counts, media and reports remain in history and cannot be
reused to complete the new round. The workspace refreshes on focus and checks
for server changes every 15 seconds while no command is pending.
Existing counted-lot damage photos retain their original QC contract. Counts,
Manager review, stock recognition and sellable putaway remain separate effects.

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

The sidebar has one **Inbound / Nhập kho** entry. Its arrival, receiving/QC and putaway
tabs retain their existing URLs under one shared layout and one assigned-warehouse selector.
The directory is loaded once for the layout; a single assigned warehouse is selected
automatically. Tab changes retain the selected warehouse. A warehouse or identity change
unmounts the previous work and aborts its pending reads. Pending receipt/putaway commands
lock the shared selector and tabs until the existing retry flow resolves them.

`/warehouse/receiving` lists ASNs in the selected assigned warehouse. Warehouse
Staff can enter an ASN code or scan the seller's carton reference, then confirm
physical arrival. Manager can read the directory but cannot check in without a
Staff role. The command posts only the displayed ASN version to
`POST /v1/warehouses/:warehouseId/asns/:id/arrival`.

Arrival displays the server timestamp and receipt reference after confirmation;
it does not increment received, accepted or sellable quantities. Repeated scans
return the original receipt. Conflicts retain the confirmation dialog and offer
reload; obsolete warehouse/identity responses do not populate the new view.
UC-38 uses the standalone receipt workspace and the separate physical-count API.

SS-1302 uses a strict warehouse-only directory DTO. Seller declarations and
expected quantities are absent from the directory; rows must belong to the
selected warehouse. Arrival confirmation must match the requested ASN and
warehouse and cannot contain private extra fields. See
[`SS-1302-PERMISSION-AUDIT.md`](../../../docs/SS-1302-PERMISSION-AUDIT.md).

## Physical count (SS-1071 / FU-21 / UC-38)

Staff opens an arrived receipt, selects an uncounted SKU and enters observed
total plus any required date-specific quantity rows. The server generates lot
codes when the seller has not supplied packaging codes. Staff and Manager see a compact
comparison table with seller-declared `declaredQty`, saved actuals and variance,
plus the seller-declared `cartonCount`. The actual-count input starts blank.
Explicit zero creates no lot. Lot quantities must total the observed count and dates must be real.
Warehouse-local shelf-life and existing provenance are validated by the backend.

The workspace reads `GET /v1/warehouses/:warehouseId/asns/:id/receiving` and posts
`POST /v1/warehouses/:warehouseId/asns/:id/receiving/counts` with the receipt
revision and operation UUID. An uncertain result freezes the attempted count and
offers replay with the same UUID or a read to check saved evidence. Saved counts
are immutable through this initial-count form. Manager reads the same comparison;
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
`orca_be/docs/SS-1071-RECEIPT-PHOTOS.md`. Classification and Manager disposition
must be implemented before SS-1071/SS-1070 can be considered complete.

## Manager receipt review (SS-1071 / FU-21 / UC-41)

The standalone receipt workspace shows current lot QC partitions, missing discrepancy reports
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

An approved receipt does not itself create stock. Seller notification delivery remains
pending integration; a durable outbox intent is not proof of delivery. Original discrepancy
reports remain immutable OPEN submissions; Manager history describes their disposition.
SS-1072 receive, SS-1073 billing/webhooks and actual Seller notification delivery remain
outstanding. Do not mark the entire SS-1070/1071 task complete based on these screens.

## Reviewed stock recognition (SS-1072 / FU-21)

Each physical lot has a stock-recognition section. Assigned Staff chooses an area followed
by a receiving/quarantine bin and submits only operation, receipt
revision and bin references. Manager reads physical recognition history without a write form.
The backend derives quantities from Manager-approved QC and delegates stock effects to P3.
Rejected units are excluded; receiving/quarantine stock is not sellable before confirmed putaway.

Strict response schemas check record/receipt identity, physical partitions, selected bins and
actual source quantities. Unknown replies preserve the same command and operation for retry;
confirmed conflicts reload evidence. Scope/identity changes abort requests and clear old data.
The bounded list shows SKU dimensions and unit weight, total receiving weight/volume,
and each bin's remaining/maximum weight and volume. Server-provided blockers disable
insufficient or incompatible bins and the submit action. Shelf-life quarantine uses
the effective server partition. Capacity is checked again under server locks; a
capacity conflict remains visible after the list refreshes. Manager sees the same
physical measurements with read-only recognition evidence. Occupancy identities and
unrelated Seller inventory/finance are never exposed. API and web must be released together.

## Assigned putaway (SS-1078 / FU-22 / UC-42/43)

`/warehouse/putaway` reads the assigned warehouse's cursor-paginated tasks. Manager
selects a live assigned Staff from IAM's minimal picker; Staff claims an OPEN task
and scans receiving bin, storage bin, SKU, lot and the observed whole task quantity.
The form starts blank. Wrong quantity is rejected locally and the server remains
authoritative for scans, version, current assignment, lot eligibility and capacity.
Manager reads outcomes without a physical-confirmation form.

The same tab also reads `/putaway/waiting` through the existing assigned `asn.read`
scope. It shows current approved quantities that have not been planned, even when
there are no tasks yet: product, source bin, unplanned units, total kg/m³ and a short
reason (stock recognition, suitable storage capacity, planning, quarantine or blocked
source/lot). ASN and lot references are collapsed. It never presents a capacity
exception as an empty warehouse, uses no historical outbox flag, and never schedules
or posts stock from a read. Waiting rows have independent pagination. When waiting
rows are visible, the idle page refreshes every 30 seconds and on focus; selected or
pending task forms stop that refresh. Failed or malformed reads remain errors.
For capacity-blocked rows, Managers open **Arrange putaway** in this same workspace.
It resolves the exact assigned platform warehouse from the paginated directory and
reuses catalog layout commands, filtered to STORAGE zones. Managers can add or edit
the physical bins, then recheck tasks; existing worker planning remains authoritative
and no synthetic task or capacity is created. Open layout forms lock scope and pause
inbound reads until closed or saved. Staff sees a disabled claim and a compact blocker.
Task cards name the assigned worker when available and expose
Assign, Claim or Put away according to role, task state and assignee. Opening one
focuses its form; Staff cannot operate another worker's assigned task.

Strict adapters reject private/unrelated fields, inconsistent task states and
mismatched task/actor/revision/quantity replies. Unknown transport results retain
the exact attempted command and operation UUID. Controls that would change scope
or replace the attempted task are locked until replay resolves it. Identity/scope
changes abort old requests and discard stale records. The backend posts physical
movements through P3 and only confirmed accepted goods become SELLABLE.

Whole-parent demo/UAT remains separate work; this page does not imply billing,
Seller notification delivery or completed quarantine handling.

## Same-warehouse relocation (SS-1078 / FU-22 / UC-44)

The putaway page also shows minimal unreserved stock positions for assigned
Manager and Staff. Users select a source, search compatible active destination
bins and enter actual source/destination, SKU and lot scans, observed quantity
and a reason. SELLABLE moves inside STORAGE; QUARANTINE moves inside QUARANTINE
and retains its state. The UI starts scans blank and displays the source state.
Authoritative occupancy, held capacity, revision and current scope are checked
by the server before P3 posts the paired physical movement.

The strict relocation adapter rejects private fields, malformed positions and
proofs with different stock, destination, quantity, state or revision. An unknown
reply retains the exact attempted operation for replay; it freezes warehouse,
task and relocation changes until resolved. Task and relocation writes cannot
run through one another's pending forms. Obsolete identity/warehouse requests
are aborted and their results discarded. Successful movement reloads actual
positions without changing QC or reporting them as newly received stock.

The backend contract is `orca_be/packages/inventory/BIN-RELOCATION.md`.

## Receiving UX update (SS-1071, 15 October 2026)

`/warehouse/inbound` now opens the real receiving directory filtered to SUBMITTED ASNs.
The copy calls these “Chờ nhận hàng”: Seller-submitted notices awaiting physical arrival,
not carrier tracking. Expected arrival is nullable operational metadata. Draft notices
remain Seller-only. Directory rows expand their already-fetched safe product summaries.

An entirely fetched one-warehouse directory auto-selects that warehouse. Multiple assigned
warehouses still require an explicit selection with an explanation; the proposed global
assigned-work endpoint, global pagination and RLS design are separate work. Empty assignment
and failed directory reads have different messages. Filters do not grant warehouse access.

The receipt stays open after counts are saved. A count/inspect/review guide precedes the
form; packaging dates appear only for expiry-tracked products. Select one saved physical
lot to work on its photos, QC and stock section, avoiding a detail request per lot on open.
Verified photo uploads refresh QC photo choices without clearing the QC form. Discrepancy
reporting reuses server evidence, photo IDs and the selected QC reason. No new submission
state or automatic Manager approval is introduced.

Manager review summarizes physical partitions and server-projected readiness blockers.
Older review responses without blockers receive general guidance only. Readiness is a
snapshot, not a promise that the next write succeeds. RETURN needs explicit confirmation
that every lot is sent for reinspection; original counts and history remain intact. Known
decision conflicts refresh evidence and retain the user's reason; uncertain responses freeze
the exact command. Pending photo/QC/report/review/stock work locks receipt Back, lot switching,
count writes and parent reload so those controls cannot discard a pending retry.

Discrepancy responses keep `declaredQty` null and expose only a server-derived
variance after complete count/QC. Its adapter rejects raw declarations; receipt reads
separately allow per-line declarations for comparison. Release the
backend and frontend together: old strict clients reject the added variance/date fields,
and the new discrepancy client rejects the old raw-declaration response. This change does
not add permissions or bypass server role, assignment, evidence or version checks.

Run the isolated visual harness with `node tests/ss-1071-ux-browser.mjs`, then open
`http://127.0.0.1:24371/`. Role/scenario selectors exercise the real application against
synthetic local transport, without .env or external providers. These browser checks are
separate from the backend's restricted PostgreSQL integration tests; they are not evidence
of a live provider or production end-to-end workflow.

## Receiving comparison (16 October 2026)

Receipt reads add seller-declared cartons and per-SKU units for both assigned Staff
and Manager. The compact table shows declared, saved actual and signed variance;
uncounted values remain `—`, including on a fresh reinspection round. Actual zero
remains an explicit saved count. These fields never prefill a count or post stock.
The directory, financial/privacy restrictions and action grants are unchanged.

The UI uses short labels, compact blockers and collapsed decision history. Release
frontend and backend together: the strict receipt schema requires `cartonCount` and
`declaredQty`; an older backend response fails validation rather than showing zero.
