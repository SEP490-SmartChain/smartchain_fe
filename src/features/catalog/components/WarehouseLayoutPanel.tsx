import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Input } from '@/components/Common/Input/Input';
import { Button } from '@/components/Common/Button/Button';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { BinLabels } from './BinLabels';
import { ZoneForm, BinForm } from './WarehouseLayoutForms';
import { warehouseLayoutApi, type Bin, type Zone } from '../api/warehouseLayoutApi';

import type { BinFormValues, ZoneFormValues } from '../schemas/warehouseLayoutSchema';
import type { Warehouse } from '../types/warehouse';

export function WarehouseLayoutPanel({ warehouse }: { readonly warehouse: Warehouse }) {
  const t = useTranslations('WarehouseLayout');
  const { can } = useAccess();
  const principal = useAuthStore((state) => state.user);
  const canManage = can('warehouses.layout.manage');
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [search, setSearch] = useState('');
  const [binSearch, setBinSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setBinSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [zoneCursor, setZoneCursor] = useState<string | null>(null);
  const [bins, setBins] = useState<Bin[]>([]);
  const [binCursor, setBinCursor] = useState<string | null>(null);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [binsLoading, setBinsLoading] = useState(false);
  const loading = zonesLoading || binsLoading;
  const [error, setError] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState<{ zone: Zone | null } | null>(null);
  const [binForm, setBinForm] = useState<{ bin: Bin | null } | null>(null);
  const revision = useRef(0);
  const binRevision = useRef(0);
  const zoneRevision = useRef(0);
  const invalidateScope = useCallback(() => {
    revision.current++;
    binRevision.current++;
    zoneRevision.current++;
  }, []);
  const invalidateBins = useCallback(() => {
    binRevision.current++;
  }, []);
  const selectedZone = zones.find((zone) => zone.id === zoneId);
  const loadZones = useCallback(
    async (cursor?: string) => {
      const token = ++zoneRevision.current;
      const scopeToken = revision.current;
      setError(null);
      setZonesLoading(true);
      try {
        const page = await warehouseLayoutApi.zones(warehouse.id, cursor);
        if (token !== zoneRevision.current || scopeToken !== revision.current) return;
        setZones((current) => (cursor ? [...current, ...page.items] : page.items));
        setZoneCursor(page.pagination.nextCursor);
        if (!cursor) {
          setZoneId((current) =>
            page.items.some((zone) => zone.id === current) ? current : (page.items[0]?.id ?? ''),
          );
        }
      } catch (failure) {
        if (token === zoneRevision.current && scopeToken === revision.current) {
          setError(failure instanceof ApiError ? failure.message : t('loadError'));
        }
      } finally {
        if (token === zoneRevision.current && scopeToken === revision.current) {
          setZonesLoading(false);
        }
      }
    },
    [warehouse.id, t],
  );
  const loadBins = useCallback(
    async (cursor?: string) => {
      const token = ++binRevision.current;
      setError(null);
      setBinsLoading(true);
      if (!zoneId) {
        setBins([]);
        setBinCursor(null);
        setBinsLoading(false);
        return;
      }
      try {
        const page = await warehouseLayoutApi.bins(warehouse.id, zoneId, cursor, binSearch);
        if (token !== binRevision.current) return;
        setBins((current) => (cursor ? [...current, ...page.items] : page.items));
        setBinCursor(page.pagination.nextCursor);
      } catch (failure) {
        if (token === binRevision.current) {
          setError(failure instanceof ApiError ? failure.message : t('loadError'));
        }
      } finally {
        if (token === binRevision.current) setBinsLoading(false);
      }
    },
    [warehouse.id, zoneId, t, binSearch],
  );
  useEffect(() => {
    invalidateScope();
    setZones([]);
    setBins([]);
    setZoneId('');
    setSearch('');
    setBinSearch('');
    setZoneForm(null);
    setBinForm(null);
    void loadZones();
    return invalidateScope;
  }, [principal, loadZones, invalidateScope]);
  useEffect(() => {
    setBins([]);
    setBinCursor(null);
    void loadBins();
    return invalidateBins;
  }, [loadBins, principal, invalidateBins]);
  const saveZone = async (values: ZoneFormValues) => {
    if (!canManage || !zoneForm) return;
    const token = revision.current;
    try {
      if (zoneForm.zone) {
        await warehouseLayoutApi.updateZone(warehouse.id, zoneForm.zone, {
          zoneType: values.zoneType,
          isActive: values.isActive,
        });
      } else await warehouseLayoutApi.createZone(warehouse.id, values);
      if (token !== revision.current) return;
      setZoneForm(null);
      await loadZones();
      toast.success(t('saved'));
    } catch (failure) {
      if (token === revision.current) {
        toast.error(failure instanceof ApiError ? failure.message : t('saveError'));
      }
    }
  };
  const saveBin = async (values: BinFormValues) => {
    if (!canManage || !binForm || !selectedZone) return;
    const token = revision.current;
    try {
      const capacity = { maxWeightG: values.maxWeightG, maxVolumeM3: values.maxVolumeM3 };
      if (binForm.bin) {
        await warehouseLayoutApi.updateBin(warehouse.id, binForm.bin, {
          ...capacity,
          isActive: values.isActive,
        });
      } else if (values.mode === 'bulk') {
        await warehouseLayoutApi.bulkBins(warehouse.id, {
          ...capacity,
          zoneId,
          aisleStart: values.aisleStart,
          aisleCount: values.aisleCount,
          rackStart: values.rackStart,
          rackCount: values.rackCount,
          levelStart: values.levelStart,
          levelCount: values.levelCount,
        });
      } else {
        await warehouseLayoutApi.createBin(warehouse.id, {
          ...capacity,
          zoneId,
          code: values.code,
        });
      }
      if (token !== revision.current) return;
      setBinForm(null);
      await loadBins();
      toast.success(t('saved'));
    } catch (failure) {
      if (token === revision.current) {
        toast.error(failure instanceof ApiError ? failure.message : t('saveError'));
      }
    }
  };
  return (
    <section className="mt-5 space-y-4 text-[var(--sc-text-primary)]" aria-label={t('title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t('title')}</h2>
        {canManage && warehouse.status === 'ACTIVE' && (
          <Button variant="outline" onClick={() => setZoneForm({ zone: null })}>
            {t('createZone')}
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="error" title={error}>
          <Button
            variant="outline"
            onClick={() => {
              void loadZones();
              void loadBins();
            }}
          >
            {t('retry')}
          </Button>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t('zone')}
          value={zoneId}
          disabled={loading || !zones.length}
          onChange={(event) => {
            setBinForm(null);
            setZoneId(event.target.value);
          }}
          options={zones.map((zone) => ({
            value: zone.id,
            label: `${zone.code} · ${t(`types.${zone.zoneType}`)} · ${t(zone.isActive ? 'active' : 'inactive')}`,
          }))}
        />
        {zoneCursor && (
          <Button variant="outline" disabled={loading} onClick={() => void loadZones(zoneCursor)}>
            {t('moreZones')}
          </Button>
        )}
        {canManage && selectedZone && (
          <Button variant="outline" onClick={() => setZoneForm({ zone: selectedZone })}>
            {t('editZone')}
          </Button>
        )}
        {canManage && selectedZone?.isActive && warehouse.status === 'ACTIVE' && (
          <Button onClick={() => setBinForm({ bin: null })}>{t('createBin')}</Button>
        )}
      </div>
      <Input
        value={search}
        aria-label={t('binFilter')}
        placeholder={t('binFilter')}
        maxLength={100}
        onChange={(event) => setSearch(event.target.value)}
      />
      {!zones.length && !loading && <p>{t('noZones')}</p>}
      {loading && <p role="status">{t('loading')}</p>}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm" aria-label={t('bins')}>
          <thead>
            <tr>
              {['code', 'barcode', 'maxWeightG', 'maxVolumeM3', 'status', 'actions'].map((key) => (
                <th className="px-3 py-2" key={key}>
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr key={bin.id} className="border-t border-[var(--sc-border-default)]">
                <td className="px-3 py-2">{bin.code}</td>
                <td className="px-3 py-2 font-mono">{bin.barcode}</td>
                <td className="px-3 py-2">{bin.maxWeightG}</td>
                <td className="px-3 py-2">{bin.maxVolumeM3}</td>
                <td className="px-3 py-2">{t(bin.isActive ? 'active' : 'inactive')}</td>
                <td className="px-3 py-2">
                  {canManage && (
                    <Button
                      variant="ghost"
                      aria-label={t('editCode', { code: bin.code })}
                      onClick={() => setBinForm({ bin })}
                    >
                      {t('edit')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!bins.length && (
        <BinLabels key={`${warehouse.id}:${zoneId}`} bins={bins} warehouseCode={warehouse.code} />
      )}
      {!!zoneId && !bins.length && !loading && <p>{t('noBins')}</p>}
      {binCursor && (
        <Button variant="outline" disabled={loading} onClick={() => void loadBins(binCursor)}>
          {t('moreBins')}
        </Button>
      )}
      {canManage && zoneForm && (
        <ZoneForm
          key={zoneForm.zone?.id ?? 'new-zone'}
          zone={zoneForm.zone}
          onClose={() => setZoneForm(null)}
          onSave={saveZone}
        />
      )}
      {canManage && binForm && selectedZone && (
        <BinForm
          key={binForm.bin?.id ?? 'new-bin'}
          bin={binForm.bin}
          storage={selectedZone.zoneType === 'STORAGE'}
          onClose={() => setBinForm(null)}
          onSave={saveBin}
        />
      )}
    </section>
  );
}
