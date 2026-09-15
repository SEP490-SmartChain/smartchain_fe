import { AlertTriangle, PackageCheck, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Avatar, Badge, Card, CardHeader } from '@/components/Common';

import ComponentPageShell from './ComponentPageShell';

export default function DataDisplayPage() {
  const t = useTranslations('Components');
  const metrics = [
    { label: t('activeOrders'), value: '1,248', icon: PackageCheck, tone: 'primary' },
    { label: t('deliveryRate'), value: '96.8%', icon: Truck, tone: 'success' },
    { label: t('openAlerts'), value: '12', icon: AlertTriangle, tone: 'warning' },
  ];
  const team = [
    { name: 'SmartChain Demo Admin', role: t('workspaceAdmin'), status: 'online' },
    { name: 'Nguyễn Minh Anh', role: t('dispatcher'), status: 'busy' },
    { name: 'Trần Hoài Nam', role: t('accountant'), status: 'offline' },
  ] as const;
  const statusTone = { online: 'success', busy: 'warning', offline: 'default' } as const;

  return (
    <ComponentPageShell title={t('summaryCards')}>
      <Card>
        <CardHeader title={t('summaryCards')} description={t('summaryCardsDescription')} />
        <div className="grid gap-4 md:grid-cols-3">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4"
            >
              <span
                className={`mb-5 flex h-9 w-9 items-center justify-center rounded-lg ${
                  tone === 'warning'
                    ? 'bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]'
                    : tone === 'success'
                      ? 'bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]'
                      : 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                }`}
              >
                <Icon size={18} />
              </span>
              <strong className="block text-2xl font-medium leading-7 text-[var(--sc-text-primary)]">
                {value}
              </strong>
              <span className="mt-1 block text-xs leading-4 text-[var(--sc-text-secondary)]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('teamAndStatus')} description={t('teamAndStatusDescription')} />
        <ul className="divide-y divide-[var(--sc-border-default)]">
          {team.map((member) => (
            <li key={member.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar fallback={member.name} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--sc-text-primary)]">
                  {member.name}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--sc-text-secondary)]">
                  {member.role}
                </span>
              </span>
              <Badge status={statusTone[member.status]} label={t(member.status)} variant="dot" />
            </li>
          ))}
        </ul>
      </Card>
    </ComponentPageShell>
  );
}
