import { useEffect, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card } from '@/components/Common';
import { payoutApi } from '@/features/tenants/api/payoutApi';
import { PayoutStatementDetail } from '@/features/tenants/components/PayoutStatementDetail';
import type { payoutStatementSchema } from '@/features/tenants/schemas/payoutSchema';

import type { z } from 'zod';

type Statement = z.infer<typeof payoutStatementSchema>;

/** Accountant queue: every frozen seller statement that still waits for manual approval. */
export function PayoutApprovalQueue() {
  const t = useTranslations('PayoutApprovals');
  const locale = useLocale();
  const [items, setItems] = useState<Statement[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [tick, setTick] = useState(0),
    [selected, setSelected] = useState<Statement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    payoutApi
      .awaitingApproval(controller.signal)
      .then((page) => setItems(page.items))
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tick]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-medium">{t('title')}</h1>
          <p className="m-0 mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <Button variant="outline" onClick={() => setTick((n) => n + 1)}>
          {t('refresh')}
        </Button>
      </div>
      {error && <Alert variant="error" title={t('loadError')} />}
      {loading && <p role="status">{t('loading')}</p>}
      {!loading && !error && items.length === 0 && <p>{t('empty')}</p>}
      {items.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm" aria-label={t('tableLabel')}>
            <thead className="text-left text-xs text-[var(--sc-text-secondary)]">
              <tr>
                <th className="p-3 font-medium">{t('seller')}</th>
                <th className="p-3 font-medium">{t('period')}</th>
                <th className="p-3 font-medium">{t('eligible')}</th>
                <th className="p-3 font-medium">{t('status')}</th>
                <th className="p-3 font-medium">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-[var(--sc-border-default)]">
                  <td className="p-3 font-mono text-xs">{row.tenantId}</td>
                  <td className="p-3 tabular-nums">
                    {row.periodStart} → {row.periodEnd}
                  </td>
                  <td className="p-3 tabular-nums">
                    {Number(row.eligibleAmountVnd).toLocaleString(locale)} VND
                  </td>
                  <td className="p-3">
                    <Badge status="info" label={t(`statuses.${row.status}`)} />
                  </td>
                  <td className="p-3">
                    <Button variant="outline" size="sm" onClick={() => setSelected(row)}>
                      {t('review')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {selected && (
        <PayoutStatementDetail
          key={selected.id}
          id={selected.id}
          tenantId={selected.tenantId}
          onClose={() => setSelected(null)}
          onChanged={() => setTick((n) => n + 1)}
        />
      )}
    </div>
  );
}
