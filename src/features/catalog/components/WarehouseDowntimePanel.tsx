import { useEffect, useState } from 'react';

import { CalendarClock, PauseCircle, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './WarehouseDetails.module.css';
import { warehouseApi, type Downtime, type WarehouseOutstanding } from '../api/warehouseApi';

import type { Warehouse } from '../types/warehouse';

export function WarehouseDowntimePanel({
  warehouse,
  onSaved,
}: {
  readonly warehouse: Warehouse;
  readonly onSaved: () => void;
}) {
  const t = useTranslations('Warehouses');
  const locale = useLocale();
  const { can } = useAccess();
  const principal = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<Downtime[]>([]);
  const [counts, setCounts] = useState<WarehouseOutstanding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [retry, setRetry] = useState(0);
  const [operationKey, setOperationKey] = useState(() => createUuid());
  useEffect(() => {
    let active = true;
    setRows([]);
    setCounts(null);
    setError(null);
    setLoading(true);
    setStart('');
    setEnd('');
    setReason('');
    setOperationKey(createUuid());
    void Promise.all([warehouseApi.downtime(warehouse.id), warehouseApi.outstanding(warehouse.id)])
      .then(([intervals, work]) => {
        if (active) {
          setRows(intervals);
          setCounts(work);
        }
      })
      .catch((f) => {
        if (active) setError(f instanceof ApiError ? f.message : t('loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [warehouse.id, warehouse.version, principal, t, retry]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!can('warehouses.downtime.manage') || saving) return;
    // datetime-local values are explicitly entered in the warehouse's Vietnam time zone.
    const startAt = new Date(`${start}:00+07:00`);
    const endAt = new Date(`${end}:00+07:00`);
    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt <= startAt ||
      reason.trim().length < 3
    ) {
      setError(t('intervalError'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await warehouseApi.schedule(warehouse.id, {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason: reason.trim(),
        operationKey,
        expectedVersion: warehouse.version,
      });
      if (principal !== useAuthStore.getState().user) return;
      toast.success(t('downtimeSaved'));
      onSaved();
      setRetry((v) => v + 1);
    } catch (f) {
      if (principal === useAuthStore.getState().user) {
        setError(f instanceof ApiError ? f.message : t('downtimeSaveError'));
      }
    } finally {
      setSaving(false);
    }
  };
  const changed = () => setOperationKey(createUuid());
  return (
    <section className={styles.stack} aria-label={t('downtimeTitle')}>
      <div>
        <h2 className={styles.panelTitle}>
          <PauseCircle size={20} className={styles.icon} aria-hidden="true" />
          {t('downtimeTitle')}
        </h2>
        <p className={`${styles.copy} mt-2`}>{t('downtimeNotice')}</p>
      </div>
      {error && (
        <Alert variant="error" title={error}>
          <Button variant="outline" onClick={() => setRetry((v) => v + 1)}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      {loading && <p role="status">{t('loading')}</p>}
      <div className={styles.split}>
        <div className={styles.stack}>
          {counts && (
            <div className={styles.panel}>
              <h3 className={`${styles.subtitle} mb-4`}>{t('currentWork')}</h3>
              <dl className={styles.counts}>
                {[
                  { label: 'stockUnits', value: counts.stockUnits },
                  { label: 'openTasks', value: counts.openTasks },
                  { label: 'openWaves', value: counts.openWaves },
                ].map((item) => (
                  <div key={item.label}>
                    <dt>{t(item.label)}</dt>
                    <dd>{item.value.toLocaleString(locale)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className={styles.panel}>
            <h3 className={`${styles.subtitle} mb-4`}>{t('scheduledDowntime')}</h3>
            {!loading && !rows.length && !error && (
              <div className={styles.empty}>
                <CalendarClock size={28} aria-hidden="true" />
                <p>{t('downtimeEmpty')}</p>
              </div>
            )}
            <ul className={styles.stack}>
              {rows.map((row) => (
                <li key={row.id} className={styles.interval}>
                  <p className="font-medium">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: warehouse.timeZone,
                    }).format(new Date(row.startAt))}{' '}
                    –{' '}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: warehouse.timeZone,
                    }).format(new Date(row.endAt))}
                  </p>
                  <p className="break-words text-[var(--sc-text-secondary)]">{row.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {can('warehouses.downtime.manage') && warehouse.status === 'ACTIVE' && (
          <form onSubmit={save} className={styles.panel}>
            <h3 className={`${styles.panelTitle} mb-2`}>
              <Plus size={20} className={styles.icon} aria-hidden="true" />
              {t('schedule')}
            </h3>
            <p className={`${styles.copy} mb-5`}>
              {t('downtimeTimeZone', { zone: warehouse.timeZone })}
            </p>
            <fieldset disabled={saving || loading} className="space-y-4">
              <Input
                label={t('startAt')}
                type="datetime-local"
                value={start}
                required
                onChange={(e) => {
                  setStart(e.target.value);
                  changed();
                }}
              />
              <Input
                label={t('endAt')}
                type="datetime-local"
                value={end}
                required
                onChange={(e) => {
                  setEnd(e.target.value);
                  changed();
                }}
              />
              <Input
                label={t('reason')}
                value={reason}
                minLength={3}
                maxLength={500}
                required
                onChange={(e) => {
                  setReason(e.target.value);
                  changed();
                }}
              />
            </fieldset>
            <div className={styles.formActions}>
              <Button type="submit" disabled={loading} isLoading={saving}>
                {t('schedule')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
