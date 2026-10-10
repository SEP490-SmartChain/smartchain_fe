import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { warehouseApi, type WarehouseOutstanding } from '../api/warehouseApi';

import type { Warehouse } from '../types/warehouse';

export function WarehouseStatusModal({
  warehouse,
  onClose,
  onSaved,
}: {
  readonly warehouse: Warehouse;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const t = useTranslations('Warehouses');
  const principal = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState<WarehouseOutstanding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setCounts(null);
    setError(null);
    setReason('');
    void warehouseApi
      .outstanding(warehouse.id)
      .then((v) => {
        if (active) setCounts(v);
      })
      .catch((f) => {
        if (active) setError(f instanceof ApiError ? f.message : t('loadError'));
      });
    return () => {
      active = false;
    };
  }, [warehouse.id, principal, t, retry]);
  const blocked =
    warehouse.status === 'ACTIVE' &&
    !!counts &&
    (counts.stockUnits > 0 || counts.openTasks > 0 || counts.openWaves > 0);
  const save = async () => {
    if (!counts || blocked || saving || reason.trim().length < 3) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseApi.setStatus(
        warehouse.id,
        warehouse.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        reason.trim(),
        warehouse.version,
      );
      if (principal !== useAuthStore.getState().user) return;
      toast.success(t('statusUpdated'));
      onSaved();
    } catch (f) {
      if (principal === useAuthStore.getState().user) {
        setError(f instanceof ApiError ? f.message : t('statusError'));
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={t('statusTitle')}>
      <p className="mt-3">{t('statusConfirmation', { name: warehouse.name })}</p>
      {counts ? (
        <p className="my-3">
          {t('outstanding', {
            stock: counts.stockUnits,
            tasks: counts.openTasks,
            waves: counts.openWaves,
          })}
        </p>
      ) : (
        <p role="status">{t('loading')}</p>
      )}
      {blocked && <Alert variant="warning" title={t('blockedClosure')} />}
      {error && (
        <Alert variant="error" title={error}>
          <Button onClick={() => setRetry((v) => v + 1)}>{t('retry')}</Button>
        </Alert>
      )}
      <label>
        {t('reason')}
        <Input
          value={reason}
          minLength={3}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          variant="danger"
          disabled={!counts || blocked || reason.trim().length < 3}
          isLoading={saving}
          onClick={() => void save()}
        >
          {t('confirm')}
        </Button>
      </div>
    </Modal>
  );
}
