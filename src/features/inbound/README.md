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
