import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, PauseCircle, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { z } from 'zod';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { parseLocalDateTime } from '@/lib/dateValidation';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './WarehouseDetails.module.css';
import { warehouseApi, type Downtime, type WarehouseOutstanding } from '../api/warehouseApi';

import type { Warehouse } from '../types/warehouse';

const downtimeSchema = z
  .object({ start: z.string(), end: z.string(), reason: z.string().trim().min(3).max(500) })
  .superRefine((values, context) => {
    const start = parseLocalDateTime(values.start, 'vietnam');
    const end = parseLocalDateTime(values.end, 'vietnam');
    if (!start) context.addIssue({ code: 'custom', path: ['start'], message: 'invalidDateTime' });
    if (!end) context.addIssue({ code: 'custom', path: ['end'], message: 'invalidDateTime' });
    if (start && end && end <= start) {
      context.addIssue({ code: 'custom', path: ['end'], message: 'timeOrder' });
    }
  });

const downtimeDefaults = { start: '', end: '', reason: '' };

export function WarehouseDowntimePanel({
  warehouse,
  onSaved,
}: {
  readonly warehouse: Warehouse;
  readonly onSaved: () => void;
}) {
  const t = useTranslations('Warehouses');
  const dateText = useTranslations('DateValidation');
  const locale = useLocale();
  const { can } = useAccess();
  const principal = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<Downtime[]>([]);
  const [counts, setCounts] = useState<WarehouseOutstanding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(downtimeSchema),
    defaultValues: downtimeDefaults,
  });
  const [retry, setRetry] = useState(0);
  const [operationKey, setOperationKey] = useState(() => createUuid());
  useEffect(() => {
    let active = true;
    setRows([]);
    setCounts(null);
    setError(null);
    setLoading(true);
    reset(downtimeDefaults);
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
  }, [warehouse.id, warehouse.version, principal, t, retry, reset]);
  const save = handleSubmit(async ({ start, end, reason }) => {
    if (!can('warehouses.downtime.manage') || saving) return;
    const startAt = parseLocalDateTime(start, 'vietnam');
    const endAt = parseLocalDateTime(end, 'vietnam');
    if (!startAt || !endAt) return;

    setSaving(true);
    setError(null);
    try {
      await warehouseApi.schedule(warehouse.id, {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason,
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
  });
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
          <form
            onSubmit={save}
            onChange={() => setOperationKey(createUuid())}
            className={styles.panel}
            noValidate
          >
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
                required
                {...register('start', { deps: ['end'] })}
                error={errors.start ? dateText('invalidDateTime') : undefined}
              />
              <Input
                label={t('endAt')}
                type="datetime-local"
                required
                {...register('end')}
                error={
                  errors.end
                    ? dateText(errors.end.message === 'timeOrder' ? 'timeOrder' : 'invalidDateTime')
                    : undefined
                }
              />
              <Input
                label={t('reason')}
                minLength={3}
                maxLength={500}
                required
                {...register('reason')}
                error={errors.reason ? t('intervalError') : undefined}
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
