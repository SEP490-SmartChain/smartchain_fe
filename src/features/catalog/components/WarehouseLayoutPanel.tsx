import { useCallback, useEffect, useRef, useState } from 'react';

import { Boxes, MapPin, Plus, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { BinLabels } from './BinLabels';
import styles from './WarehouseDetails.module.css';
import { ZoneForm, BinForm } from './WarehouseLayoutForms';
import { warehouseLayoutApi, type Bin, type Zone } from '../api/warehouseLayoutApi';

import type { BinFormValues, ZoneFormValues } from '../schemas/warehouseLayoutSchema';
import type { Warehouse } from '../types/warehouse';

function formatCapacity(value: string, locale: string, decimalSeparator: string): string {
  const [integerPart, fractionPart] = value.split('.');
  if (!/^\d+$/.test(integerPart) || (fractionPart !== undefined && !/^\d+$/.test(fractionPart))) {
    return value;
  }
  const integer = BigInt(integerPart).toLocaleString(locale);
  const fraction = fractionPart?.replace(/0+$/, '');
  return fraction ? `${integer}${decimalSeparator}${fraction}` : integer;
}

export function WarehouseLayoutPanel({
  warehouse,
  zoneType,
  onEditingChange,
  onSaved,
}: {
  readonly warehouse: Warehouse;
  readonly zoneType?: Zone['zoneType'];
  readonly onEditingChange?: (editing: boolean) => void;
  readonly onSaved?: () => void;
}) {
  const t = useTranslations('WarehouseLayout');
  const locale = useLocale();
  const decimalSeparator =
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.';
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
  useEffect(() => {
    onEditingChange?.(zoneForm !== null || binForm !== null);
    return () => onEditingChange?.(false);
  }, [zoneForm, binForm, onEditingChange]);
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
        const items = page.items.filter((zone) => !zoneType || zone.zoneType === zoneType);
        setZones((current) => (cursor ? [...current, ...items] : items));
        setZoneCursor(page.pagination.nextCursor);
        if (!cursor) {
          setZoneId((current) =>
            items.some((zone) => zone.id === current) ? current : (items[0]?.id ?? ''),
          );
        } else setZoneId((current) => current || items[0]?.id || '');
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
    [warehouse.id, zoneType, t],
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
      onSaved?.();
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
      onSaved?.();
    } catch (failure) {
      if (token === revision.current) {
        toast.error(failure instanceof ApiError ? failure.message : t('saveError'));
      }
    }
  };
  return (
    <section className={styles.panel} aria-label={t('title')}>
      {!zoneType && (
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>
              <Boxes size={20} className={styles.icon} aria-hidden="true" />
              {t('title')}
            </h2>
            <p className={`${styles.copy} mt-2`}>{t('layoutHelp')}</p>
          </div>
          {canManage && warehouse.status === 'ACTIVE' && (
            <Button variant="outline" onClick={() => setZoneForm({ zone: null })}>
              <Plus size={16} aria-hidden="true" />
              {t('createZone')}
            </Button>
          )}
        </div>
      )}
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
      <div className={styles.toolbar}>
        {zoneType && canManage && warehouse.status === 'ACTIVE' && (
          <Button variant="outline" onClick={() => setZoneForm({ zone: null })}>
            <Plus size={16} aria-hidden="true" />
            {t('createZone')}
          </Button>
        )}
        <div className={styles.zonePicker}>
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
        </div>
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
          <Button onClick={() => setBinForm({ bin: null })}>
            <Plus size={16} aria-hidden="true" />
            {t('createBin')}
          </Button>
        )}
      </div>
      {selectedZone && (
        <div className={styles.binHeader}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={styles.subtitle}>{t('bins')}</h3>
            <Badge status="default" label={t('loadedBins', { count: bins.length })} />
          </div>
          <div className="w-full sm:max-w-xs">
            <Input
              value={search}
              aria-label={t('binFilter')}
              placeholder={t('binFilter')}
              maxLength={100}
              leftIcon={<Search size={16} aria-hidden="true" />}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      )}
      {!zones.length && !zoneCursor && !loading && !error && (
        <div className={styles.empty}>
          <Boxes size={28} aria-hidden="true" />
          <p>{t('noZones')}</p>
          <p>{t('noZonesHelp')}</p>
        </div>
      )}
      {loading && <p role="status">{t('loading')}</p>}
      {!!bins.length && (
        <div className={styles.tableFrame}>
          <table className={styles.table} aria-label={t('bins')}>
            <colgroup>
              <col className={canManage ? styles.manageCodeColumn : styles.codeColumn} />
              <col className={canManage ? styles.manageBarcodeColumn : styles.barcodeColumn} />
              <col className={canManage ? styles.manageWeightColumn : styles.weightColumn} />
              <col className={canManage ? styles.manageVolumeColumn : styles.volumeColumn} />
              <col className={canManage ? styles.manageStatusColumn : styles.statusColumn} />
              {canManage && <col className={styles.actionColumn} />}
            </colgroup>
            <thead>
              <tr>
                {[
                  'code',
                  'barcode',
                  'maxWeightG',
                  'maxVolumeM3',
                  'status',
                  ...(canManage ? ['actions'] : []),
                ].map((key) => (
                  <th
                    className={
                      key === 'maxWeightG' || key === 'maxVolumeM3' ? styles.numeric : undefined
                    }
                    key={key}
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bins.map((bin) => (
                <tr key={bin.id} className="border-t border-[var(--sc-border-default)]">
                  <td className={styles.binCode}>{bin.code}</td>
                  <td>
                    <span className={styles.barcodeValue} title={bin.barcode}>
                      {bin.barcode}
                    </span>
                  </td>
                  <td className={styles.numeric}>
                    {formatCapacity(bin.maxWeightG, locale, decimalSeparator)}
                  </td>
                  <td className={styles.numeric}>
                    {formatCapacity(bin.maxVolumeM3, locale, decimalSeparator)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      status={bin.isActive ? 'success' : 'default'}
                      label={t(bin.isActive ? 'active' : 'inactive')}
                    />
                  </td>
                  {canManage && (
                    <td className={styles.rowAction}>
                      <Button
                        variant="ghost"
                        aria-label={t('editCode', { code: bin.code })}
                        onClick={() => setBinForm({ bin })}
                      >
                        {t('edit')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!bins.length && (
        <div className={styles.tableFooter}>
          <BinLabels key={`${warehouse.id}:${zoneId}`} bins={bins} warehouseCode={warehouse.code} />
          {binCursor && (
            <Button variant="outline" disabled={loading} onClick={() => void loadBins(binCursor)}>
              {t('moreBins')}
            </Button>
          )}
        </div>
      )}
      {!!zoneId && !bins.length && !loading && !error && (
        <div className={styles.empty}>
          <MapPin size={28} aria-hidden="true" />
          <p className="font-medium text-[var(--sc-text-primary)]">
            {search.trim() ? t('noMatchingBins') : t('noBins')}
          </p>
          <p>{search.trim() ? t('changeBinSearch') : t('noBinsHelp')}</p>
        </div>
      )}
      {!bins.length && binCursor && (
        <Button variant="outline" disabled={loading} onClick={() => void loadBins(binCursor)}>
          {t('moreBins')}
        </Button>
      )}
      {canManage && zoneForm && (
        <ZoneForm
          key={zoneForm.zone?.id ?? 'new-zone'}
          zone={zoneForm.zone}
          fixedType={zoneType}
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
