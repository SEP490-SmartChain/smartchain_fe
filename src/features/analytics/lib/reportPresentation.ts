import type { ReportView } from '../schemas/reportSchema';

export type ReportMetric = ReportView['sections'][number]['metrics'][number];
const PRIORITY: Record<string, readonly string[]> = {
  seller: ['orders', 'onHand', 'physicalFree', 'serviceFees', 'nearExpiry'],
  warehouse: ['receivedUnits', 'pickedUnits', 'handedParcels', 'backlog'],
  inventory: ['onHand', 'nearExpiry', 'expired', 'recordedLoss'],
  carriers: ['parcels', 'delivered', 'deliveryRate', 'inProgress'],
  finance: ['serviceFees', 'sellerFreight', 'actualMargin', 'reconciledCoverage'],
};

/** Presentation only: never synthesize unavailable measurements or financial fields. */
export function headlineMetrics(report: ReportView): ReportMetric[] {
  const metrics = report.sections.flatMap((section) => section.metrics);
  const preferred = (PRIORITY[report.kind] ?? []).flatMap((key) =>
    metrics.filter((metric) => metric.key === key),
  );
  return [...preferred, ...metrics.filter((metric) => !preferred.includes(metric))].slice(0, 4);
}

export function formatReportValue(value: string | null, locale: string, unit?: string): string {
  if (value === null) return '—';
  const numeric = /^-?\d+$/.test(value) ? BigInt(value) : Number(value);
  const text = numeric.toLocaleString(
    locale === 'vi' ? 'vi-VN' : 'en-US',
    typeof numeric === 'number' ? { maximumFractionDigits: 2 } : undefined,
  );
  return unit === 'VND' ? text + ' VND' : unit === 'percent' ? text + '%' : text;
}

export function barPercent(value: string, max: bigint): number {
  return max <= BigInt(0)
    ? 0
    : Math.max(0, Math.min(100, Number((BigInt(value) * BigInt(10000)) / max) / 100));
}

export type ReportTone = 'teal' | 'blue' | 'amber' | 'red' | 'muted';
export function reportTone(key: string, index = 0): ReportTone {
  if (['DELIVERED', 'COMPLETED', 'SUCCESS', '0_30'].includes(key)) return 'teal';
  if (['FAILED', 'RETURNED', 'EXHAUSTED', 'DLQ', 'expired'].includes(key)) return 'red';
  if (
    ['PENDING', 'ON_HOLD', 'BACKORDER', 'TIMEOUT', 'UNKNOWN', 'over_90', 'nearExpiry'].includes(key)
  ) {
    return 'amber';
  }
  if (['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'SHIPPED', 'PACKED', '31_60'].includes(key)) return 'blue';
  if (key === 'CANCELLED' || key === 'unknown') return 'muted';
  return (['blue', 'teal', 'amber', 'muted'] as const)[index % 4] ?? 'blue';
}

/** Aggregate only the returned cohort; do not infer carrier names or a global success rate. */
export function carrierBreakdown(groups: { key: string; value: string }[]) {
  const carriers = new Map<
    string,
    { id: string; total: bigint; groups: { key: string; value: string }[] }
  >();
  const states = new Map<string, bigint>();
  for (const row of groups) {
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([A-Z][A-Z0-9_]{0,79})$/i.exec(
        row.key,
      );
    if (!match || BigInt(row.value) < BigInt(0)) return null;
    const [, id, state] = match;
    if (!id || !state) return null;
    const carrier = carriers.get(id) ?? { id, total: BigInt(0), groups: [] };
    carrier.total += BigInt(row.value);
    carrier.groups.push({ key: state, value: row.value });
    carriers.set(id, carrier);
    states.set(state, (states.get(state) ?? BigInt(0)) + BigInt(row.value));
  }
  return {
    carriers: [...carriers.values()],
    groups: [...states].map(([key, value]) => ({ key, value: value.toString() })),
  };
}

export function metricContextKey(metric: ReportMetric, kind: ReportView['kind']) {
  if (metric.value === null) return 'notMeasured';
  if (kind === 'health') {
    return metric.basis === 'recorded_job_execution_dlq_in_24h_not_live_queue'
      ? 'last24Hours'
      : 'currentStock';
  }
  return metric.basis.startsWith('current_') ||
    ['sellable_unreserved_not_allocation_promise', 'legacy_or_missing_provenance'].includes(
      metric.basis,
    )
    ? 'currentStock'
    : 'selectedPeriod';
}
