# features/shipments

Vận đơn, nhãn giao hàng, redispatch thủ công, timeline hành trình, cảnh báo SLA. BE: `dispatch`, `tracking`. SRS: FE-32 → FE-40.

SS-1266 adds the shipment-detail timeline from `GET /v1/shipments/:id/timeline` (UC-103).
It uses the existing shipment capability, bounded pages and a closed Zod projection without
recipient/financial/raw webhook fields. Auth revision changes remount the feature; pending
requests are aborted on unmount. Empty/error/loading states do not fabricate tracking events.
Carrier live tests, channel sync and SLA are separate acceptance work.

## SS-1319 SLA alerts (UC-104)

`SlaExceptionsPanel` on the operations exception queue (`/exceptions`, sidebar "Hàng đợi sự cố") (`shipments.sla.view`: Admin, Ops Dispatcher, Warehouse Manager)
lists overdue handover and stalled carrier progress for the warehouses the server allows. Admin/Ops can take
ownership (`shipments.sla.assign`); alerts close automatically after handover or carrier progress.
