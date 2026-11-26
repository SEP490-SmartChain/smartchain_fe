import { useEffect, useMemo, useState } from 'react';

import { RotateCw, Truck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button } from '@/components/Common';

import { shipmentApi } from '../api/shipmentApi';
import { getCarrierDisplayInfo } from '../lib/carrierTracking';

import type { TrackingEvent } from '../schemas/shipmentSchema';

interface ShipmentTimelineProps {
  id: string;
  carrierCode?: string | null;
  trackingNumber?: string | null;
  status?: string;
}

export function ShipmentTimeline({
  id,
  carrierCode,
  trackingNumber,
  status,
}: ShipmentTimelineProps) {
  const t = useTranslations('Shipments');
  const locale = useLocale();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  const carrierInfo = useMemo(
    () => getCarrierDisplayInfo(carrierCode, trackingNumber),
    [carrierCode, trackingNumber],
  );

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setEvents([]);
    setLoading(true);
    setError(false);
    setNext(null);
    void shipmentApi
      .timeline(id, cursor, abort.signal)
      .then((page) => {
        if (!cancelled) {
          setEvents(page.items);
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
  }, [id, cursor, revision]);

  return (
    <section
      aria-label={t('timelineTitle')}
      className="space-y-3 border-t border-[var(--sc-border-default)] pt-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-semibold">{t('timelineTitle')}</h3>
          <p className="m-0 text-xs text-[var(--sc-text-tertiary)]">{t('timelineSubtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('reload')}
        </Button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-[var(--sc-text-tertiary)]">
          {t('loading')}
        </div>
      ) : error ? (
        <Alert variant="error">{t('loadError')}</Alert>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-subtle)] p-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Truck size={22} />
          </div>
          <h4 className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]">
            {status === 'LABEL_CREATED' || !status ? t('waitingCarrier') : t('timelineEmpty')}
          </h4>
          <p className="mx-auto mt-1 max-w-md text-xs text-[var(--sc-text-secondary)]">
            {t('waitingCarrierDesc', {
              carrier: carrierInfo.name || carrierCode || t('unknownCarrier'),
            })}
          </p>
        </div>
      ) : (
        <div className="relative pl-6 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-0.5 before:bg-[var(--sc-border-default)]">
          <ol className="m-0 list-none space-y-4 p-0">
            {events.map((event, index) => {
              const isFirst = index === 0;
              return (
                <li key={event.id} className="relative">
                  {/* Timeline bullet */}
                  <span
                    aria-hidden="true"
                    className={`absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 ${
                      isFirst
                        ? 'border-emerald-600 bg-emerald-600 ring-4 ring-emerald-100 dark:ring-emerald-950'
                        : 'border-[var(--sc-border-strong)] bg-[var(--sc-bg-primary)]'
                    }`}
                  />
                  <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-subtle)] p-3 text-sm">
                    <div className="space-y-0.5">
                      <p className="m-0 font-medium text-[var(--sc-text-primary)]">
                        {t.has(`deliveryEvents.${event.eventCode}`)
                          ? t(`deliveryEvents.${event.eventCode}`)
                          : t.has(`journeyStatuses.${event.standardStatus}`)
                            ? t(`journeyStatuses.${event.standardStatus}`)
                            : t('journeyUnknown')}
                      </p>
                      <time
                        dateTime={event.eventTime}
                        className="text-xs text-[var(--sc-text-tertiary)]"
                      >
                        {new Date(event.eventTime).toLocaleString(locale)}
                      </time>
                      {event.eventCode && (
                        <p className="m-0 font-mono text-[11px] text-[var(--sc-text-tertiary)]">
                          {event.eventCode}
                        </p>
                      )}
                      {event.hubName && (
                        <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
                          {t('timelineHub', { hub: event.hubName })}
                        </p>
                      )}
                      {event.courier && (
                        <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
                          {t('timelineCourier', {
                            name: event.courier.displayName,
                            phone: event.courier.phoneMasked,
                            plate: event.courier.vehiclePlate,
                          })}
                        </p>
                      )}
                      {typeof event.attemptNo === 'number' && (
                        <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
                          {t('timelineAttempt', { attempt: event.attemptNo })}
                        </p>
                      )}
                      {typeof event.weightGram === 'number' && (
                        <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
                          {t('timelineWeight', { weight: event.weightGram.toLocaleString(locale) })}
                        </p>
                      )}
                      {event.reasonCode && (
                        <p className="m-0 text-xs text-[var(--sc-warning-dark)]">
                          {t.has(`deliveryReasons.${event.reasonCode}`)
                            ? t(`deliveryReasons.${event.reasonCode}`)
                            : t('timelineReason', { reason: event.reasonCode })}
                        </p>
                      )}
                    </div>
                    <Badge
                      status={event.isApplied ? 'success' : 'default'}
                      label={event.isApplied ? t('timelineApplied') : t('timelineRecorded')}
                      size="sm"
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {(history.length > 0 || next) && (
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || history.length === 0}
            onClick={() => {
              setCursor(history[history.length - 1]);
              setHistory((values) => values.slice(0, -1));
            }}
          >
            {t('previous')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || !next}
            onClick={() => {
              if (next) {
                setHistory((values) => [...values, cursor]);
                setCursor(next);
              }
            }}
          >
            {t('next')}
          </Button>
        </div>
      )}
    </section>
  );
}
