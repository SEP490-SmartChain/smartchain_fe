import { PlatformMonitoringDashboard } from '@/features/tenants';

export default function QuotasPage() {
  return (
    <PlatformMonitoringDashboard
      titleKey="quotas_title"
      descriptionKey="quotas_desc"
      badgeLabel="LIMITS"
      metrics={[
        { label: 'Total Allocated Orders', value: '450,000', status: 'neutral' },
        { label: 'Consumed Orders (Month)', value: '286,410', change: '63.6%', status: 'neutral' },
        { label: 'Near Limit Tenants (>85%)', value: '3', status: 'warning' },
        { label: 'Custom Quota Overrides', value: '5', status: 'neutral' },
      ]}
      items={[
        {
          title: 'FastTrans at 88% monthly order quota',
          subtitle: 'Orders: 44,000 / 50,000 | Projected to cap in 4 days',
          tag: 'THRESHOLD_85',
          time: '1h ago',
          status: 'warning',
        },
        {
          title: 'Acme Logistics custom quota override applied',
          subtitle: 'Order limit temporarily raised to 80,000 for peak promotion',
          tag: 'QUOTA_OVERRIDE',
          time: '5h ago',
          status: 'neutral',
        },
        {
          title: 'EcoLogistics quota reset for new billing cycle',
          subtitle: 'Starter tier quota refreshed: 5,000 orders available',
          tag: 'CYCLE_RESET',
          time: '1d ago',
          status: 'success',
        },
      ]}
    />
  );
}

