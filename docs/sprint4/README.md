# Sprint 4 UI review

Latest seller creation fixes and PM acceptance review: [PM review 09/10/2026](PM_REVIEW_CREATE_ORDER.md).

`seller-orders-mockup.svg` contains editable vector frames for list/filter, detail, manual entry and Excel import. Import this SVG into the chosen Figma file for SS-1169; no cloud upload has been performed. Screenshots record the implemented components using synthetic fixtures.

Isolated preview, from the FE root:

```bash
node tests/fixtures/preview-orders.mjs
```

Open `http://127.0.0.1:2326/tests/fixtures/orders-preview.html`; add `?role=staff` for Staff. The preview serves 50 synthetic orders and local API fixtures, with no real API/Google Sheets/database connection. It is excluded from the production router and build. It supports list/filter, detail and manual acceptance for visual review; Excel persistence is covered by real PostgreSQL integration tests in BE, not this fixture.

Chrome checks: list has 50 entries; ALLOCATED status selects one row; manual submit displays a reference and a new row; channel filter finds it; Staff has no create/import/COD controls and no recipient/financial details. UI request/schemas, scope switching and stale session behavior also have automated tests.

Screenshots: `orders-list.jpg`, `orders-detail.jpg`, `orders-manual.jpg`, `orders-accepted.jpg`, `orders-staff-detail.jpg`, `orders-import.jpg`. All data is synthetic; screenshots demonstrate component layout rather than a deployed end-to-end environment.

UX update 09/10/2026: `orders-manual-friendly.png` and `orders-import-preview-friendly.png` show named address/product selection, automatic order codes and read-only import preview with correction feedback. The preview fixture now serves locations and synthetic preview outcomes; these outcomes are explicitly fixtures, not actual XLSX/database validation. Actual workbook and persistence assertions run in the BE integration suite.

## Actual local API verification — 09/10/2026

`orders-address-verified.png`, `orders-payment-verified.png`, and `orders-detail-payment-verified.png` were captured from localhost:2324 using API localhost:3000 and the local orca database, rather than the preview fixture. Official address data contains 34 provinces and 3,321 wards. Province changes reset the ward; Hanoi has 126 wards and Da Nang has 94.

The payment controls were exercised for COD, goods prepaid, partial payment and free shipping. One synthetic order `UX-VERIFY-20261009-PAYMENT` was actually accepted: DEMO-TEE × 2 at 100,000, goods COD 200,000, buyer shipping 30,000, collection total 230,000. It remains in the local DB as RECEIVED. Allocation/booking/reconciliation and live Google OAuth remain outside this verified result; see BE docs/SPRINT4_ORDER_INTAKE_HANDOFF.md for source conflicts and limitations.
