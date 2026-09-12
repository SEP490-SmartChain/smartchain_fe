import { useMemo, useState, type CSSProperties } from 'react';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card } from '@/components/Common/Card/Card';
import { Tabs } from '@/components/Common/Tabs/Tabs';

type DashboardView = 'overview' | 'behavior' | 'performance';
type ChartRange = 'daily' | 'monthly' | 'yearly';

const chartData: Record<ChartRange, { orders: number[]; shipments: number[] }> = {
  daily: {
    orders: [92, 116, 108, 148, 171, 159, 205],
    shipments: [68, 88, 96, 114, 132, 148, 176],
  },
  monthly: {
    orders: [72, 96, 83, 124, 116, 148, 172, 160, 186, 214, 201, 232],
    shipments: [54, 68, 78, 87, 103, 119, 126, 138, 151, 169, 181, 205],
  },
  yearly: {
    orders: [86, 112, 154, 178, 214, 229],
    shipments: [66, 94, 121, 147, 182, 211],
  },
};

function toPoints(values: number[]) {
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 720;
      const y = 242 - (value / 250) * 210;
      return [x, y] as const;
    })
    .map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1))
    .join(' ');
}

interface MetricCardProps {
  title: string;
  value: string;
  trend: string;
  positive: boolean;
  compareLabel: string;
  delay: number;
}

function MetricCard({ title, value, trend, positive, compareLabel, delay }: MetricCardProps) {
  return (
    <div
      className="sc-card-enter border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
      style={{ '--sc-delay': delay } as CSSProperties}
    >
      <p className="m-0 text-base font-medium leading-5 text-[var(--sc-text-primary)]">{title}</p>
      <div className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-2xl font-medium leading-7 text-[var(--sc-text-primary)]">
            {value}
          </strong>
          <span
            className={
              positive
                ? 'inline-flex items-center gap-0.5 text-xs font-medium text-[var(--sc-success-dark)]'
                : 'inline-flex items-center gap-0.5 text-xs font-medium text-[var(--sc-error-dark)]'
            }
          >
            {positive ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {trend}
          </span>
        </div>
        <p className="mb-0 mt-1 text-xs leading-4 text-[var(--sc-text-tertiary)]">{compareLabel}</p>
      </div>
    </div>
  );
}

interface ProgressItemProps {
  label: string;
  value: string;
  progress: number;
}

function ProgressItem({ label, value, progress }: ProgressItemProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-[var(--sc-text-secondary)]">{label}</span>
        <span className="font-medium text-[var(--sc-text-primary)]">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--sc-bg-muted)]"
      >
        <div
          className="h-full rounded-full bg-[var(--sc-primary)] transition-[width] duration-700 ease-out"
          style={{ width: progress + '%' }}
        />
      </div>
    </div>
  );
}

interface ProgressPanelProps {
  title: string;
  description: string;
  items: ProgressItemProps[];
  delay: number;
}

function ProgressPanel({ title, description, items, delay }: ProgressPanelProps) {
  return (
    <div
      className="sc-card-enter border-b border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 md:p-6"
      style={{ '--sc-delay': delay } as CSSProperties}
    >
      <div className="mb-5">
        <h2 className="m-0 text-base font-medium leading-5 text-[var(--sc-text-primary)]">
          {title}
        </h2>
        <p className="mb-0 mt-1 text-xs leading-4 text-[var(--sc-text-tertiary)]">{description}</p>
      </div>
      <div className="space-y-5">
        {items.map((item) => (
          <ProgressItem key={item.label} {...item} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const [view, setView] = useState<DashboardView>('overview');
  const [range, setRange] = useState<ChartRange>('monthly');
  const points = useMemo(
    () => ({
      orders: toPoints(chartData[range].orders),
      shipments: toPoints(chartData[range].shipments),
    }),
    [range],
  );

  const metrics: Omit<MetricCardProps, 'delay'>[] = [
    {
      title: t('ordersProcessed'),
      value: '2,486',
      trend: '12.8%',
      positive: true,
      compareLabel: t('comparedToLastPeriod'),
    },
    {
      title: t('inventoryUnits'),
      value: '18,249',
      trend: '8.2%',
      positive: true,
      compareLabel: t('comparedToLastPeriod'),
    },
    {
      title: t('activeShipments'),
      value: '368',
      trend: '3.4%',
      positive: false,
      compareLabel: t('comparedToLastPeriod'),
    },
    {
      title: t('reconciledValue'),
      value: '₫1.24B',
      trend: '16.1%',
      positive: true,
      compareLabel: t('comparedToLastPeriod'),
    },
  ];

  const fulfillment = [
    { label: t('northHub'), value: '96.8%', progress: 97 },
    { label: t('centralHub'), value: '91.4%', progress: 91 },
    { label: t('southHub'), value: '88.7%', progress: 89 },
  ];
  const carriers = [
    { label: 'GHN Express', value: '97.2%', progress: 97 },
    { label: 'Viettel Post', value: '94.8%', progress: 95 },
    { label: 'Giao Hàng Tiết Kiệm', value: '89.6%', progress: 90 },
  ];
  const routing = [
    { label: t('nearestNode'), value: '92.4%', progress: 92 },
    { label: t('costOptimized'), value: '87.1%', progress: 87 },
    { label: t('manualReview'), value: '6.8%', progress: 7 },
  ];

  return (
    <div className="space-y-6">
      <Tabs
        activeId={view}
        onChange={(value) => setView(value as DashboardView)}
        tabs={[
          { id: 'overview', label: t('tabOverview') },
          { id: 'behavior', label: t('tabUserBehavior') },
          { id: 'performance', label: t('tabPerformance') },
        ]}
        className="w-full"
      />

      <section
        aria-label={t('overview')}
        className="grid grid-cols-2 overflow-hidden rounded-2xl border-l border-t border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)] md:grid-cols-4"
      >
        {metrics.map((metric, index) => (
          <MetricCard key={metric.title} {...metric} delay={index + 1} />
        ))}
      </section>

      <Card className="sc-card-enter" style={{ '--sc-delay': 5 } as CSSProperties}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="m-0 text-2xl font-normal leading-7 text-[var(--sc-text-primary)]">
              {t('networkActivity')}
            </h2>
            <p className="mb-0 mt-1 text-xs leading-4 text-[var(--sc-text-tertiary)]">
              {t('networkActivityDescription')}
            </p>
          </div>
          <Tabs
            variant="pills"
            activeId={range}
            onChange={(value) => setRange(value as ChartRange)}
            tabs={[
              { id: 'daily', label: t('daily') },
              { id: 'monthly', label: t('monthly') },
              { id: 'yearly', label: t('yearly') },
            ]}
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-5 text-xs text-[var(--sc-text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--sc-primary-light)]" />
            {t('orders')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--sc-primary)]" />
            {t('shipments')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <svg
            role="img"
            aria-label={t('networkActivityChart')}
            className="h-[261px] min-w-[620px] w-full"
            viewBox="0 0 720 260"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="orders-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="10%" stopColor="var(--sc-primary)" stopOpacity="0.2" />
                <stop offset="86%" stopColor="var(--sc-primary)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[32, 84, 136, 188, 240].map((y) => (
              <line key={y} x1="0" x2="720" y1={y} y2={y} stroke="var(--sc-border-default)" />
            ))}
            <polygon points={'0,242 ' + points.shipments + ' 720,242'} fill="url(#orders-area)" />
            <polyline
              points={points.orders}
              fill="none"
              stroke="var(--sc-primary-light)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={points.shipments}
              fill="none"
              stroke="var(--sc-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </Card>

      <section className="grid overflow-hidden rounded-2xl border-l border-t border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)] sm:grid-cols-2 lg:grid-cols-3">
        <ProgressPanel
          title={t('fulfillmentHealth')}
          description={t('fulfillmentHealthDescription')}
          items={fulfillment}
          delay={6}
        />
        <ProgressPanel
          title={t('carrierPerformance')}
          description={t('carrierPerformanceDescription')}
          items={carriers}
          delay={7}
        />
        <ProgressPanel
          title={t('routingOutcomes')}
          description={t('routingOutcomesDescription')}
          items={routing}
          delay={8}
        />
      </section>
    </div>
  );
}
