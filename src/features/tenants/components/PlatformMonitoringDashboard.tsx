import type { CSSProperties } from 'react';

import { Activity, ArrowUp, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';

interface MetricCard {
  label: string;
  value: string | number;
  change?: string;
  status?: 'success' | 'warning' | 'neutral';
}

interface PlatformMonitoringDashboardProps {
  titleKey: string;
  descriptionKey: string;
  badgeLabel?: string;
  metrics?: MetricCard[];
  items?: Array<{
    title: string;
    subtitle: string;
    tag: string;
    time: string;
    status: 'success' | 'warning' | 'neutral';
  }>;
}

export function PlatformMonitoringDashboard({
  titleKey,
  descriptionKey,
  badgeLabel = 'ACTIVE',
  metrics = [],
  items = [],
}: PlatformMonitoringDashboardProps) {
  const t = useTranslations('AdminMonitoring');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="m-0 text-2xl font-normal leading-7 text-[var(--sc-text-primary)]">
              {t(titleKey)}
            </h1>
            <Badge status="success" label={badgeLabel} />
          </div>
          <p className="mb-0 mt-1 text-xs leading-4 text-[var(--sc-text-tertiary)]">
            {t(descriptionKey)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw size={14} className="mr-1.5" />
          {t('refresh')}
        </Button>
      </div>

      {/* Metrics Row - SaaSable Pro connected grid */}
      {metrics.length > 0 && (
        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border-l border-t border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)] md:grid-cols-4">
          {metrics.map((m, idx) => (
            <div
              key={idx}
              className="sc-card-enter border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
              style={{ '--sc-delay': idx + 1 } as CSSProperties}
            >
              <p className="m-0 text-sm font-medium text-[var(--sc-text-secondary)]">
                {m.label}
              </p>
              <div className="mt-4 flex items-baseline justify-between">
                <strong className="text-2xl font-semibold text-[var(--sc-text-primary)]">
                  {m.value}
                </strong>
                {m.change && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--sc-success-dark)]">
                    <ArrowUp size={12} />
                    {m.change}
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Live Stream / Audit Feed */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-5 py-3">
          <h3 className="m-0 text-xs font-medium uppercase tracking-wider text-[var(--sc-text-secondary)]">
            {t('recent_events')}
          </h3>
        </div>
        <div className="divide-y divide-[var(--sc-border-default)]">
          {items.length > 0 ? (
            items.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 transition-colors hover:bg-[var(--sc-bg-secondary)]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                    <Activity size={16} />
                  </span>
                  <div>
                    <div className="font-medium text-[var(--sc-text-primary)]">
                      {item.title}
                    </div>
                    <div className="text-xs text-[var(--sc-text-tertiary)]">
                      {item.subtitle}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    status={item.status === 'neutral' ? 'default' : item.status}
                    label={item.tag}
                  />
                  <span className="font-mono text-xs text-[var(--sc-text-tertiary)]">
                    {item.time}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-sm text-[var(--sc-text-tertiary)]">
              {t('no_events')}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
