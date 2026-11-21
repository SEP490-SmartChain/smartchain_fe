import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';

import { notifyInvalidForm } from '@/lib/errorNotifications';

import { adminDivisionApi, type AdminDivision } from '../api/adminDivisionApi';
import { formatWeight, zoneKey } from '../utils/rateDisplay';

import type { RateScenario } from '../api/rateIntelligenceApi';

export type RateTrackedRoute = RateScenario;

export interface RateRouteInput {
  serviceId: string;
  name: string;
  originZone: string;
  destZone: string;
  originDivisionCode: string;
  destinationDivisionCode: string;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

interface RateWatchedRoutesProps {
  routes: RateTrackedRoute[];
  serviceOptions: { id: string; label: string }[];
  provinces: AdminDivision[];
  isSaving: boolean;
  onToggle: (route: RateTrackedRoute) => void;
  onCreate: (input: RateRouteInput) => Promise<boolean>;
}

const PAGE_SIZE = 20;
const EMPTY_FORM = {
  serviceId: '',
  fromProvince: '',
  fromWard: '',
  toProvince: '',
  toWard: '',
  weightG: '500',
  lengthCm: '10',
  widthCm: '10',
  heightCm: '10',
};

export function RateWatchedRoutes({
  routes,
  serviceOptions,
  provinces,
  isSaving,
  onToggle,
  onCreate,
}: RateWatchedRoutesProps) {
  const t = useTranslations('RateIntelligence');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fromWards, setFromWards] = useState<AdminDivision[]>([]);
  const [toWards, setToWards] = useState<AdminDivision[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    if (form.fromProvince) {
      void adminDivisionApi
        .wards(form.fromProvince, controller.signal)
        .then(setFromWards)
        .catch(() => setFromWards([]));
    } else setFromWards([]);
    return () => controller.abort();
  }, [form.fromProvince]);

  useEffect(() => {
    const controller = new AbortController();
    if (form.toProvince) {
      void adminDivisionApi
        .wards(form.toProvince, controller.signal)
        .then(setToWards)
        .catch(() => setToWards([]));
    } else setToWards([]);
    return () => controller.abort();
  }, [form.toProvince]);

  const provinceName = useMemo(
    () => new Map(provinces.map((row) => [row.code, row.name])),
    [provinces],
  );
  const carriers = useMemo(
    () =>
      [...new Set(routes.map((route) => route.carrier.name))].sort((a, b) => a.localeCompare(b)),
    [routes],
  );
  const warehouses = useMemo(
    () =>
      [
        ...new Set(
          routes.flatMap((route) => (route.originWarehouseName ? [route.originWarehouseName] : [])),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [routes],
  );
  const filtered = useMemo(
    () =>
      routes.filter(
        (route) =>
          (!carrierFilter || route.carrier.name === carrierFilter) &&
          (!warehouseFilter || route.originWarehouseName === warehouseFilter),
      ),
    [routes, carrierFilter, warehouseFilter],
  );

  const zoneLabel = (code: string) => {
    const key = zoneKey(code);
    return key ? t(`zone${key}`) : (provinceName.get(code) ?? code);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.serviceId || !form.fromWard || !form.toWard) {
      notifyInvalidForm();
      return;
    }

    const fromName = fromWards.find((row) => row.code === form.fromWard)?.name ?? form.fromWard;
    const toName = toWards.find((row) => row.code === form.toWard)?.name ?? form.toWard;
    const saved = await onCreate({
      serviceId: form.serviceId,
      name: `${fromName} → ${toName} · ${form.weightG}g`.slice(0, 120),
      originZone: form.fromProvince,
      destZone: form.toProvince,
      originDivisionCode: form.fromWard,
      destinationDivisionCode: form.toWard,
      weightG: Number(form.weightG),
      lengthCm: Number(form.lengthCm),
      widthCm: Number(form.widthCm),
      heightCm: Number(form.heightCm),
    });
    if (saved) {
      setForm((current) => ({ ...EMPTY_FORM, serviceId: current.serviceId }));
      setIsFormOpen(false);
    }
  };

  const provinceOptions = provinces.map((row) => ({ value: row.code, label: row.name }));
  const wardOptions = (rows: AdminDivision[]) =>
    rows.map((row) => ({ value: row.code, label: row.name }));
  const numberField = (
    field: 'weightG' | 'lengthCm' | 'widthCm' | 'heightCm',
    label: string,
    max: number,
  ) => (
    <Input
      label={label}
      required
      type="number"
      min={1}
      max={max}
      value={form[field]}
      onChange={(event) => setForm({ ...form, [field]: event.target.value })}
    />
  );

  return (
    <div className="space-y-5">
      <Card padding="none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sc-border-default)] p-5">
          <CardHeader
            className="mb-0"
            title={t('routesTitle')}
            description={t('routesDescription')}
          />
          <div className="flex flex-wrap items-end gap-3">
            {warehouses.length > 1 ? (
              <div className="min-w-48">
                <Select
                  label={t('filterWarehouse')}
                  value={warehouseFilter}
                  placeholder={t('allWarehouses')}
                  isPlaceholderDisabled={false}
                  options={warehouses.map((name) => ({ value: name, label: name }))}
                  onChange={(event) => {
                    setWarehouseFilter(event.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                />
              </div>
            ) : null}
            {carriers.length > 1 ? (
              <div className="min-w-48">
                <Select
                  label={t('filterCarrier')}
                  value={carrierFilter}
                  placeholder={t('allCarriers')}
                  isPlaceholderDisabled={false}
                  options={carriers.map((name) => ({ value: name, label: name }))}
                  onChange={(event) => {
                    setCarrierFilter(event.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                />
              </div>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setIsFormOpen((open) => !open)}>
              {isFormOpen ? t('routeAddClose') : t('routeAddOpen')}
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('routesEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label={t('routesTitle')}
              className="min-w-full divide-y divide-[var(--sc-border-default)] text-left text-sm"
            >
              <thead className="bg-[var(--sc-bg-secondary)] text-xs text-[var(--sc-text-secondary)]">
                <tr>
                  {[
                    'routeCarrier',
                    'routeRoute',
                    'routeWeight',
                    'routeOrders',
                    'routeOrigin',
                    'routeState',
                    '',
                  ].map((key) => (
                    <th
                      key={key || 'action'}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 font-medium"
                    >
                      {key ? t(key) : <span className="sr-only">{t('routeState')}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {filtered.slice(0, visible).map((route) => (
                  <tr key={route.id}>
                    <td className="px-4 py-3">
                      {route.carrier.name} · {route.service.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {route.originWarehouseName && route.destinationProvinceName ? (
                        <>
                          <span className="block text-[var(--sc-text-primary)]">
                            {route.originWarehouseName} → {route.destinationProvinceName}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <Badge status="info" size="sm" label={zoneLabel(route.destZone)} />
                            <Badge
                              status="default"
                              size="sm"
                              label={t(
                                route.receiverArea === 'COMMUNE' ? 'routeCommune' : 'routeWard',
                              )}
                            />
                          </span>
                        </>
                      ) : (
                        <>
                          {zoneLabel(route.originZone)} → {zoneLabel(route.destZone)}
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatWeight(route.weightG)}
                      {route.isCod ? ` · ${t('routeCod')}` : ''}
                    </td>
                    <td className="px-4 py-3">{route.sampleOrderCount}</td>
                    <td className="px-4 py-3">
                      {route.sourceKind === 'AUTO' ? t('routeAuto') : t('routeManual')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge
                        status={route.isActive ? 'success' : 'default'}
                        label={route.isActive ? t('routeActive') : t('routePaused')}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSaving}
                        onClick={() => onToggle(route)}
                      >
                        {route.isActive ? t('routePause') : t('routeResume')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > visible ? (
          <div className="border-t border-[var(--sc-border-default)] p-4 text-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              {t('routeShowMore', { count: Math.min(PAGE_SIZE, filtered.length - visible) })}
            </Button>
          </div>
        ) : null}
      </Card>

      {isFormOpen ? (
        <Card>
          <CardHeader title={t('routeAddTitle')} description={t('routeAddDescription')} />
          {serviceOptions.length === 0 ? (
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('routeNeedCarrier')}</p>
          ) : (
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <Select
                label={t('routeService')}
                value={form.serviceId}
                placeholder={t('routeChoose')}
                isRequired
                options={serviceOptions.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
                onChange={(event) => setForm({ ...form, serviceId: event.target.value })}
              />
              <Select
                label={t('routeFromProvince')}
                value={form.fromProvince}
                placeholder={t('routeChoose')}
                isRequired
                options={provinceOptions}
                onChange={(event) =>
                  setForm({ ...form, fromProvince: event.target.value, fromWard: '' })
                }
              />
              <Select
                label={t('routeFromWard')}
                value={form.fromWard}
                placeholder={t('routeChoose')}
                isRequired
                options={wardOptions(fromWards)}
                onChange={(event) => setForm({ ...form, fromWard: event.target.value })}
              />
              <span aria-hidden="true" className="hidden xl:block" />
              <Select
                label={t('routeToProvince')}
                value={form.toProvince}
                placeholder={t('routeChoose')}
                isRequired
                options={provinceOptions}
                onChange={(event) =>
                  setForm({ ...form, toProvince: event.target.value, toWard: '' })
                }
              />
              <Select
                label={t('routeToWard')}
                value={form.toWard}
                placeholder={t('routeChoose')}
                isRequired
                options={wardOptions(toWards)}
                onChange={(event) => setForm({ ...form, toWard: event.target.value })}
              />
              <span aria-hidden="true" className="hidden xl:block" />
              <span aria-hidden="true" className="hidden xl:block" />
              {numberField('weightG', t('routeWeightG'), 2_000_000)}
              {numberField('lengthCm', t('routeLength'), 500)}
              {numberField('widthCm', t('routeWidth'), 500)}
              {numberField('heightCm', t('routeHeight'), 500)}
              <div className="flex items-end">
                <Button
                  type="submit"
                  isLoading={isSaving}
                  disabled={!form.serviceId || !form.fromWard || !form.toWard}
                >
                  {t('routeSave')}
                </Button>
              </div>
            </form>
          )}
        </Card>
      ) : null}
    </div>
  );
}
