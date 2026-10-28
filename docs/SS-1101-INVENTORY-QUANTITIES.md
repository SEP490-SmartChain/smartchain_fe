# SS-1101 — distinguish unreserved from saleable stock

The SS-1100 rehearsal receives 200 bags, approves 190 and quarantines 10. After
putaway, the account KPI correctly shows 190 eligible available units, while the
SKU/warehouse balance contains 200 physical units and 0 reserved units. Its old
“Available” heading made the remaining 200 look eligible for sales as well.

The aggregate column now says “Unreserved”. Its explanation includes receiving
and quarantined goods; the KPI explains its eligible saleable-stock scope.
The running-low table retains its existing available-stock heading. API fields,
quantities, allocation decisions, permissions and stock effects are unchanged.

Verify with 190 SELLABLE + 10 QUARANTINE + 0 reserved: KPI 190, aggregate on-hand
200, reserved 0, unreserved 200. Lot/bin details must retain the 190/10 split.
Check Vietnamese and English labels and preserve the current warehouse scope.
