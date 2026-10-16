import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, PageHeader } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { Tabs } from '@/components/Common/Tabs/Tabs';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { FreightTariffClose } from './FreightTariffClose';
import { FreightTariffEditor } from './FreightTariffEditor';
import { freightTariffApi } from '../api/freightTariffApi';

import type { PurchaseTariff, SellerTariff, TariffService } from '../schemas/freightTariffSchema';

export function FreightTariffManager() {
  const { can } = useAccess();
  const user = useAuthStore((s) => s.user);
  const revision = useAuthStore((s) => s.revision);
  if (!can('tariffs.manage') || !user) return null;
  return <Manager key={`${user.userId}:${revision}`} />;
}
function Manager() {
  const t = useTranslations('FreightTariffs');
  const [kind, setKind] = useState<'purchase' | 'sell'>('purchase');
  const [closing, setClosing] = useState<PurchaseTariff | SellerTariff | null>(null);
  const [rows, setRows] = useState<(PurchaseTariff | SellerTariff)[]>([]);
  const [services, setServices] = useState<TariffService[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [next, setNext] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PurchaseTariff | SellerTariff | null | undefined>();
  const [publishing, setPublishing] = useState<PurchaseTariff | SellerTariff | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(false);
    setRows([]);
    setNext(null);
    void Promise.all([
      kind === 'purchase'
        ? freightTariffApi.purchase(cursor, abort.signal)
        : freightTariffApi.sell(cursor, abort.signal),
      freightTariffApi.services(abort.signal),
    ])
      .then(([page, options]) => {
        if (!cancelled) {
          setRows(page.items);
          setNext(page.pagination.nextCursor);
          setServices(options);
        }
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
  }, [kind, cursor, revision]);
  async function publish() {
    if (!publishing) return;
    setBusy(true);
    setError(false);
    try {
      await freightTariffApi.publish(kind, publishing);
      setPublishing(null);
      setRevision((v) => v + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <Card className="space-y-4 p-5">
        <PageHeader
          title={t('title')}
          description={t('subtitle')}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => setRevision((v) => v + 1)}
              >
                {t('reload')}
              </Button>
              <Button disabled={loading || error} onClick={() => setEditing(null)}>
                {t('create')}
              </Button>
            </div>
          }
        />
        <Tabs
          tabs={[
            { id: 'purchase', label: t('purchase') },
            { id: 'sell', label: t('sell') },
          ]}
          activeId={kind}
          onChange={(id) => {
            if (id === 'purchase' || id === 'sell') {
              setKind(id);
              setCursor(undefined);
              setEditing(undefined);
              setPublishing(null);
              setClosing(null);
            }
          }}
        />
        {error && (
          <Alert variant="error">
            {t('loadError')}{' '}
            <Button variant="ghost" onClick={() => setRevision((v) => v + 1)}>
              {t('reload')}
            </Button>
          </Alert>
        )}
        <DataTable
          data={rows}
          isLoading={loading}
          getRowKey={(r) => r.id}
          ariaLabel={t('title')}
          emptyMessage={t('empty')}
          columns={[
            {
              key: 'id',
              label: t('name'),
              render: (r) =>
                'code' in r
                  ? r.code
                  : `${services.find((s) => s.id === r.serviceId)?.carrier.name ?? r.carrierId} · ${r.zone}`,
            },
            {
              key: 'version',
              label: t('versionNo'),
              render: (r) => ('versionNo' in r ? r.versionNo : r.version),
            },
            {
              key: 'status',
              label: t('status'),
              render: (r) => (
                <Badge
                  status={r.status === 'PUBLISHED' ? 'success' : 'default'}
                  label={t(`status_${r.status}`)}
                />
              ),
            },
            {
              key: 'effectiveFrom',
              label: t('effectiveFrom'),
              render: (r) => r.effectiveFrom.replace('T', ' ').slice(0, 16),
            },
            {
              key: 'bands',
              label: t('effectiveTo'),
              render: (r) => (r.effectiveTo ? r.effectiveTo.replace('T', ' ').slice(0, 16) : '∞'),
            },
            {
              key: 'priceBands',
              label: t('bands'),
              render: (r) =>
                r.bands.map((b) => (
                  <div
                    key={`${'direction' in b ? b.direction : ''}:${'laneCode' in b ? b.laneCode : ''}:${b.minWeightG}`}
                  >
                    {'laneCode' in b
                      ? `${t(`direction_${b.direction}`)} · ${t(`lane_${b.laneCode}`)} · `
                      : ''}
                    {b.minWeightG}–{b.maxWeightG ?? '∞'}g ·{' '}
                    {BigInt(b.basePriceVnd).toLocaleString()} VND
                  </div>
                )),
            },
            {
              key: 'actions',
              label: t('actions'),
              render: (r) =>
                r.status === 'DRAFT' ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setEditing(r)}>
                      {t('edit')}
                    </Button>
                    <Button variant="outline" onClick={() => setPublishing(r)}>
                      {t('publish')}
                    </Button>
                  </div>
                ) : r.status === 'PUBLISHED' ? (
                  <Button variant="ghost" onClick={() => setClosing(r)}>
                    {t('closeWindow')}
                  </Button>
                ) : (
                  t('immutable')
                ),
            },
          ]}
        />
        <div className="flex justify-end gap-3 p-4">
          <Button
            variant="secondary"
            disabled={!cursor || loading}
            onClick={() => setCursor(undefined)}
          >
            {t('firstPage')}
          </Button>
          <Button
            variant="secondary"
            disabled={!next || loading}
            onClick={() => setCursor(next ?? undefined)}
          >
            {t('nextPage')}
          </Button>
        </div>
      </Card>
      {closing && (
        <FreightTariffClose
          kind={kind}
          row={closing}
          onClose={() => setClosing(null)}
          onSaved={() => {
            setClosing(null);
            setRevision((v) => v + 1);
          }}
        />
      )}
      {editing !== undefined && (
        <FreightTariffEditor
          kind={kind}
          row={editing}
          services={services}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setRevision((v) => v + 1);
          }}
        />
      )}
      {publishing && (
        <Modal
          isOpen
          onClose={() => {
            if (!busy) setPublishing(null);
          }}
          title={t('publish')}
        >
          <p className="mb-5 text-sm">{t('publishConfirm', { version: publishing.version })}</p>
          <Button isLoading={busy} onClick={() => void publish()}>
            {t('publish')}
          </Button>
        </Modal>
      )}
    </section>
  );
}
