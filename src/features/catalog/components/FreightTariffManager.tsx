import { useEffect, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

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

/** Formats an API UTC timestamp; the time is shown only when it is not midnight. */
function formatUtc(value: string, locale: string): string {
  const date = new Date(`${value.slice(0, 16)}:00.000Z`);
  const hasTime = value.slice(11, 16) !== '00:00';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}

export function FreightTariffManager() {
  const { can } = useAccess();
  const user = useAuthStore((s) => s.user);
  const revision = useAuthStore((s) => s.revision);
  if (!can('tariffs.manage') || !user) return null;
  return <Manager key={`${user.userId}:${revision}`} />;
}
function Manager() {
  const t = useTranslations('FreightTariffs');
  const locale = useLocale();
  const vnd = (amount: string) => t('priceVnd', { amount: BigInt(amount).toLocaleString(locale) });
  const zoneLabel = (zone: string) => (t.has(`zone_${zone}`) ? t(`zone_${zone}`) : zone);
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
  const [template, setTemplate] = useState<PurchaseTariff | SellerTariff | null>(null);
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
              <Button
                disabled={loading || error}
                onClick={() => {
                  setTemplate(null);
                  setEditing(null);
                }}
              >
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
              setTemplate(null);
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
              render: (r) => {
                if ('code' in r) return <span className="font-medium">{r.code}</span>;
                const service = services.find((s) => s.id === r.serviceId);
                return (
                  <div className="min-w-40">
                    <div className="font-medium">{service?.carrier.name ?? r.carrierId}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--sc-text-secondary)]">
                      <span className="rounded-md bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 font-medium text-[var(--sc-text-primary)]">
                        {zoneLabel(r.zone)}
                      </span>
                      {service && <span>{service.name}</span>}
                    </div>
                  </div>
                );
              },
            },
            // Purchase versions only count draft saves; the seller version is the business version.
            ...(kind === 'sell'
              ? [
                  {
                    key: 'version',
                    label: t('versionNo'),
                    align: 'center' as const,
                    render: (r: PurchaseTariff | SellerTariff) => (
                      <span className="tabular-nums text-[var(--sc-text-secondary)]">
                        {t('versionShort', {
                          version: 'versionNo' in r ? r.versionNo : r.version,
                        })}
                      </span>
                    ),
                  },
                ]
              : []),
            {
              key: 'status',
              label: t('status'),
              render: (r) => (
                <span className="whitespace-nowrap">
                  <Badge
                    status={r.status === 'PUBLISHED' ? 'success' : 'default'}
                    label={t(`status_${r.status}`)}
                  />
                </span>
              ),
            },
            {
              key: 'effectiveFrom',
              label: t('validity'),
              render: (r) => (
                <span className="whitespace-nowrap tabular-nums">
                  {formatUtc(r.effectiveFrom, locale)}
                  <span className="mx-1.5 text-[var(--sc-text-tertiary)]">→</span>
                  {r.effectiveTo ? (
                    formatUtc(r.effectiveTo, locale)
                  ) : (
                    <span className="text-[var(--sc-text-secondary)]">{t('noEnd')}</span>
                  )}
                </span>
              ),
            },
            {
              key: 'priceBands',
              label: t('price'),
              align: 'right',
              render: (r) => (
                <div className="ml-auto w-fit space-y-1">
                  {r.bands.map((b) => {
                    const weight =
                      b.minWeightG === 0 && b.maxWeightG === null
                        ? null
                        : b.maxWeightG === null
                          ? t('weightFrom', { from: b.minWeightG.toLocaleString(locale) })
                          : t('weightRange', {
                              from: b.minWeightG.toLocaleString(locale),
                              to: b.maxWeightG.toLocaleString(locale),
                            });
                    const parts =
                      'laneCode' in b
                        ? [
                            t(`lane_${b.laneCode}`),
                            b.direction === 'RETURN' ? t('direction_RETURN') : null,
                            weight,
                          ]
                        : [weight ?? t('weightAll')];
                    return (
                      <div
                        className="flex items-baseline justify-end gap-3 whitespace-nowrap tabular-nums"
                        key={`${'direction' in b ? b.direction : ''}:${'laneCode' in b ? b.laneCode : ''}:${b.minWeightG}`}
                      >
                        <span className="text-xs text-[var(--sc-text-secondary)]">
                          {parts.filter(Boolean).join(' · ')}
                        </span>
                        <span className="font-semibold">{vnd(b.basePriceVnd)}</span>
                      </div>
                    );
                  })}
                </div>
              ),
            },
            {
              key: 'actions',
              label: t('actions'),
              align: 'center',
              render: (r) =>
                r.status === 'DRAFT' ? (
                  <div className="flex justify-center gap-2">
                    <Button size="sm" variant="soft" onClick={() => setEditing(r)}>
                      {t('edit')}
                    </Button>
                    <Button size="sm" onClick={() => setPublishing(r)}>
                      {t('publish')}
                    </Button>
                  </div>
                ) : r.status === 'PUBLISHED' ? (
                  <div className="flex justify-center gap-2">
                    <Button
                      size="sm"
                      variant="soft"
                      className="whitespace-nowrap"
                      title={t('repriceTitle')}
                      onClick={() => {
                        setTemplate(r);
                        setEditing(null);
                      }}
                    >
                      {t('reprice')}
                    </Button>
                    <Button
                      size="sm"
                      variant="softDanger"
                      className="whitespace-nowrap"
                      title={t('closeWindow')}
                      onClick={() => setClosing(r)}
                    >
                      {t('closeShort')}
                    </Button>
                  </div>
                ) : (
                  <span className="text-[var(--sc-text-secondary)]">{t('immutable')}</span>
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
          template={template}
          services={services}
          onClose={() => {
            setEditing(undefined);
            setTemplate(null);
          }}
          onSaved={() => {
            setEditing(undefined);
            setTemplate(null);
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
