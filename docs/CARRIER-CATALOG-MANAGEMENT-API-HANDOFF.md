# Carrier catalogue management — frontend/backend contract

Frontend prepared on 14/10/2026 for UC-91. Backend implementation belongs to Claude and is not claimed complete. Do not modify frontend files concurrently without coordinating. Existing GET list/detail must remain compatible. No changes to warehouse, carrier credentials, endpoints or booking adapters are included.

## Endpoints frontend now calls

All paths below are under `/api/v1/platform/carriers`, through the existing frontend apiClient. Only PLATFORM ORCA_ADMIN; server must enforce authentication/authorization, RLS context and masked audit independently of UI.

| Method/path                             | Request                                             | Successful response                                    |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| POST `/`                                | `{code,name,isActive}`                              | 201 standard success envelope, safe carrier projection |
| PATCH `/:id`                            | `{name,isActive,expectedUpdatedAt}`                 | 200 standard success envelope, safe carrier projection |
| POST `/:carrierId/services`             | service fields below                                | 201 standard success envelope, safe service projection |
| PATCH `/:carrierId/services/:serviceId` | service fields without code, plus expectedUpdatedAt | 200 standard success envelope, safe service projection |

Frontend reloads GET detail/list after confirmed mutation. It never synthesizes success data. Carrier and service codes are immutable on edit; default new carrier is inactive, default new service is active. Activation does not establish API integration. No delete endpoint: use isActive=false to preserve tariff/shipment references.

Carrier validation: code 1–50 uppercase ASCII letters/digits/underscore/hyphen; name trimmed 2–150. Preserve existing carrier identity codes such as GHN, GHTK, VIETTEL_POST. Global unique code enforced by database, not findFirst alone.

Service validation: code 1–50 ASCII letters/digits/underscore/hyphen (case preserved, e.g. road); name trimmed 2–150; transportMode ROAD/AIR/SEA/RAIL; volumetricDivisor integer 1–1,000,000; isActive boolean. maxWeightG nullable positive int ≤2,147,483,647. maxLengthCm/maxWidthCm/maxHeightCm/maxDimensionSumCm nullable positive decimals with ≤2 fractional digits and <1,000,000, respecting existing Decimal(8,2). These are proposed contract bounds; verify SRS/provider constraints before backend rollout and coordinate any adjustment with frontend.

Empty optional numeric fields send null, never zero. PATCH sends all editable service fields, including null limits, and expectedUpdatedAt from GET. Enforce carrier/service parent identity; reject service ID from another carrier. Database unique `(carrierId,code)` must handle concurrent inserts. expectedUpdatedAt must be checked atomically in updateMany/transaction; stale update returns 409, never overwrite.

Error envelope follows existing convention; relevant HTTP statuses: 400 invalid fields, 401 unauthenticated, 403 forbidden, 404 resource missing, 409 duplicate code/stale update. Register stable typed codes under owning module; do not leak SQL/Prisma errors. Unknown adapter must not become supported merely by adding metadata.

GET detail service DTO must include id, carrierId, code, name, transportMode, volumetricDivisor, the five numeric nullable limits, isActive, createdAt, updatedAt. Decimal cm fields serialize as bounded JSON numbers consistent with existing GET DTO; no credential fields. GET detail currently contains endpoints; frontend retains validation compatibility but does not render endpoint/environment technical fields. Mutation response is not rendered directly; successful reload is authoritative.

## Remaining backend/configuration work

- Implement endpoints/DTOs/application services/repositories using current package boundaries and platform rights; audit creates/updates, no owner/RLS bypass in web request path.
- Include inactive services in GET detail for editing; only active services under active carriers appear in tariff service metadata.
- Preserve snapshots/history when service metadata changes; review impact on currently published tariffs and queued booking candidates.
- Separate task: CarrierZone mapping and zone-selection API for purchase tariffs. No arbitrary zone strings or made-up coverage. Current frontend catalogue forms do not solve this dependency.
- Provider code mapping for booking remains mandatory where internal service code differs from provider code.
- Tests: roles, malformed inputs, unknown carrier, wrong parent, duplicate concurrent code, stale update, disabling service removes it from selectable tariff metadata, metadata update does not reprice historical snapshots.
- Run BE quality gate and real PostgreSQL/RLS checks before declaring complete.

## Frontend files

`GlobalCarrierCatalog`, `CarrierDetailModal`, `CarrierManagementForms`, `carrierManagementApi`, `carrierManagementSchema`, vi/en messages. UI removes unsupported marketing claims, endpoint/company metrics, and technical environment details. Create/edit form retains user input on failure; codes read-only on edit; all network calls use apiClient. Backend absent → actual API error, not mock success.
