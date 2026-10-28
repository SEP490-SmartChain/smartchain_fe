# SS-1100 connected acceptance — 27 October 2026

## Scope and environment

Actual frontend app/router and backend AppModule on loopback, using backend
`bb0dc63` and frontend base `c03adca`. PostgreSQL, Redis, MongoDB, MinIO and
Mailpit are disposable local services with synthetic accounts and shipment data.
No project or production database, real seller data, external mailbox or AI
provider was used. Credentials and environment manifests are excluded.

## Receiving, evidence, QC and putaway

1. Seller Owner submitted the synthetic ASN `SS1099-RICE-200`, declaring 200
   units and 20 cartons. Initial inventory was empty.
2. Assigned Warehouse Staff confirmed arrival and counted 200 units, with a
   physical lot manufactured on 20 October 2026. Its configured 180-day shelf
   life produced an expiry of 18 April 2027.
3. Native file selection uploaded a synthetic PNG through the real presigned
   storage/checksum/confirmation flow, at receipt and lot level. Manager loaded
   the private preview successfully (900 × 420 pixels).
4. Staff recorded QC as 190 accepted, 10 quarantined, zero rejected; selected
   the verified damage photo and submitted the discrepancy report.
5. Assigned Manager reviewed the photo, approved the current evidence and
   confirmed 20 actual cartons. Approval did not itself post stock.
6. Staff recognized 190 units into `SS1099-RCV-01` and 10 into `SS1099-QC-01`.
   The restricted planning worker produced one task for the accepted quantity.
7. Staff claimed that task. A wrong destination scan was rejected without a
   physical confirmation. Correct receiving-bin, storage-bin, SKU, lot and
   quantity scans then completed the 190-unit task to `SS1099-ST-01`.
8. The actual Seller inventory UI showed physical stock 200, available stock
   190, storage position 190 and quarantined position 10, retaining the expiry.
   The receiving position had zero units after putaway.

## Notification delivery

The exported WF05 workflow ran in n8n 2.38.7 against the actual local API, using
Mailpit as its SMTP destination. The email showed ASN, counted 200, accepted 190,
quarantined 10 and rejected zero. It explained that accepted goods become
sellable after confirmed putaway.

The notice became `DELIVERED`. A second workflow execution found no pending
notice; Mailpit contained exactly one message. Delivery did not change stock.
This proves local workflow/SMTP integration, not external mailbox delivery or
production deployment.

## Connected simulator acceptance (SS-1089/1090/1092)

Actual authenticated UI and API, with published rules and explicitly fictional
projection inputs:

| Case                                                 | Observed result                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Allocation stock 6 + 4, demand 10                    | Two parcels; COD 80,000 / 40,000 VND                                                |
| Stock 6 + 3                                          | BACKORDER; no partial parcels                                                       |
| Expired first lot                                    | Excluded from eligible stock; shortage explained                                    |
| Primary carrier unavailable                          | Primary not selected; fallback 25,000 VND                                           |
| Admin allocation / Warehouse Staff / Seller Owner    | Denied with 403                                                                     |
| Authority-bearing snapshot / inconsistent item count | Rejected with 400                                                                   |
| No projection supplied                               | Existing pending-preview compatibility retained                                     |
| Before/after fingerprint                             | Stock, reservations, movements, orders, parcels, outbox and rule versions unchanged |

## Putaway regression found and fixed

Previously, a rejected scan called the same reload path as success. Reload
unmounted the form and erased every scan and the inline error. The fix retains
the form for 400/422, and for 409 only after a successful read confirms the same
task context. Refreshing disables submission. Permission/not-found failures,
changed task context and failed reads discard the form. Unknown results retain
the original immutable operation for replay.

Run `node tests/putaway-workflow-browser.mjs` and open
`http://127.0.0.1:24374/?role=WAREHOUSE_STAFF&scenario=scan-conflict`.
This additional regression harness uses the real components with clearly
labelled synthetic transport, separate from the connected acceptance above.

| Scenario               | Browser acceptance                                                                |
| ---------------------- | --------------------------------------------------------------------------------- |
| `scan-conflict`        | 409 keeps all five values and error; correcting only the destination succeeds     |
| `scan-validation`      | 422 keeps values editable and displays the error                                  |
| `stale-confirmation`   | Changed revision/assignee removes the old form                                    |
| `revoked-confirmation` | 403 removes the form and shows the scope error                                    |
| `lost-confirmation`    | Controls lock; retry uses the identical UUID and complete payload, then completes |

The fix does not change backend contracts, grants, task revisions, stock posting
or the unknown-result retry policy. Whole-project UAT, cross-owner review and
optional AI accuracy remain separate acceptance work.

## Frontend quality gate

TypeScript, ESLint, source formatting, 1,187 tests (zero failures/skips) and
production build passed. ESLint reported 19 existing warnings outside this
change; build retained its existing large-chunk warning. Changed Markdown and
the browser harness also passed Prettier and `git diff --check`.
