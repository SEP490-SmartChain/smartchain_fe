import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { WarehouseLayoutPanel } from './WarehouseLayoutPanel';
import { warehouseApi } from '../api/warehouseApi';

import type { Warehouse } from '../types/warehouse';

/** Reuses assigned warehouse layout commands without changing the inbound warehouse. */
export function WarehouseStorageSetup({
  warehouseId,
  warehouseCode,
  onEditingChange,
  onSaved,
}: {
  warehouseId: string;
  warehouseCode: string;
  onEditingChange: (editing: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations('WarehouseLayout'),
    { can } = useAccess(),
    user = useAuthStore((state) => state.user);
  const allowed = can('warehouses.layout.manage');
  const [result, setResult] = useState<{
      owner: typeof user;
      warehouse: Warehouse;
    } | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const visible =
    allowed &&
    result?.owner === user &&
    result.warehouse.id === warehouseId &&
    result.warehouse.code === warehouseCode
      ? result.warehouse
      : null;
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    if (allowed) {
      void warehouseApi
        .assigned(warehouseId, warehouseCode, controller.signal)
        .then((warehouse) => {
          if (controller.signal.aborted || user !== useAuthStore.getState().user) return;
          if (warehouse) setResult({ owner: user, warehouse });
          else setError(t('loadError'));
        })
        .catch((failure) => {
          if (!controller.signal.aborted && user === useAuthStore.getState().user) {
            setError(failure instanceof ApiError ? failure.message : t('loadError'));
          }
        });
    }
    return () => controller.abort();
  }, [allowed, warehouseId, warehouseCode, user, revision, t]);
  if (!allowed) return null;
  if (error) {
    return (
      <Alert variant="error">
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
          {t('retry')}
        </Button>
      </Alert>
    );
  }
  if (!visible) return <p role="status">{t('loading')}</p>;
  return (
    <WarehouseLayoutPanel
      key={`${warehouseId}:${user?.userId}`}
      warehouse={visible}
      zoneType="STORAGE"
      onEditingChange={onEditingChange}
      onSaved={onSaved}
    />
  );
}
