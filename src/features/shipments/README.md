# features/shipments

Vận đơn, nhãn giao hàng, redispatch thủ công, timeline hành trình, cảnh báo SLA. BE: `dispatch`, `tracking`. SRS: FE-32 → FE-40.

SS-1266 adds the shipment-detail timeline from `GET /v1/shipments/:id/timeline` (UC-103).
It uses the existing shipment capability, bounded pages and a closed Zod projection without
recipient/financial/raw webhook fields. Auth revision changes remount the feature; pending
requests are aborted on unmount. Empty/error/loading states do not fabricate tracking events.
Carrier live tests, channel sync and SLA are separate acceptance work.
