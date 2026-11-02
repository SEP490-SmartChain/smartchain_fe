import { useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Select } from '@/components/Common';

import { InventoryNotificationSettingsCard } from './InventoryNotificationSettingsCard';
import { inventoryNotificationSettingsApi } from '../api/inventoryNotificationSettingsApi';
export function OpsNotificationSettings({ warehouseId }: { warehouseId: string }) {
  const t = useTranslations('InventoryWorkflows');
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]),
    [seller, setSeller] = useState(''),
    [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void inventoryNotificationSettingsApi
      .sellers(warehouseId, abort.signal)
      .then((rows) => {
        if (!abort.signal.aborted) setSellers(rows);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [warehouseId]);
  const scope = useMemo(() => ({ tenantId: seller, warehouseId }), [seller, warehouseId]);
  return (
    <section className="space-y-3">
      <Select
        label={t('notificationSeller')}
        value={seller}
        options={[
          { value: '', label: t('selectSeller') },
          ...sellers.map((s) => ({ value: s.id, label: s.name })),
        ]}
        onChange={(e) => setSeller(e.target.value)}
      />
      {error && <Alert variant="error" title={t('loadError')} />}{' '}
      {seller && <InventoryNotificationSettingsCard key={seller} scope={scope} />}
    </section>
  );
}
