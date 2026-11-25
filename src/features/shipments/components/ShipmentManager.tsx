import { useEffect, useMemo, useState } from 'react';

import { Check, ChevronLeft, ChevronRight, Copy, Eye, RotateCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, PageHeader } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { ShipmentJourneyStepper } from './ShipmentJourneyStepper';
import { ShipmentTimeline } from './ShipmentTimeline';
import { shipmentApi } from '../api/shipmentApi';
import { getCarrierDisplayInfo, getJourneyBadgeProps } from '../lib/carrierTracking';
import { getDispatchFailureGuidance } from '../lib/dispatchFailureGuidance';

import type { CancelResult, Shipment } from '../schemas/shipmentSchema';

/** Booking failure codes from dispatch that an operator can act on; others fall back to a generic hint. */
const FAILURE_REASON_KEYS: Readonly<Record<string, string>> = {
  'DISPATCH.CARRIER_REJECTED': 'carrierRejected',
  'DISPATCH.ADDRESS_MAPPING_REQUIRED': 'addressMapping',
  'DISPATCH.INVALID_ADDRESS_MAPPING': 'addressMapping',
  'DISPATCH.INVALID_SERVICE_MAPPING': 'serviceMapping',
  'DISPATCH.INVALID_PACKED_MEASUREMENTS': 'measurements',
  'DISPATCH.PACKED_EVIDENCE_REQUIRED': 'measurements',
  'DISPATCH.INVALID_DELIVERY_NOTE': 'deliveryNote',
  'DISPATCH.CARRIER_UNAVAILABLE': 'carrierUnavailable',
  'DISPATCH.CIRCUIT_OPEN': 'carrierUnavailable',
  'DISPATCH.BREAKER_UNAVAILABLE': 'carrierUnavailable',
  'DISPATCH.CARRIER_ACCOUNT_UNAVAILABLE': 'carrierAccount',
  'DISPATCH.INVALID_CARRIER_ACCOUNT': 'carrierAccount',
  'DISPATCH.INVALID_CARRIER_CONFIGURATION': 'carrierAccount',
  'DISPATCH.INVALID_GHN_SHOP': 'carrierAccount',
  'DISPATCH.SHOP_ID_MISMATCH': 'carrierAccount',
};

function failureReasonKey(code: string): string {
  return `failureReasons.${FAILURE_REASON_KEYS[code] ?? 'other'}`;
}

export function ShipmentManager() {
  const { can } = useAccess();
  const user = useAuthStore((s) => s.user);
  const revision = useAuthStore((s) => s.revision);
  return can('shipments.view') && user ? <Manager key={`${user.userId}:${revision}`} /> : null;
}

function Manager() {
  const t = useTranslations('Shipments');
  const locale = useLocale();
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

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [locale],
  );
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }),
    [locale],
  );

  const handlePrevious = () => {
    setCursor(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const handleNext = () => {
    if (!next) return;
    setHistory((h) => [...h, cursor]);
    setCursor(next);
  };

  const handleReload = () => {
    setCursor(undefined);
    setHistory([]);
    setRevision((v) => v + 1);
  };

  return (
    <section className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button variant="secondary" disabled={loading} onClick={handleReload}>
            <RotateCw aria-hidden="true" size={16} className={loading ? 'animate-spin' : ''} />
            {t('reload')}
          </Button>
        }
      />
      {error && <Alert variant="error">{t('loadError')}</Alert>}
      <Card padding="none" className="overflow-hidden">
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
              render: (r) => (
                <div className="flex flex-col gap-0.5">
                  {r.trackingNumber ? (
                    <span className="font-mono text-[13px] font-semibold text-[var(--sc-text-primary)]">
                      {r.trackingNumber}
                    </span>
                  ) : (
                    <span className="text-[var(--sc-text-tertiary)]">{t('notBooked')}</span>
                  )}
                  {r.packingRecordId && (
                    <span className="font-mono text-[11px] text-[var(--sc-text-tertiary)]">
                      {t('packageRef')}: {r.packingRecordId.slice(0, 8)}…
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'carrierCode',
              label: t('carrier'),
              render: (r) => {
                const carrierInfo = getCarrierDisplayInfo(r.carrierCode, r.trackingNumber);
                return (
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${carrierInfo.badgeClass}`}
                  >
                    {carrierInfo.code}
                  </span>
                );
              },
            },
            {
              key: 'bookingState',
              label: t('state'),
              render: (r) => (
                <div className="flex flex-col items-start gap-1">
                  <BookingStatusBadge row={r} />
                  {r.bookingState === 'FAILED' && r.failureCode && (
                    <span className="text-xs text-[var(--sc-text-secondary)]">
                      {t(failureReasonKey(r.failureCode))}
                    </span>
                  )}
                  {r.bookingState === 'CONFIRMED' && !r.labelAvailable && (
                    <span className="text-xs text-[var(--sc-text-tertiary)]">
                      {t('labelFetching')}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'status',
              label: t('journey'),
              render: (r) => <JourneyStatusBadge status={r.status} />,
            },
            {
              key: 'createdAt',
              label: t('created'),
              render: (r) => {
                const created = new Date(r.createdAt);
                return (
                  <time dateTime={r.createdAt} className="flex flex-col whitespace-nowrap">
                    <span className="text-sm font-medium">{dateFormat.format(created)}</span>
                    <span className="text-xs text-[var(--sc-text-tertiary)]">
                      {timeFormat.format(created)}
                    </span>
                  </time>
                );
              },
            },
            {
              key: 'actions',
              label: <span className="sr-only">{t('actions')}</span>,
              align: 'right',
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('detailFor', { tracking: r.trackingNumber ?? r.id.slice(0, 8) })}
                    onClick={() => setSelected(r.id)}
                  >
                    <Eye aria-hidden="true" size={15} />
                    {t('view')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <nav
          aria-label={t('pagination')}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] px-4 py-3"
        >
          <p className="m-0 text-[13px] text-[var(--sc-text-secondary)]" aria-live="polite">
            {loading
              ? t('loading')
              : t('pageSummary', { page: history.length + 1, count: rows.length })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !history.length}
              onClick={handlePrevious}
            >
              <ChevronLeft aria-hidden="true" size={16} />
              {t('previous')}
            </Button>
            <Button variant="secondary" size="sm" disabled={loading || !next} onClick={handleNext}>
              {t('next')}
              <ChevronRight aria-hidden="true" size={16} />
            </Button>
          </div>
        </nav>
      </Card>
      {selected && (
        <ShipmentDetail key={selected} id={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

function BookingStatusBadge({ row }: { row: Shipment }) {
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

function JourneyStatusBadge({ status }: { status: string }) {
  const t = useTranslations('Shipments');
  const badgeProps = getJourneyBadgeProps(status);
  const label = t.has(`journeyStatuses.${status}`)
    ? t(`journeyStatuses.${status}`)
    : t('journeyUnknown');

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${badgeProps.dotColor}`} />
      <span className="text-[13px] font-medium text-[var(--sc-text-primary)]">{label}</span>
    </span>
  );
}

function ShipmentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('Shipments');
  const { can } = useAccess();
  const [row, setRow] = useState<Shipment | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);
  const [copied, setCopied] = useState(false);

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

  const carrierInfo = useMemo(
    () => (row ? getCarrierDisplayInfo(row.carrierCode, row.trackingNumber) : null),
    [row],
  );

  const notifications = useTranslations('Notifications');
  const [copyErrorId, setCopyErrorId] = useState('');
  const copyTracking = async () => {
    if (!row?.trackingNumber) return;
    setCopyErrorId('');
    try {
      await navigator.clipboard.writeText(row.trackingNumber);
    } catch {
      setCopied(false);
      setCopyErrorId(id);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function cancel() {
    const authRevision = useAuthStore.getState().revision;
    setBusy(true);
    setError(false);
    try {
      const result = await shipmentApi.cancel(id);
      if (authRevision !== useAuthStore.getState().revision) return;
      setCancelResult(result);
      setConfirmCancel(false);
      setRevision((v) => v + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

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
    <Modal isOpen onClose={onClose} title={t('detail')} width="740px">
      <div className="space-y-5">
        {error && <Alert variant="error">{t('loadError')}</Alert>}
        {row ? (
          <>
            {/* Header info bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-subtle)] p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-[var(--sc-text-primary)]">
                    {row.trackingNumber ?? t('notBooked')}
                  </span>
                  {row.trackingNumber && (
                    <button
                      type="button"
                      onClick={() => void copyTracking()}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)]"
                      title={t('copyTrackingNumber')}
                    >
                      {copied ? (
                        <>
                          <Check size={12} className="text-emerald-600" />
                          <span className="text-emerald-600 font-medium">{t('copied')}</span>
                        </>
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  )}
                </div>
                {copyErrorId === id && (
                  <Alert variant="error" compact>
                    {notifications('copyFailed')}
                  </Alert>
                )}
                <div className="flex items-center gap-2">
                  {carrierInfo && (
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${carrierInfo.badgeClass}`}
                    >
                      {carrierInfo.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <BookingStatusBadge row={row} />
                <JourneyStatusBadge status={row.status} />
              </div>
            </div>

            {/* Visual Stepper */}
            <ShipmentJourneyStepper status={row.status} bookingState={row.bookingState} />

            {/* Alerts */}
            {row.bookingState === 'FAILED' && row.failureCode && (
              <Alert variant="error">
                {t(failureReasonKey(row.failureCode))}
                <span className="mt-1 block font-mono text-xs opacity-75">
                  {t('failureCodeLabel', { code: row.failureCode })}
                </span>
              </Alert>
            )}
            {row.bookingState === 'UNKNOWN' && <Alert variant="warning">{t('verifyNotice')}</Alert>}
            {row.bookingState === 'CONFIRMED' && !row.labelAvailable && (
              <Alert variant="info">{t('confirmedLabelNotice')}</Alert>
            )}
            {can('shipments.sla.view') && row.failureCode && row.bookingState !== 'CONFIRMED' && (
              <Alert variant="warning">
                {t(`dispatchFailures.${getDispatchFailureGuidance(row.failureCode) ?? 'review'}`)}
              </Alert>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--sc-border-default)] p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('tracking')}</dt>
                <dd className="font-mono font-medium">{row.trackingNumber ?? t('notBooked')}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('carrier')}</dt>
                <dd className="font-medium">
                  {carrierInfo?.name ?? row.carrierCode ?? t('unknownCarrier')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('packageId')}</dt>
                <dd className="break-all font-mono text-xs text-[var(--sc-text-secondary)]">
                  {row.packingRecordId ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--sc-text-secondary)]">{t('shipmentId')}</dt>
                <dd className="break-all font-mono text-xs text-[var(--sc-text-secondary)]">
                  {row.id}
                </dd>
              </div>
            </div>

            {/* Actions: Download Label, Cancel */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border-default)] pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {can('shipments.label.download') && (
                  <Button
                    variant="primary"
                    disabled={busy || !row.labelAvailable}
                    onClick={() => void download()}
                  >
                    {busy ? t('downloading') : t('download')}
                  </Button>
                )}
                {can('shipments.cancel') &&
                  (row.bookingState === 'CONFIRMED' || row.bookingState === 'CANCEL_UNKNOWN') &&
                  (confirmCancel ? (
                    <div className="flex items-center gap-2">
                      <Button variant="danger" disabled={busy} onClick={() => void cancel()}>
                        {t('cancelSubmit')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setConfirmCancel(false)}
                      >
                        {t('cancelDismiss')}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
                      {t('cancelAction')}
                    </Button>
                  ))}
              </div>

              <Button variant="secondary" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
                <RotateCw size={14} className={busy ? 'animate-spin' : ''} />
                {t('reload')}
              </Button>
            </div>

            {cancelResult && <Alert variant="info">{t(`cancelResults.${cancelResult}`)}</Alert>}
            {row.bookingState === 'CANCEL_UNKNOWN' && (
              <Alert variant="warning">{t('cancelUnknownNotice')}</Alert>
            )}

            {/* Timeline */}
            <ShipmentTimeline
              key={`${id}:${revision}`}
              id={id}
              carrierCode={row.carrierCode}
              trackingNumber={row.trackingNumber}
              status={row.status}
            />
          </>
        ) : !error ? (
          <div className="py-12 text-center text-sm text-[var(--sc-text-tertiary)]">
            {t('loading')}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
