import { PlatformMonitoringDashboard } from '@/features/tenants';

export default function ObservabilityPage() {
  return (
    <PlatformMonitoringDashboard
      titleKey="observability_title"
      descriptionKey="observability_desc"
      badgeLabel="DLQ & WORKERS"
      metrics={[
        { label: 'Active System Workers', value: '12', status: 'success' },
        { label: 'Queued Jobs', value: '340', status: 'neutral' },
        { label: 'Processed / min', value: '2,400', status: 'success' },
        { label: 'DLQ Dead Letters', value: '0', status: 'success' },
      ]}
      items={[
        {
          title: 'Order Dispatch Fanout Worker pool healthy',
          subtitle: 'Concurrency: 8 workers | 0 backlog queue',
          tag: 'WORKER_HEALTHY',
          time: 'Just now',
          status: 'success',
        },
        {
          title: 'Tracking Webhook Poller execution complete',
          subtitle: 'Synced 1,240 tracking updates across 4 carriers',
          tag: 'SYNC_DONE',
          time: '3m ago',
          status: 'success',
        },
        {
          title: 'Reconciliation Batch Processor idle',
          subtitle: 'Waiting for scheduled night run (02:00 UTC)',
          tag: 'SCHEDULED',
          time: '12m ago',
          status: 'neutral',
        },
      ]}
    />
  );
}

