import { useEffect, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button } from '@/components/Common';

import { shipmentApi } from '../api/shipmentApi';

import type { TrackingEvent } from '../schemas/shipmentSchema';

interface ShipmentTimelineProps {
  id: string;
}

export function ShipmentTimeline({ id }: ShipmentTimelineProps) {
  const t = useTranslations('Shipments');
  const locale = useLocale();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

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
        <h3 className="text-sm font-semibold">{t('timelineTitle')}</h3>
        <Button
          variant="ghost"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          {t('reload')}
        </Button>
      </div>
      {loading ? (
        <p role="status" className="text-sm">
          {t('loading')}
        </p>
      ) : error ? (
        <Alert variant="error">{t('loadError')}</Alert>
      ) : events.length === 0 ? (
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('timelineEmpty')}</p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-[var(--sc-border-default)] pl-3 text-sm"
            >
              <div className="space-y-1">
                <p className="font-medium">
                  {t.has(`journeyStatuses.${event.standardStatus}`)
                    ? t(`journeyStatuses.${event.standardStatus}`)
                    : t('journeyUnknown')}
                </p>
                <time dateTime={event.eventTime} className="text-[var(--sc-text-secondary)]">
                  {new Date(event.eventTime).toLocaleString(locale)}
                </time>
              </div>
              <Badge
                status={event.isApplied ? 'info' : 'default'}
                label={event.isApplied ? t('timelineApplied') : t('timelineRecorded')}
              />
            </li>
          ))}
        </ol>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
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
    </section>
  );
}
