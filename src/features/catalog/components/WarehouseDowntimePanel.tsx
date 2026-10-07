import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

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
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setRows([]);
    setCounts(null);
    setError(null);
    setLoading(true);
    setStart('');
    setEnd('');
    setReason('');
    setOperationKey(crypto.randomUUID());
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
      toast.success(t('statusUpdated'));
      onSaved();
      setRetry((v) => v + 1);
    } catch (f) {
      if (principal === useAuthStore.getState().user) {
        setError(f instanceof ApiError ? f.message : t('statusError'));
      }
    } finally {
      setSaving(false);
    }
  };
  const changed = () => setOperationKey(crypto.randomUUID());
  return (
    <section className="mt-5 space-y-3" aria-label={t('downtimeTitle')}>
      <h2 className="font-semibold">{t('downtimeTitle')}</h2>
      <p>{t('downtimeNotice')}</p>
      {loading && <p role="status">{t('loading')}</p>}
      {counts && (
        <p>
          {t('outstanding', {
            stock: counts.stockUnits,
            tasks: counts.openTasks,
            waves: counts.openWaves,
          })}
        </p>
      )}
      {error && (
        <Alert variant="error" title={error}>
          <Button onClick={() => setRetry((v) => v + 1)}>{t('retry')}</Button>
        </Alert>
      )}
      {!loading && !rows.length && <p>{t('downtimeEmpty')}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="py-2">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: warehouse.timeZone,
            }).format(new Date(row.startAt))}{' '}
            –{' '}
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: warehouse.timeZone,
            }).format(new Date(row.endAt))}
            : {row.reason}
          </li>
        ))}
      </ul>
      {can('warehouses.downtime.manage') && warehouse.status === 'ACTIVE' && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label>
            {t('startAt')} ({warehouse.timeZone})
            <Input
              type="datetime-local"
              value={start}
              required
              onChange={(e) => {
                setStart(e.target.value);
                changed();
              }}
            />
          </label>
          <label>
            {t('endAt')}
            <Input
              type="datetime-local"
              value={end}
              required
              onChange={(e) => {
                setEnd(e.target.value);
                changed();
              }}
            />
          </label>
          <label>
            {t('reason')}
            <Input
              value={reason}
              minLength={3}
              maxLength={500}
              required
              onChange={(e) => {
                setReason(e.target.value);
                changed();
              }}
            />
          </label>
          <Button type="submit" disabled={loading} isLoading={saving}>
            {t('schedule')}
          </Button>
        </form>
      )}
    </section>
  );
}
