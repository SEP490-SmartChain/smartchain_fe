import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';

import { CarrierEditor, CarrierServiceEditor } from './CarrierManagementForms';
import { CarrierZonePanel } from './CarrierZonePanel';

import type { CarrierDetail, CarrierService } from '../types/carrierCatalog.types';

interface CarrierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  carrier: CarrierDetail | null;
  onChanged: () => Promise<void>;
}
export function CarrierDetailModal({
  isOpen,
  onClose,
  carrier,
  onChanged,
}: CarrierDetailModalProps) {
  const t = useTranslations('AdminCarriers');
  const { can } = useAccess();
  const [editingCarrier, setEditingCarrier] = useState(false);
  const [editingService, setEditingService] = useState<CarrierService | null | undefined>();
  const [refreshError, setRefreshError] = useState(false);
  if (!carrier || !can('platform.carriers.manage')) return null;
  const saved = async () => {
    setEditingCarrier(false);
    setEditingService(undefined);
    setRefreshError(false);
    try {
      await onChanged();
    } catch {
      setRefreshError(true);
    }
  };
  return (
    <>
      <Modal
        isOpen={isOpen && !editingCarrier && editingService === undefined}
        onClose={onClose}
        title={carrier.name}
        width="820px"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-sm">{carrier.code}</p>
              <Badge
                status={carrier.isActive ? 'success' : 'default'}
                label={t(carrier.isActive ? 'status_active' : 'status_inactive')}
              />
            </div>
            <Button variant="outline" onClick={() => setEditingCarrier(true)}>
              {t('editCarrier')}
            </Button>
          </div>
          {refreshError && <Alert variant="error">{t('reloadAfterSave')}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">{t('shipping_services')}</h3>
            <Button onClick={() => setEditingService(null)}>{t('createService')}</Button>
          </div>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('serviceHint')}</p>
          <DataTable
            ariaLabel={t('shipping_services')}
            data={carrier.services}
            getRowKey={(row) => row.id}
            emptyMessage={t('emptyServices')}
            columns={[
              { key: 'code', label: t('service_code') },
              { key: 'name', label: t('service_name') },
              {
                key: 'transportMode',
                label: t('mode'),
                render: (row) => t(`mode_${row.transportMode}`),
              },
              { key: 'volumetricDivisor', label: t('volumetric') },
              {
                key: 'maxWeightG',
                label: t('maxWeightG'),
                render: (row) => (row.maxWeightG === null ? '—' : row.maxWeightG.toLocaleString()),
              },
              {
                key: 'isActive',
                label: t('status'),
                render: (row) => (
                  <Badge
                    status={row.isActive ? 'success' : 'default'}
                    label={t(row.isActive ? 'status_active' : 'status_inactive')}
                  />
                ),
              },
              {
                key: 'actions',
                label: t('col_actions'),
                render: (row) => (
                  <Button variant="outline" size="sm" onClick={() => setEditingService(row)}>
                    {t('editService')}
                  </Button>
                ),
              },
            ]}
          />
          {isOpen && <CarrierZonePanel key={carrier.id} carrierId={carrier.id} />}
        </div>
      </Modal>
      {editingCarrier && (
        <CarrierEditor
          current={carrier}
          onClose={() => setEditingCarrier(false)}
          onSaved={() => void saved()}
        />
      )}
      {editingService !== undefined && (
        <CarrierServiceEditor
          carrierId={carrier.id}
          current={editingService ?? undefined}
          onClose={() => setEditingService(undefined)}
          onSaved={() => void saved()}
        />
      )}
    </>
  );
}
