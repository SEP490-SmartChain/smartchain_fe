import { PlatformMonitoringDashboard } from '@/features/tenants';

export default function PlansPage() {
  return (
    <PlatformMonitoringDashboard
      titleKey="plans_title"
      descriptionKey="plans_desc"
      badgeLabel="3 TIERS"
      metrics={[
        { label: 'Active Subscriptions', value: '38', change: '+3 this month', status: 'success' },
        { label: 'Starter Plan', value: '18', status: 'neutral' },
        { label: 'Pro Plan', value: '14', status: 'neutral' },
        { label: 'Enterprise Plan', value: '6', status: 'success' },
      ]}
      items={[
        {
          title: 'Acme Logistics upgraded to Enterprise',
          subtitle: 'Order volume exceeded 50,000/mo',
          tag: 'UPGRADE',
          time: '10m ago',
          status: 'success',
        },
        {
          title: 'FastTrans renewed Annual Pro',
          subtitle: 'Direct bank transfer verified',
          tag: 'RENEWAL',
          time: '1h ago',
          status: 'success',
        },
        {
          title: 'Global Express subscribed to Starter',
          subtitle: 'Self-serve onboarding completed',
          tag: 'NEW',
          time: '3h ago',
          status: 'neutral',
        },
      ]}
    />
  );
}

