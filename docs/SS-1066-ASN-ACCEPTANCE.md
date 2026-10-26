# SS-1066 — Seller ASN and replenishment suggestion acceptance

Checked on 23 October 2026 from frontend develop `3ff2cf5` and backend develop
`c6ea6ea`, using separate clean checkouts. Existing uncommitted warehouse/3D work
was preserved. This change does not modify backend code, permissions or schema.

## Behavior

- Seller Owner and Seller Staff can create a draft with active own SKU lines,
  carton count and an eligible destination. Lot/expiry and arrival metadata remain
  declarations; they do not post received or sellable stock.
- UC-36 calls P1's implemented allocation-suggestion API. Choosing a destination
  explicitly fills this single-warehouse draft, which the Seller can edit before
  saving. Separate warehouses use separate drafts.
- The client accepts a suggestion only for the requested SKU, total and calendar
  expiry. Destination IDs must be unique, quantities must conserve the requested
  total including the unallocated remainder, and expiry caps must be respected.
  A malformed response shows a retry error and provides no choice action.
- Changing suggestion inputs invalidates old choices. Saving, versioned submit,
  detail/status and carton-label display retain the existing workflow.

## Executed verification

| Check                                                           | Result                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| New malformed-response regressions against the original adapter | 10 failed as expected before the fix                                                        |
| `node --test tests/asn-api.test.mjs`                            | 27 passed                                                                                   |
| Full frontend `npm test`                                        | 1,162 passed, no failures/skips                                                             |
| TypeScript, lint, format and production build                   | Passed; lint has 19 existing warnings and zero errors; existing bundle-size warning remains |
| Backend ASN service and allocation-calculator suites            | 15 passed                                                                                   |
| Backend ASN HTTP/DTO suite                                      | 69 passed                                                                                   |

Backend tests used the checked-in unit/HTTP service doubles. No PostgreSQL/RLS
integration suite was rerun for this frontend-only change; previous backend
acceptance and current frontend browser checks are separate evidence.

The actual frontend app was checked through the loopback synthetic-transport
harness `tests/ss-1066-asn-browser.mjs`:

1. Owner requested 100 units and saw 60/40 warehouse suggestions. Viewing the
   result created no draft. Choosing Hà Nội filled 60 units; saving created one
   draft in the selected warehouse. Submit updated its status and exposed its
   carton label. Detail still showed zero actual/QC quantities.
2. A response for a different SKU showed the retry error, retained the entered
   quantity of 100 and displayed zero destination-choice buttons.
3. Seller Staff used the same form at 390×844. The modal measured 358 px with
   client/scroll widths both 356 px. Changing quantity removed old choices.
4. Platform Admin opening the Seller ASN URL received the existing 403 screen
   and retained its Admin session. No policy was widened.

These browser fixtures are synthetic, not deployed API/provider or production
end-to-end evidence. They load no `.env` and mutate no shared database.

## Jira scope

This evidence supports the code/UI subtask SS-1066. It does not complete the
unverified Figma subtask SS-1064, the aggregate SS-1063 rehearsal, independent
teammate review for SS-1304, integrated rule planning/quotes, or final UAT.
