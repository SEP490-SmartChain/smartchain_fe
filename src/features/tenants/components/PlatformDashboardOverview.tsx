import type { CSSProperties } from 'react';

import { ArrowUp, Building2, ChevronRight, Server, Sparkles, Truck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card } from '@/components/Common/Card/Card';

import type { SystemDashboardOverview } from '../types/tenant.types';

interface PlatformDashboardOverviewProps {
  overview: SystemDashboardOverview | null;
  isLoading?: boolean;
  onSelectTenant?: (idOrSlug: string) => void;
}

export function PlatformDashboardOverview({
  overview,
  isLoading,
  onSelectTenant,
}: PlatformDashboardOverviewProps) {
  const t = useTranslations('AdminTenants');

  if (isLoading && !overview) {
    return (
      <section className="grid grid-cols-2 overflow-hidden rounded-2xl border-l border-t border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)] md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-36 animate-pulse border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
          />
        ))}
      </section>
    );
  }

  if (!overview) return null;

  const uptimeDays = Math.round((overview.health.uptimeSeconds / 86400) * 10) / 10;
  const activePercent =
    overview.tenants.total > 0
      ? Math.round((overview.tenants.active / overview.tenants.total) * 100)
      : 100;

  return (
    <div className="space-y-5">
      {/* 4 Connected Metric Cards adhering strictly to SmartChain Design System */}
      <section
        aria-label={t('page_title')}
        className="grid grid-cols-2 overflow-hidden rounded-2xl border-l border-t border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)] md:grid-cols-4"
      >
        {/* Metric 1: Total Tenants */}
        <div
          className="sc-card-enter flex flex-col justify-between border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
          style={{ '--sc-delay': 1 } as CSSProperties}
        >
          <div className="flex items-center justify-between">
            <p className="m-0 text-sm font-medium text-[var(--sc-text-secondary)]">
              {t('overview_total_tenants')}
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
              <Building2 size={16} />
            </span>
          </div>
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-3xl font-semibold tracking-tight text-[var(--sc-text-primary)]">
                {overview.tenants.total}
              </strong>
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--sc-success-dark)]">
                <ArrowUp size={13} />
                +{overview.tenants.newLast7Days} {t('this_week')}
              </span>
            </div>

            {/* Subtle brand progress bar */}
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[11px] text-[var(--sc-text-tertiary)]">
                <span>
                  {overview.tenants.active} {t('status_active')} ({activePercent}%)
                </span>
                <span>
                  {overview.tenants.suspended} {t('status_suspended')}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--sc-bg-muted)]">
                <div
                  className="h-full rounded-full bg-[var(--sc-primary)] transition-all duration-500"
                  style={{ width: `${activePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Metric 2: Platform Users */}
        <div
          className="sc-card-enter flex flex-col justify-between border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
          style={{ '--sc-delay': 2 } as CSSProperties}
        >
          <div className="flex items-center justify-between">
            <p className="m-0 text-sm font-medium text-[var(--sc-text-secondary)]">
              {t('overview_total_users')}
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
              <Users size={16} />
            </span>
          </div>
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-3xl font-semibold tracking-tight text-[var(--sc-text-primary)]">
                {overview.users.totalUsers.toLocaleString()}
              </strong>
              <span className="text-xs font-medium text-[var(--sc-text-tertiary)]">
                {t('across_all_tenants')}
              </span>
            </div>
            <p className="mb-0 mt-3 text-xs text-[var(--sc-text-tertiary)]">
              {t('active_accounts_label')}
            </p>
          </div>
        </div>

        {/* Metric 3: Global 3PL Carriers */}
        <div
          className="sc-card-enter flex flex-col justify-between border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
          style={{ '--sc-delay': 3 } as CSSProperties}
        >
          <div className="flex items-center justify-between">
            <p className="m-0 text-sm font-medium text-[var(--sc-text-secondary)]">
              {t('overview_global_carriers')}
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
              <Truck size={16} />
            </span>
          </div>
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-3xl font-semibold tracking-tight text-[var(--sc-text-primary)]">
                {overview.carriers.activeCarriers} / {overview.carriers.totalCarriers}
              </strong>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--sc-success-dark)]">
                {t('status_online')}
              </span>
            </div>
            <p className="mb-0 mt-3 text-xs text-[var(--sc-text-tertiary)]">
              {overview.carriers.activeEndpointsCount} {t('endpoints')} • {overview.carriers.totalConnectedTenants} {t('connected_tenants')}
            </p>
          </div>
        </div>

        {/* Metric 4: System Health */}
        <div
          className="sc-card-enter flex flex-col justify-between border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
          style={{ '--sc-delay': 4 } as CSSProperties}
        >
          <div className="flex items-center justify-between">
            <p className="m-0 text-sm font-medium text-[var(--sc-text-secondary)]">
              {t('overview_system_health')}
            </p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
              <Server size={16} />
            </span>
          </div>
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-3xl font-semibold tracking-tight text-[var(--sc-success-dark)]">
                {overview.health.overallStatus}
              </strong>
              <span className="inline-flex items-center rounded-md bg-[var(--sc-success-bg)] px-2 py-0.5 text-xs font-medium text-[var(--sc-success-dark)]">
                DB {overview.health.database.latencyMs}ms
              </span>
            </div>
            <p className="mb-0 mt-3 text-xs text-[var(--sc-text-tertiary)]">
              {uptimeDays} ngày uptime liên tục (99.9% SLA)
            </p>
          </div>
        </div>
      </section>

      {/* Recent Tenants Quick Access Strip */}
      {overview.recentTenants && overview.recentTenants.length > 0 && (
        <Card className="sc-card-enter p-4" style={{ '--sc-delay': 5 } as CSSProperties}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--sc-text-secondary)]">
              <Sparkles size={14} className="text-[var(--sc-primary)]" />
              <span>Khách thuê mới gia nhập</span>
            </div>
            <span className="text-xs text-[var(--sc-text-tertiary)]">
              Tự động cập nhật
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {overview.recentTenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => onSelectTenant?.(tenant.slug)}
                className="flex items-center justify-between rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-3 text-left transition-colors hover:border-[var(--sc-primary)] hover:bg-[var(--sc-primary-alpha-08)]"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-xs font-semibold text-[var(--sc-primary-dark)]">
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <div className="truncate text-xs font-medium text-[var(--sc-text-primary)]">
                      {tenant.name}
                    </div>
                    <div className="truncate font-mono text-[11px] text-[var(--sc-text-tertiary)]">
                      {tenant.slug}
                    </div>
                  </div>
                </div>
                <ChevronRight size={15} className="shrink-0 text-[var(--sc-text-tertiary)]" />
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
