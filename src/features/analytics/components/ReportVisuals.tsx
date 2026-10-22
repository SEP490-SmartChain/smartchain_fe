import { useId, useState } from 'react';

import { Link } from 'react-router-dom';

import {
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Boxes,
  ChevronDown,
  Info,
  CircleDollarSign,
  Package,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Card } from '@/components/Common';

import styles from './ReportVisuals.module.css';
import {
  barPercent,
  carrierBreakdown,
  formatReportValue,
  headlineMetrics,
  metricContextKey,
  reportTone,
} from '../lib/reportPresentation';

import type { ReportView } from '../schemas/reportSchema';

type Section = ReportView['sections'][number];
type Group = { key: string; value: string };
const ICONS = [Package, Boxes, BarChart3, CircleDollarSign];

export function ReportVisuals({ report }: { report: ReportView }) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const headlines = headlineMetrics(report);
  const trends = report.sections.filter((section) => section.series?.length);
  const groups = report.sections.filter((section) => section.groups !== undefined);
  const carrierSection =
    report.kind === 'carriers' ? groups.find((section) => section.id === 'carriers') : undefined;
  const carriers = carrierSection ? carrierBreakdown(carrierSection.groups ?? []) : null;
  const label = (key: string) => (t.has('metrics.' + key) ? t('metrics.' + key) : t('metric'));
  const format = (value: string | null, unit?: string) => formatReportValue(value, locale, unit);
  if (report.sections.length === 0) {
    return (
      <Card>
        <EmptyChart />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div className={styles.metrics}>
        {headlines.map((metric, index) => {
          const metricText = format(metric.value, metric.unit === 'VND' ? undefined : metric.unit);
          const Icon =
            metric.unit === 'VND'
              ? CircleDollarSign
              : report.kind === 'carriers'
                ? Truck
                : (ICONS[index] ?? BarChart3);
          return (
            <Card
              key={metric.key}
              className={styles.metric + (index === 0 ? ' ' + styles.featuredMetric : '')}
              data-tone={reportTone(metric.key, index)}
            >
              <div className={styles.metricTop}>
                <span className={styles.metricIcon}>
                  <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className={styles.metricContext}>
                  {t(metricContextKey(metric, report.kind))}
                  {metric.unit !== 'count' && metric.unit !== 'percent' && (
                    <span className={styles.currency}>
                      {metric.unit === 'VND' ? 'VND' : t('units.' + metric.unit)}
                    </span>
                  )}
                </span>
              </div>
              <p className={styles.metricLabel}>{label(metric.key)}</p>
              <div className={styles.metricBottom}>
                <strong
                  className={styles.metricValue}
                  style={{ fontSize: Math.max(12, Math.min(32, 240 / metricText.length)) }}
                >
                  {metricText}
                </strong>

                {metric.href && (
                  <Link
                    to={metric.href}
                    aria-label={label(metric.key) + ' · ' + t('details')}
                    className={styles.metricLink}
                  >
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {report.sections.some((section) => section.status !== 'AVAILABLE') && (
        <Alert variant="warning">{t('partial')}</Alert>
      )}
      {carriers ? (
        <div className={styles.carrierOverview}>
          <Distribution title={t('parcelDistribution')} groups={carriers.groups} />
          <Card className={styles.carrierList}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>{t('network')}</p>
                <h2>{t('carrierPerformance')}</h2>
              </div>
              <span className={styles.headingIcon}>
                <Truck size={20} aria-hidden="true" />
              </span>
            </div>
            {!carriers.carriers.length ? (
              <EmptyChart />
            ) : (
              <div className={styles.carrierGrid}>
                {carriers.carriers.map((carrier, index) => (
                  <div key={carrier.id} className={styles.carrierCard}>
                    <div className={styles.carrierTitle}>
                      <span className={styles.carrierAvatar}>
                        <Truck size={19} aria-hidden="true" />
                      </span>
                      <div>
                        <h3>{t('carrierLabel', { number: String(index + 1).padStart(2, '0') })}</h3>
                        <details className={styles.reference}>
                          <summary>{t('carrierReference')}</summary>
                          <code>{carrier.id}</code>
                        </details>
                      </div>
                      <strong>
                        {format(carrier.total.toString())}
                        <small>{t('parcelsUnit')}</small>
                      </strong>
                    </div>
                    <div className={styles.stackedBar} aria-hidden="true">
                      {carrier.groups.map((group, i) => (
                        <span
                          key={group.key}
                          data-tone={reportTone(group.key, i)}
                          style={{ width: barPercent(group.value, carrier.total) + '%' }}
                        />
                      ))}
                    </div>
                    <div className={styles.carrierStates}>
                      {carrier.groups.map((group, i) => (
                        <span key={group.key}>
                          <i data-tone={reportTone(group.key, i)} />
                          {t.has('groups.' + group.key) ? t('groups.' + group.key) : group.key}
                          <b>{format(group.value)}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className={styles.chartNote}>{t('carrierCohortNote')}</p>
          </Card>
        </div>
      ) : (
        (trends.length > 0 || groups.length > 0) && (
          <div
            className={
              styles.charts +
              (trends.length === 0 && groups.length === 1 ? ' ' + styles.singleChart : '')
            }
          >
            {trends.map((section) => (
              <div className={styles.wideChart} key={section.id + ':trend'}>
                <OrderTrend series={section.series ?? []} />
              </div>
            ))}
            {groups.map((section) =>
              section.id === 'fees' ? (
                <div className={styles.feeChart} key={section.id}>
                  <FeeBreakdown section={section} />
                </div>
              ) : (
                <Distribution
                  key={section.id}
                  title={t.has('sections.' + section.id) ? t('sections.' + section.id) : section.id}
                  groups={section.groups ?? []}
                />
              ),
            )}
          </div>
        )
      )}
      <section aria-label={t('allMetrics')}>
        <div className={styles.detailHeading}>
          <div>
            <p className={styles.kicker}>{t('deeperLook')}</p>
            <h2>{t('allMetrics')}</h2>
          </div>
          <Badge status="default" label={t('readOnly')} />
        </div>
        <Card padding="none" className={styles.detailCard}>
          {report.sections
            .filter((section) => section.metrics.length > 0 && !section.id.startsWith('queue:'))
            .map((section) => (
              <MetricDefinitions key={section.id} section={section} />
            ))}
        </Card>
      </section>
    </div>
  );
}

function MetricDefinitions({ section }: { section: Section }) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const Icon =
    section.id === 'fees' || section.id === 'freight'
      ? CircleDollarSign
      : section.id === 'stock' || section.id === 'ageing'
        ? Boxes
        : section.id === 'carriers'
          ? Truck
          : section.id === 'orders'
            ? Package
            : BarChart3;
  return (
    <details className={styles.detailSection}>
      <summary>
        <span className={styles.detailIcon}>
          <Icon size={17} aria-hidden="true" />
        </span>
        <span className={styles.detailTitle}>
          {t.has('metricSections.' + section.id)
            ? t('metricSections.' + section.id)
            : t.has('sections.' + section.id)
              ? t('sections.' + section.id)
              : t('metric')}
          <small>{t('metricCountShort', { count: section.metrics.length })}</small>
        </span>
        {section.status === 'AVAILABLE' ? (
          <span className={styles.availableDot} title={t('status.AVAILABLE')}>
            <span className="sr-only">{t('status.AVAILABLE')}</span>
          </span>
        ) : (
          <Badge status="warning" label={t('status.' + section.status)} />
        )}
        <ChevronDown className={styles.chevron} size={15} aria-hidden="true" />
      </summary>
      <dl className={styles.detailMetrics}>
        {section.metrics.map((metric) => {
          const label = t.has('metrics.' + metric.key) ? t('metrics.' + metric.key) : t('metric');
          return (
            <div key={metric.key} className={styles.metricRow}>
              <dt className="sr-only">{label}</dt>
              <dd>
                <details className={styles.metricExplanation}>
                  <summary>
                    <span>{label}</span>
                    <strong>{formatReportValue(metric.value, locale, metric.unit)}</strong>
                    <Info size={14} aria-hidden="true" />
                    <span className="sr-only">{t('calculationInfo')}</span>
                  </summary>
                  <p>
                    {t.has('basis.' + metric.basis)
                      ? t('basis.' + metric.basis)
                      : t('recordedBasis')}
                  </p>
                </details>
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

function EmptyChart() {
  const t = useTranslations('Reports');
  return (
    <div className={styles.emptyChart}>
      <BarChart3 size={28} strokeWidth={1.3} aria-hidden="true" />
      <p>{t('empty')}</p>
    </div>
  );
}

function Distribution({ title, groups }: { title: string; groups: Group[] }) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const total = groups.reduce((value, row) => value + BigInt(row.value), BigInt(0));
  let offset = 0;
  return (
    <Card className={styles.distribution}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>{t('distribution')}</p>
          <h2>{title}</h2>
        </div>
        <span className={styles.headingIcon}>
          <BarChart3 size={19} aria-hidden="true" />
        </span>
      </div>
      {!groups.length ? (
        <EmptyChart />
      ) : (
        <>
          <div className={styles.ring}>
            <svg viewBox="0 0 200 200" role="img" aria-label={title}>
              <circle
                cx="100"
                cy="100"
                r="76"
                fill="none"
                stroke="var(--sc-bg-secondary)"
                strokeWidth="18"
              />
              {groups.map((row, index) => {
                const length = barPercent(row.value, total);
                const start = offset;
                offset += length;
                return (
                  <circle
                    key={row.key}
                    data-tone={reportTone(row.key, index)}
                    cx="100"
                    cy="100"
                    r="76"
                    pathLength="100"
                    fill="none"
                    strokeWidth="18"
                    strokeDasharray={length + ' ' + (100 - length)}
                    strokeDashoffset={-start}
                    transform="rotate(-90 100 100)"
                    className={styles.segment}
                  >
                    <title>
                      {(t.has('groups.' + row.key) ? t('groups.' + row.key) : row.key) +
                        ': ' +
                        formatReportValue(row.value, locale)}
                    </title>
                  </circle>
                );
              })}
            </svg>
            <div>
              <strong>{formatReportValue(total.toString(), locale)}</strong>
              <span>{t('displayedTotal')}</span>
            </div>
          </div>
          <div className={styles.legend}>
            {groups.map((row, index) => (
              <div key={row.key}>
                <span>
                  <i data-tone={reportTone(row.key, index)} />
                  {t.has('groups.' + row.key) ? t('groups.' + row.key) : row.key}
                </span>
                <strong>{formatReportValue(row.value, locale)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function FeeBreakdown({ section }: { section: Section }) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const groups = section.groups ?? [];
  const max = groups.reduce(
    (value, row) => (BigInt(row.value) > value ? BigInt(row.value) : value),
    BigInt(1),
  );
  return (
    <Card className={styles.fees}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>{t('serviceCosts')}</p>
          <h2>{t('sections.fees')}</h2>
        </div>
        <span className={styles.headingIcon}>
          <CircleDollarSign size={20} aria-hidden="true" />
        </span>
      </div>
      {!groups.length ? (
        <EmptyChart />
      ) : (
        <div className={styles.feeRows}>
          {groups.map((row, index) => (
            <div key={row.key}>
              <span className={styles.feeIcon} data-tone={reportTone(row.key, index)}>
                <ArrowDownRight size={18} aria-hidden="true" />
              </span>
              <div>
                <div className={styles.feeLabel}>
                  <span>{t.has('groups.' + row.key) ? t('groups.' + row.key) : row.key}</span>
                  <strong>{formatReportValue(row.value, locale, 'VND')}</strong>
                </div>
                <div className={styles.feeTrack}>
                  <span
                    data-tone={reportTone(row.key, index)}
                    style={{ width: barPercent(row.value, max) + '%' }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function OrderTrend({ series }: { series: { key: string; value: string }[] }) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = series.reduce(
    (value, row) => (BigInt(row.value) > value ? BigInt(row.value) : value),
    BigInt(1),
  );
  const total = series.reduce((value, row) => value + BigInt(row.value), BigInt(0));
  const x = (index: number) => 54 + (series.length > 1 ? (index / (series.length - 1)) * 584 : 292);
  const y = (value: string) => 195 - barPercent(value, max) * 1.65;
  const points = series.map((row, index) => x(index) + ',' + y(row.value)).join(' ');
  const selected = active === null ? undefined : series[active];
  const first = series[0];
  const last = series.at(-1);
  return (
    <Card className={styles.trendCard}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 inline-flex items-center gap-2 text-sm font-medium text-[var(--sc-text-secondary)]">
            <TrendingUp size={16} aria-hidden="true" />
            {t('trend')}
          </p>
          <p className="mb-0 mt-3 text-3xl font-semibold tabular-nums">
            {formatReportValue(selected?.value ?? total.toString(), locale)}{' '}
            <span className="text-sm font-normal text-[var(--sc-text-secondary)]">
              {selected ? selected.key : t('ordersInPeriod')}
            </span>
          </p>
        </div>
        <Badge status="default" label={t('daily')} />
      </div>
      <svg
        viewBox="0 0 660 230"
        role="img"
        aria-label={t('trend')}
        className="h-auto w-full"
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--sc-primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--sc-primary)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((step) => (
          <g key={step}>
            <line
              x1="54"
              x2="638"
              y1={195 - step * 55}
              y2={195 - step * 55}
              stroke="var(--sc-border-default)"
              strokeDasharray="4 5"
            />
            <text
              x="42"
              y={199 - step * 55}
              textAnchor="end"
              fill="var(--sc-text-secondary)"
              fontSize="10"
            >
              {formatReportValue(((max * BigInt(step)) / BigInt(3)).toString(), locale)}
            </text>
          </g>
        ))}
        {first && last && (
          <polygon
            points={x(0) + ',195 ' + points + ' ' + x(series.length - 1) + ',195'}
            fill={'url(#' + id + ')'}
          />
        )}
        <polyline
          points={points}
          fill="none"
          stroke="var(--sc-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {series.map((row, index) => (
          <g
            key={row.key}
            tabIndex={0}
            role="img"
            aria-label={row.key + ': ' + formatReportValue(row.value, locale)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            onMouseEnter={() => setActive(index)}
          >
            <title>{row.key + ': ' + row.value}</title>
            <circle cx={x(index)} cy={y(row.value)} r="10" fill="transparent" />
            <circle
              cx={x(index)}
              cy={y(row.value)}
              r={active === index || series.length === 1 ? 4 : 0}
              fill="var(--sc-primary)"
            />
          </g>
        ))}
        <text x="54" y="222" fontSize="10" fill="var(--sc-text-secondary)">
          {first?.key}
        </text>
        <text x="638" y="222" textAnchor="end" fontSize="10" fill="var(--sc-text-secondary)">
          {last?.key}
        </text>
      </svg>
      <details className="mt-2 border-t border-[var(--sc-border-light)] pt-3 text-xs text-[var(--sc-text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--sc-primary)]">
          {t('dailyValues')}
        </summary>
        <div className="mt-3 max-h-48 overflow-auto">
          <table className="w-full text-left" aria-label={t('dailyValues')}>
            <thead>
              <tr>
                <th className="py-2">{t('date')}</th>
                <th className="py-2 text-right">{t('metrics.orders')}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((row) => (
                <tr key={row.key} className="border-t border-[var(--sc-border-light)]">
                  <td className="py-2">{row.key}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatReportValue(row.value, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
