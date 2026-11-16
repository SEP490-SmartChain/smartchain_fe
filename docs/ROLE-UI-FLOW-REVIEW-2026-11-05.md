# Role-aware order and warehouse UI review

Date: 5 November 2026.

## Scope and display rule

Reviewed the existing order-to-warehouse flow: seller order allocation, inventory,
receiving/QC, putaway, picking, packing, handover, putback, returns and tracing.
This review does not certify every unrelated finance or administration screen.

Show information when it identifies the physical work, supports a decision, explains
a blocker or confirms the server result. Put technical lookup references in a
disclosure. Keep SKU, physical lot/bin scans, order codes, tracking numbers,
quantities, measurements and approval evidence available to their authorized roles.

## Role matrix

| Role              | Information and actions to preserve                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Seller Owner      | Own orders, allocation evidence, stock eligibility, authorized consent and financial details             |
| Seller Staff      | Own operational order/stock/ASN information; no financial fields or order creation                       |
| Warehouse Staff   | Assigned physical work, scans, quantities, QC evidence, parcel measurements and operational labels       |
| Warehouse Manager | Assignment, progress, quantities/evidence for approval and truthful read-only physical results           |
| Ops Dispatcher    | Existing exception, shipment, trace/recall and cancellation workspaces; no new warehouse execution grant |
| Accountant        | Existing financial screens; no new physical warehouse action                                             |
| Admin             | Existing configuration/administration scope; no new Staff or Accountant mutation                         |

The central capability policy, server authorization and API projections remain the
authority. Screen access does not imply every action on that screen is granted.

## Changes

- Removed the static sidebar card claiming that every service/carrier connection is
  healthy; the card had no live health source.
- Picking preview shows estimated orders and parcels. Normal hints omit technical
  line/candidate ceilings. The actual limits remain enforced by the backend.
- Preview no longer requires an assignee; creating/assigning a wave still does.
- Wave list and detail use the same short reference, retaining the full code in a
  tooltip. Manager guidance describes review rather than instructing physical scans.
- Shortage review includes reported observed, remaining and already-picked amounts.
- Packing detail remains visible for packed and label-waiting parcels. Manager sees
  contents/recorded measurements and correct pending-Staff guidance without a form.
- Handover explains why a parcel belonging to a different carrier connection cannot
  join the current selection. Printed manifests no longer lead with a carrier UUID.
- Receiving success keeps receipt references behind a disclosure. Discrepancy
  candidates and saved reports identify the actual SKU/product rather than a line number.
- Completed/cancelled putaway tasks show terminal guidance. Audit actor UUIDs are
  disclosed only when requested, without inventing an employee name.
- Empty allocation evidence no longer claims cancelled/failed orders are awaiting
  allocation or that withdrawal stock has already been reserved.
- Inventory workflow warehouse loading/failure/retry/empty states are explicit.
  Disposal cards show actually executed quantities and the consent/policy basis.
- Count/return/trace/ledger UUIDs sit behind lookup disclosures. Known lot/shipment
  states use translated labels with a neutral unknown fallback. Trace/return/ledger
  timestamps use the current locale and Vietnam timezone.

## Verification and remaining limits

- Real Manager browser: assigned warehouse, two ready backlog lines, simplified
  capacity hint, removed sidebar card and preview reading “2 orders · 2 parcels”.
- Browser interaction was interrupted before live packing inspection completed.
  Packing states and Manager/Staff forms are covered by rendering regressions.
- Preview regression checks no assignee is needed for read-only planning, invalid
  capacity sends no request, and creation still requires a valid assignee.
- Automated role/capability tests cover all seven roles, scope denial and field privacy.
  This is not a claim of a fresh physical end-to-end transaction under all seven users.
- The current handover projection supplies carrier account UUIDs, not account display
  names. Full references remain available for lookup; this review does not fabricate
  carrier names or expand API access to retrieve them.
- Full-repository formatting reports existing issues in 21 files outside this change.
  Formatting passes for the source files changed by this review. Full lint has zero
  errors but reports existing formatting/hook warnings elsewhere.

Final automated verification: 1,459/1,459 tests passed, TypeScript passed,
production build passed (with the existing large-chunk warning), and scoped
Prettier/diff checks passed. Full lint completed with zero errors; full repository
formatting remains affected by the 21 unrelated files described above.

## Follow-up: live cycle-count failure

The local database had not applied `20261103090000_cycle_count_plan` or
`20261104090000_cycle_count_worker_predicate`. The counts read failed with a missing
`cycle_counts.count_window_start` column. After a full local database backup, both
existing migrations were applied transactionally and registered with their source
checksums; the existing count record was retained.

The strict frontend adapter also needed the deployed plan metadata and nullable
variance percentage. It now explicitly accepts those fields while continuing to
reject unrecognized/private fields. The inventory-workflows breadcrumb now uses
the existing translated navigation key.

Verification: real Manager screen displays the existing count and correct
breadcrumb; the actual counts request returns HTTP 200. The updated full frontend
suite passes 1,460/1,460 tests; TypeScript, scoped ESLint/Prettier, production build
and diff checks pass. Deployment to another database still requires the existing
cycle-count migrations; frontend changes alone do not upgrade its schema.

## Follow-up: Vietnamese terminology

Reviewed Vietnamese labels and guidance across order intake, receiving, stock,
putaway, counting, picking, packing, handover, returns and traceability. Operational
English such as pick, putback, wave, booking, reservation, Manager and cut-off now
uses Vietnamese wording. Display labels also explain product codes, receiving
notices and quality checks in Vietnamese. Lookup values, user data, API keys and
interpolation variables retain their identities.

Unknown inventory states use a translated fallback rather than raw enums. Known
spreadsheet order sources use a translated label, and the calendar save failure
has the missing translation in both locales. Existing client-owned session and
document-response errors now respect the selected locale.

Real Manager browser verification confirms “Hoàn hàng đã lấy” and “Lập phiếu hoàn
hàng đã lấy”. The full suite passes 1,462/1,462 tests, including terminology and
interpolation checks. TypeScript, scoped ESLint/Prettier and production build pass.
