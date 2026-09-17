import { PlatformMonitoringDashboard } from '@/features/tenants';

export default function AuditPage() {
  return (
    <PlatformMonitoringDashboard
      titleKey="audit_title"
      descriptionKey="audit_desc"
      badgeLabel="REALTIME"
      metrics={[
        { label: 'Security Events (24h)', value: '1,420', change: '+12%', status: 'neutral' },
        { label: 'Status Changes', value: '4', status: 'warning' },
        { label: 'Admin Logins', value: '18', status: 'success' },
        { label: 'Failed Attempts', value: '2', status: 'warning' },
      ]}
      items={[
        {
          title: 'Tenant status changed: SUSPENDED',
          subtitle: 'Actor: superadmin@smartchain.vn | Target: fast-ship',
          tag: 'STATUS_CHANGE',
          time: '5m ago',
          status: 'warning',
        },
        {
          title: 'Super Admin Login successful',
          subtitle: 'IP: 14.162.140.22 | Session authenticated',
          tag: 'AUTH_SUCCESS',
          time: '15m ago',
          status: 'success',
        },
        {
          title: 'Carrier endpoint configuration updated',
          subtitle: 'Actor: superadmin@smartchain.vn | Carrier: GHN Sandbox',
          tag: 'CARRIER_CONFIG',
          time: '2h ago',
          status: 'neutral',
        },
      ]}
    />
  );
}

