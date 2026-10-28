# Lợi Phan — design mockups, 26 October 2026

The user explicitly replaced the Figma requirement with an editable design delivery
on 26 October 2026: “không cần dùng … hãy tạo mà không cần dùng figma”. These are
native SVG designs, with text and shapes retained as editable objects. They are not
screenshots embedded in a Figma file. No Figma account or paid tool is required.

Open [index.html](index.html) to switch between the 13 screens, or open any SVG
directly in a browser/vector editor. Archivo is the intended typeface, with a
sans-serif fallback when it is unavailable. The SVG sources are self-contained;
there are no remote images, scripts, fonts, analytics or network requests.

## Task deliverables

| Jira    | Screens                                                                                                                                                                                 | Source contract                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| SS-1052 | [SKU list](SS-1052-sku-list.svg), [create/configure](SS-1052-sku-form.svg), [import preview](SS-1052-sku-import.svg)                                                                    | `src/features/catalog/schemas/productSchema.ts`; `src/features/catalog/README.md`              |
| SS-1058 | [Warehouse list](SS-1058-warehouse-list.svg), [create form](SS-1058-warehouse-form.svg), [zones/bins](SS-1058-warehouse-layout.svg), [calendar/downtime](SS-1058-calendar-downtime.svg) | `warehouseSchema.ts`, `warehouseLayoutSchema.ts`, `warehouseCalendarSchema.ts`; catalog README |
| SS-1064 | [ASN list](SS-1064-asn-list.svg), [draft/submit](SS-1064-asn-form.svg), [detail/timeline](SS-1064-asn-detail.svg)                                                                       | `src/features/inbound/schemas/asnSchema.ts`; inbound README                                    |
| SS-1081 | [Rule list](SS-1081-rules-list.svg), [editor/allocation simulation](SS-1081-rules-editor.svg), [history/carrier simulation](SS-1081-rules-history-carrier.svg)                          | Rules README; RP3 FU-35/41/42, UC-76/77/96–98; Admin + Ops configuration decision              |

## Interaction and state handoff

- **SKU:** Owner creates/edits; barcode and cost are optional. Red asterisks mark
  required inputs. Import shows per-row issues before commit. Lot/expiry policy
  remains separate from physically received stock. Staff does not receive edit
  controls or private product cost.
- **Warehouses:** Admin creates platform warehouses. Assigned Manager edits
  layout/calendar/downtime under the current version. The selected row expands
  without removing the directory. The 3D view is a schematic; saving coordinates
  does not move stock. A status/downtime decision reviews outstanding work.
- **ASN:** Owner/Staff use own SKU and eligible warehouse options. Each ASN has one
  warehouse. Suggestions stay advisory; Seller confirms editable quantities.
  Draft save, versioned submit and cancellation are separate actions. Carton labels
  are available only in allowed submitted states. Declared, counted, accepted,
  quarantine and sellable quantities remain separate.
- **Rules:** Admin + Ops configure drafts and publish/disable/restore with a reason.
  Allocation simulation is Ops-only; carrier simulation allows Admin + Ops.
  Saved-version previews do not publish. Synthetic snapshot results are labelled
  and do not reserve stock, create orders, read live financial tariffs or book.
  Editing the sample invalidates obsolete results. Missing stock/cost/weight facts
  produce explicit errors or incomplete results.
- **All forms:** preserve entered data on validation/server failure or stale-version
  conflict; show loading, empty, forbidden and retry states. Server confirmation
  determines authoritative state. Scope changes clear obsolete data. The static
  designs describe these states; the HTML preview switches screens only and is not
  a substitute for application/API testing.
- **Responsive:** the desktop composition follows the shared 254 px navigation,
  76 px header, teal/slate tokens and 8/12/16 px radii. On narrow screens the real
  application uses its drawer and stacked forms; these SVGs remain desktop design
  canvases, not responsive production screens.

## Verification and limits

All 13 SVGs were parsed as XML, opened in Chrome and visually reviewed. Designs use
synthetic data only; barcode bars are illustrative and must not be scanned as real
carton labels. Role-specific navigation and form actions are included. No runtime,
API, database, dependency, permission or environment configuration changes are part
of this design delivery. Design completion does not certify full story UAT or
another owner's independent review.
