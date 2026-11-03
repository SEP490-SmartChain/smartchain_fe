import { useEffect, useRef } from 'react';

import { RefreshCw, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge, Button, Card, CardContent } from '@/components/Common';
import { WarehouseStorageSetup } from '@/features/catalog';
import { useAccess } from '@/hooks/useAccess';

import type { PutawayWaitingItem } from '../api/putawayApi';
import type { ReceivingWarehouse } from '../api/receivingApi';

export function PutawayPreparationPanel({
  warehouse,
  item,
  locked,
  loading,
  onEditingChange,
  onRefresh,
  onClose,
}: {
  warehouse: ReceivingWarehouse;
  item: PutawayWaitingItem;
  locked: boolean;
  loading: boolean;
  onEditingChange: (editing: boolean) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('Putaway'),
    locale = useLocale(),
    { can } = useAccess(),
    title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, [warehouse.id, item.receivingRecordId]);
  if (!can('warehouses.layout.manage') || !can('warehouse.putaway.assign')) return null;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 ref={title} tabIndex={-1} className="text-lg font-semibold">
              {t('prepare')} · {warehouse.code}
            </h2>
            <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">
              {item.productName} · {format.format(item.quantity)} ·{' '}
              {format.format(Number(item.weightG) / 1000)} kg ·{' '}
              {format.format(Number(item.volumeM3))} m³
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge status="success" label={t('qcApproved')} />
            <Button size="sm" variant="ghost" disabled={locked} onClick={onClose}>
              <X size={16} aria-hidden="true" />
              {t('closePreparation')}
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{t('prepareStorage')}</h3>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('prepareStorageHint')}</p>
          <WarehouseStorageSetup
            warehouseId={warehouse.id}
            warehouseCode={warehouse.code}
            onEditingChange={onEditingChange}
            onSaved={onRefresh}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--sc-bg-secondary)] p-4">
          <div>
            <h3 className="text-base font-semibold">{t('prepareAssignment')}</h3>
            <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">
              {t('prepareAssignmentHint')}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={locked || loading}
            isLoading={loading}
            onClick={onRefresh}
          >
            {!loading && <RefreshCw size={16} aria-hidden="true" />}
            {t('checkTasks')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
