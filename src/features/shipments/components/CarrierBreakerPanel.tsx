import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, PageHeader } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { shipmentApi } from '../api/shipmentApi';

import type { CarrierBreaker } from '../schemas/shipmentSchema';

export function CarrierBreakerPanel() {
  const { can } = useAccess();
  const user = useAuthStore((s) => s.user);
  const revision = useAuthStore((s) => s.revision);
  return can('integration.errors.view') && user ? (
    <Panel key={`${user.userId}:${revision}`} />
  ) : null;
}
function Panel() {
  const t = useTranslations('CarrierBreakers');
  const [rows, setRows] = useState<CarrierBreaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(false);
    setRows([]);
    void shipmentApi
      .breakers(abort.signal)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [revision]);
  return (
    <section className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button variant="secondary" disabled={loading} onClick={() => setRevision((v) => v + 1)}>
            {t('reload')}
          </Button>
        }
      />
      {error && <Alert variant="error">{t('error')}</Alert>}
      <Card>
        <DataTable
          ariaLabel={t('title')}
          data={rows}
          isLoading={loading}
          getRowKey={(r) => r.account_id}
          emptyMessage={error ? t('error') : t('empty')}
          columns={[
            {
              key: 'account_id',
              label: t('account'),
              render: (r) => <span title={r.account_id}>{r.account_id.slice(0, 8)}</span>,
            },
            {
              key: 'warehouse_id',
              label: t('warehouse'),
              render: (r) => <span title={r.warehouse_id}>{r.warehouse_id.slice(0, 8)}</span>,
            },
            { key: 'environment', label: t('environment') },
            {
              key: 'state',
              label: t('state'),
              render: (r) => (
                <Badge
                  status={
                    !r.available
                      ? 'default'
                      : r.state === 'OPEN'
                        ? 'error'
                        : r.state === 'HALF_OPEN'
                          ? 'warning'
                          : 'success'
                  }
                  label={t(r.available ? r.state : 'UNAVAILABLE')}
                />
              ),
            },
            {
              key: 'failures',
              label: t('failures'),
              render: (r) => (r.available ? r.failures : '—'),
            },
            {
              key: 'openUntil',
              label: t('until'),
              render: (r) => (r.openUntil ? new Date(r.openUntil).toLocaleString() : '—'),
            },
          ]}
        />
      </Card>
    </section>
  );
}
