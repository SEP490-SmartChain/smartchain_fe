import { PlatformMonitoringDashboard } from '@/features/tenants';

export default function ApiTrafficPage() {
  return (
    <PlatformMonitoringDashboard
      titleKey="traffic_title"
      descriptionKey="traffic_desc"
      badgeLabel="24H TRAFFIC"
      metrics={[
        { label: 'Total API Requests', value: '4.8M', change: '+8.2%', status: 'success' },
        { label: 'Avg Response Time', value: '38ms', change: '-4ms', status: 'success' },
        { label: 'Success Rate (2xx)', value: '99.94%', status: 'success' },
        { label: 'Error Rate (4xx/5xx)', value: '0.06%', status: 'neutral' },
      ]}
      items={[
        {
          title: 'POST /v1/orders/allocation (Spike detected)',
          subtitle: 'Throughput: 850 req/s | P95 latency: 42ms',
          tag: 'HIGH_LOAD',
          time: '2m ago',
          status: 'warning',
        },
        {
          title: 'GET /v1/tracking/shipments',
          subtitle: 'Throughput: 1,200 req/s | P95 latency: 18ms',
          tag: 'STABLE',
          time: '5m ago',
          status: 'success',
        },
        {
          title: 'POST /v1/auth/login rate-limit triggered',
          subtitle: 'IP: 185.220.101.4 | 429 Too Many Requests',
          tag: 'RATE_LIMIT',
          time: '18m ago',
          status: 'warning',
        },
      ]}
    />
  );
}

