# Physical handover evidence — SS-1193 / UC-88–89 / BR-24

New drafts receive a server-generated `BG-YYYYMMDD-<12 random hex>` code using
Asia/Ho_Chi_Minh. Existing manifest codes and signed records are unchanged.

`carrierAckRef` is optional. Omit it when the carrier supplies no receipt number;
blank strings normalize to omission. Never substitute an invented carrier receipt
or the ORCA manifest code. Existing carrier references remain readable.

Signing requires the actual parcel count (1–100), the carrier representative's
name and `evidenceKey` for a photograph of the signed physical handover document.
A typed name is not a carrier signature. Deploy the API and FE together: old
clients without an evidence photograph receive validation rejection.

Staff upload using `POST /v1/warehouse/fulfillment/manifests/:id/evidence/presign`
then PUT to private storage with the exact signed headers, then POST
`.../evidence/confirm`. Metadata is JPEG/PNG/WebP, 12 bytes–5 MiB and SHA-256.
Keys bind warehouse, manifest, current membership digest, uploader and exact
bytes. Verify bytes outside row-lock transactions; reauthorize after I/O and
inside the final transaction. Only a stored photograph is placed in
`manifest.evidenceKey`; no new synthetic `carrier-ack/...` evidence is created.

Staff/Manager can POST `.../evidence/download` with `handover.read` for the
photograph attached to a signed manifest in their live assigned warehouse.
Legacy acknowledgement-only records remain immutable and display an explicit
missing-photograph explanation. Private keys and signed URLs are not list fields.

Staff/Manager may POST `.../remove-parcel` with an operation UUID and shipment UUID
to remove an unhanded parcel from a DRAFT. The narrowly scoped migration function
does not grant generic DELETE access. Parent/parcel/shipment/manifest lock ordering
and durable operation hashing are preserved. An empty draft is retained for audit
and hidden from the active list; removed parcels return to the eligible queue.
Changing membership invalidates previously uploaded photographs for signing.

On timeout, retry the exact operation UUID and payload. Exact concurrent sign
requests return the committed result even if another request signs during photo
verification. Changed payload/actor/kind conflicts; revoked authority is rechecked.

SIGNED means the warehouse recorded physical handover. It does not fabricate a
carrier pickup timestamp, tracking callback, legal digital signature or delivery.
UI shows carrier handling separately, accepting an actual pickup timestamp or an
existing normalized post-pickup tracking status. Automated carrier polling,
provider-specific electronic manifest submission and configurable pickup SLA
alerts are separate integrations; this change does not claim they exist.

References researched for this change:

- [Nhanh.vn: carrier manifests and courier signature](https://pos.manual.nhanh.vn/pos/don-hang/bien-ban-ban-giao)
- [BigSeller: printed parcel count, waybills and courier signature](https://help.bigseller.com/vi/detailPage/3/1/1170/content)
- [ShipStation: carrier-specific electronic or physical manifests](https://docs.shipstation.com/manifests-scanforms)

Verification includes DTO and FE validation, StrictMode lifecycle, byte-bound
private object identities, real PostgreSQL RLS/manifest immutability, draft removal,
exact concurrent replay and the existing storage verifier's checksum/type rules.
Database tests use disposable PostgreSQL/Redis. No real carrier receipt or signature
is invented for the user's current QA order.
