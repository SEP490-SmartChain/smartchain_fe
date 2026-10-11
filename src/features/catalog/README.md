# features/catalog

Kho logic, SKU, hãng vận chuyển, bảng giá hợp đồng, credential 3PL (BYOA) và ping-test. BE: `catalog`. SRS: FE-08 → FE-11.

## ORCA API response contract

Directory APIs return arrays in `data` and cursor information in `meta.pagination`.
Warehouse DTOs include nullable `tenantId`/`districtCode`, region, operating hours and
`version`; ORCA platform ownership is represented by `tenantId: null`.
Creation requires `region`. Status changes call `PATCH /v1/warehouses/:id/status`
with `status`, `reason` and `expectedVersion`, and reload confirmed server data.
Request/validation errors render a retry state rather than an empty directory.

Regression checks: `node --test tests/orca-api-contracts.test.mjs`.
