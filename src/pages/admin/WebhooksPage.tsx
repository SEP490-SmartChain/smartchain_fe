import { PlatformMonitoringDashboard } from '@/features/tenants';

export default function WebhooksPage() {
  return (
    <PlatformMonitoringDashboard
      titleKey="webhooks_title"
      descriptionKey="webhooks_desc"
      badgeLabel="DISPATCHER"
      metrics={[
        { label: 'Outbound Deliveries (24h)', value: '184.2K', change: '+14%', status: 'success' },
        { label: 'Delivery Success Rate', value: '99.85%', status: 'success' },
        { label: 'Avg Delivery Latency', value: '142ms', status: 'success' },
        { label: 'Retry Queue Size', value: '8', status: 'neutral' },
      ]}
      items={[
        {
          title: 'Tenant webhook dispatched: shipment.status_updated',
          subtitle: 'Target: https://api.acme.com/webhooks/smartchain (200 OK)',
          tag: 'DELIVERED',
          time: '30s ago',
          status: 'success',
        },
        {
          title: 'Tenant webhook dispatched: order.allocated',
          subtitle: 'Target: https://erp.fasttrans.vn/orders/v1 (200 OK)',
          tag: 'DELIVERED',
          time: '1m ago',
          status: 'success',
        },
        {
          title: 'Tenant webhook retry scheduled (Attempt 2/5)',
          subtitle: 'Target: https://hook.unreachable.test/endpoint (504 Gateway Timeout)',
          tag: 'RETRYING',
          time: '4m ago',
          status: 'warning',
        },
      ]}
    />
  );
}

