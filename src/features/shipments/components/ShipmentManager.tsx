import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, PageHeader } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { shipmentApi } from '../api/shipmentApi';

import type { Shipment } from '../schemas/shipmentSchema';

export function ShipmentManager() {
  const { can } = useAccess();
  const user = useAuthStore((s) => s.user);
  const revision = useAuthStore((s) => s.revision);
  return can('shipments.view') && user ? <Manager key={`${user.userId}:${revision}`} /> : null;
}
function Manager() {
  const t = useTranslations('Shipments');
  const [rows, setRows] = useState<Shipment[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setRows([]);
    setNext(null);
    setLoading(true);
    setError(false);
    void shipmentApi
      .list(cursor, abort.signal)
      .then((page) => {
        if (!cancelled) {
          setRows(page.items);
          setNext(page.pagination.nextCursor);
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
  }, [cursor, revision]);
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
      {error && <Alert variant="error">{t('loadError')}</Alert>}
      <Card>
        <DataTable
          ariaLabel={t('title')}
          data={rows}
          isLoading={loading}
          emptyMessage={error ? t('loadError') : t('empty')}
          getRowKey={(r) => r.id}
          columns={[
            {
              key: 'trackingNumber',
              label: t('tracking'),
              render: (r) => r.trackingNumber ?? t('notBooked'),
            },
            {
              key: 'carrierCode',
              label: t('carrier'),
              render: (r) => r.carrierCode ?? t('unknownCarrier'),
            },
            { key: 'bookingState', label: t('state'), render: (r) => <Status row={r} /> },
            {
              key: 'labelAvailable',
              label: t('label'),
              render: (r) => (r.labelAvailable ? t('labelReady') : t('labelPending')),
            },
            {
              key: 'createdAt',
              label: t('created'),
              render: (r) => new Date(r.createdAt).toLocaleString(),
            },
            {
              key: 'actions',
              label: t('actions'),
              render: (r) => (
                <Button variant="ghost" onClick={() => setSelected(r.id)}>
                  {t('detail')}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          disabled={loading || !history.length}
          onClick={() => {
            setCursor(history[history.length - 1]);
            setHistory((h) => h.slice(0, -1));
          }}
        >
          {t('previous')}
        </Button>
        <Button
          variant="secondary"
          disabled={loading || !next}
          onClick={() => {
            if (next) {
              setHistory((h) => [...h, cursor]);
              setCursor(next);
            }
          }}
        >
          {t('next')}
        </Button>
      </div>
      {selected && (
        <ShipmentDetail key={selected} id={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
function Status({ row }: { row: Shipment }) {
  const t = useTranslations('Shipments');
  return (
    <Badge
      status={
        row.bookingState === 'UNKNOWN'
          ? 'warning'
          : row.bookingState === 'FAILED'
            ? 'error'
            : row.bookingState === 'CONFIRMED'
              ? 'success'
              : 'info'
      }
      label={t(`states.${row.bookingState}`)}
    />
  );
}
function ShipmentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('Shipments');
  const { can } = useAccess();
  const [row, setRow] = useState<Shipment | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setRow(null);
    setError(false);
    void shipmentApi
      .detail(id, abort.signal)
      .then((r) => {
        if (!cancelled) setRow(r);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [id, revision]);
  async function download() {
    const authRevision = useAuthStore.getState().revision;
    setBusy(true);
    setError(false);
    try {
      const pdf = await shipmentApi.label(id);
      if (authRevision !== useAuthStore.getState().revision) return;
      const url = URL.createObjectURL(pdf);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `shipment-${id}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal isOpen onClose={onClose} title={t('detail')} width="620px">
      <div className="space-y-4">
        {error && <Alert variant="error">{t('loadError')}</Alert>}
        {row ? (
          <>
            <Status row={row} />
            {row.bookingState === 'UNKNOWN' && <Alert variant="warning">{t('verifyNotice')}</Alert>}
            {row.bookingState === 'CONFIRMED' && !row.labelAvailable && (
              <Alert variant="info">{t('confirmedLabelNotice')}</Alert>
            )}
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--sc-text-secondary)]">{t('tracking')}</dt>
                <dd>{row.trackingNumber ?? t('notBooked')}</dd>
              </div>
              <div>
                <dt className="text-[var(--sc-text-secondary)]">{t('carrier')}</dt>
                <dd>{row.carrierCode ?? t('unknownCarrier')}</dd>
              </div>
              <div>
                <dt className="text-[var(--sc-text-secondary)]">{t('shipmentId')}</dt>
                <dd className="break-all">{row.id}</dd>
              </div>
              <div>
                <dt className="text-[var(--sc-text-secondary)]">{t('packageId')}</dt>
                <dd className="break-all">{row.packingRecordId ?? '—'}</dd>
              </div>
              {row.failureCode && (
                <div>
                  <dt>{t('failure')}</dt>
                  <dd>{row.failureCode}</dd>
                </div>
              )}
            </dl>
            {can('shipments.label.download') && (
              <Button disabled={busy || !row.labelAvailable} onClick={() => void download()}>
                {busy ? t('downloading') : t('download')}
              </Button>
            )}
          </>
        ) : !error ? (
          <p role="status">{t('loading')}</p>
        ) : null}
        <Button variant="secondary" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          {t('reload')}
        </Button>
      </div>
    </Modal>
  );
}
