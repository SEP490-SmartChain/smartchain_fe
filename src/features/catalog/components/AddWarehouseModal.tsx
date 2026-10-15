import { Suspense, lazy, useEffect, useState } from 'react';

import { useForm, useWatch } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Building, Phone, User, Mail, Hash, Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { RequiredIndicator } from '@/components/Common/RequiredIndicator/RequiredIndicator';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { WarehouseAddressFields } from './WarehouseAddressFields';
import { WarehouseHoursFields } from './WarehouseHoursFields';
import { warehouseApi } from '../api/warehouseApi';
import {
  getCreateWarehouseSchema,
  toWarehouseChanges,
  type CreateWarehouseFormValues,
} from '../schemas/warehouseSchema';
import { isValidCoordinate } from '../utils/locationCoordinates';

import type { Warehouse } from '../types/warehouse';

// The HERE map code is only needed when an admin opens the map, so keep it out of the main bundle.
const WarehouseHerePicker = lazy(() => import('./WarehouseHerePicker'));

// The map picker is available only when a HERE browser key is configured (VITE_HERE_API_KEY).
const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY?.trim() ?? '';

interface Props {
  isOpen: boolean;
  warehouse?: Warehouse | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddWarehouseModal({ isOpen, onClose, onSuccess, warehouse = null }: Props) {
  const t = useTranslations('Warehouses');
  const { can } = useAccess();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [addressPreview, setAddressPreview] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateWarehouseFormValues>({
    resolver: zodResolver(getCreateWarehouseSchema(t)),
    defaultValues: {
      region: 'SOUTH',
      timeZone: 'Asia/Ho_Chi_Minh',
      cutoffMinute: 840,
      operatingStartMinute: 480,
      operatingEndMinute: 1080,
      dailyCapacity: 100,
    },
  });
  const [
    provinceCode,
    wardCode,
    detail,
    startMinute,
    endMinute,
    cutoffMinute,
    latitude,
    longitude,
  ] = useWatch({
    control,
    name: [
      'provinceCode',
      'wardCode',
      'address',
      'operatingStartMinute',
      'operatingEndMinute',
      'cutoffMinute',
      'latitude',
      'longitude',
    ],
  });

  useEffect(() => {
    if (isOpen) {
      setShowMap(false);
      reset(
        warehouse
          ? {
              region: warehouse.region,
              timeZone: 'Asia/Ho_Chi_Minh',
              cutoffMinute: warehouse.cutoffMinute,
              operatingStartMinute: warehouse.operatingStartMinute,
              operatingEndMinute: warehouse.operatingEndMinute,
              code: warehouse.code,
              name: warehouse.name,
              address: warehouse.address,
              provinceCode: warehouse.provinceCode,
              districtCode: warehouse.districtCode ?? '',
              wardCode: warehouse.wardCode,
              latitude: warehouse.latitude,
              longitude: warehouse.longitude,
              dailyCapacity: warehouse.dailyCapacity,
              contactName: warehouse.contactName ?? '',
              contactPhone: warehouse.contactPhone ?? '',
              contactEmail: warehouse.contactEmail ?? '',
            }
          : {
              code: '',
              name: '',
              address: '',
              provinceCode: '',
              districtCode: '',
              wardCode: '',
              region: 'SOUTH',
              timeZone: 'Asia/Ho_Chi_Minh',
              cutoffMinute: 840,
              operatingStartMinute: 480,
              operatingEndMinute: 1080,
              dailyCapacity: 100,
            },
      );
    }
  }, [isOpen, warehouse, reset]);

  const onSubmit = async (values: CreateWarehouseFormValues) => {
    if (!can(warehouse ? 'warehouses.update' : 'warehouses.manage')) return;
    const principal = useAuthStore.getState().user;
    setIsSubmitting(true);
    try {
      if (warehouse) {
        await warehouseApi.update(warehouse.id, {
          ...toWarehouseChanges(values, warehouse),
          expectedVersion: warehouse.version,
        });
      } else {
        const { districtCode: _legacyDistrict, ...fields } = values;
        void _legacyDistrict;
        await warehouseApi.create({
          ...fields,
          contactName: values.contactName || null,
          contactPhone: values.contactPhone || null,
          contactEmail: values.contactEmail || null,
        });
      }
      if (principal !== useAuthStore.getState().user) return;
      toast.success(t(warehouse ? 'updateSuccess' : 'createSuccess'));
      reset();
      onSuccess();
    } catch (err: unknown) {
      if (principal !== useAuthStore.getState().user) return;
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || t('createError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!can(warehouse ? 'warehouses.update' : 'warehouses.manage')) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t(warehouse ? 'editTitle' : 'createTitle')}
      width="760px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="warehouse-code"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('code')} <RequiredIndicator isRequired />
            </label>
            <div className="relative">
              <Hash
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                aria-required
                id="warehouse-code"
                {...register('code')}
                readOnly={warehouse !== null}
                placeholder={t('codePlaceholder')}
                className="pl-9"
                error={errors.code?.message}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="warehouse-name"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('name')} <RequiredIndicator isRequired />
            </label>
            <div className="relative">
              <Building
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                aria-required
                id="warehouse-name"
                {...register('name')}
                placeholder={t('name')}
                className="pl-9"
                error={errors.name?.message}
              />
            </div>
          </div>
        </div>

        <WarehouseAddressFields
          register={register}
          setValue={setValue}
          errors={errors}
          provinceCode={provinceCode ?? ''}
          wardCode={wardCode ?? ''}
          detail={detail ?? ''}
          onPreview={setAddressPreview}
        />

        <div>
          <label
            htmlFor="warehouse-address"
            className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
          >
            {t('addressDetail')} <RequiredIndicator isRequired />
          </label>
          <div className="relative">
            <MapPin
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
            />
            <Input
              aria-required
              id="warehouse-address"
              {...register('address')}
              placeholder={t('addressDetailPlaceholder')}
              className="pl-9"
              error={errors.address?.message}
            />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-[var(--sc-text-primary)]">{t('locationTitle')}</p>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('locationHelp')}</p>
        </div>
        {HERE_API_KEY && (
          <>
            <div>
              <Button type="button" variant="outline" onClick={() => setShowMap((open) => !open)}>
                {t(showMap ? 'hideMap' : 'showMap')}
              </Button>
            </div>
            {showMap && (
              <Suspense fallback={<p className="text-sm">{t('loading')}</p>}>
                <WarehouseHerePicker
                  apiKey={HERE_API_KEY}
                  latitude={isValidCoordinate(latitude, longitude) ? latitude : undefined}
                  longitude={isValidCoordinate(latitude, longitude) ? longitude : undefined}
                  searchText={addressPreview}
                  onChange={(nextLatitude, nextLongitude) => {
                    setValue('latitude', nextLatitude, { shouldValidate: true });
                    setValue('longitude', nextLongitude, { shouldValidate: true });
                  }}
                />
              </Suspense>
            )}
          </>
        )}
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label
              htmlFor="warehouse-latitude"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('latitude')} <RequiredIndicator isRequired />
            </label>
            <Input
              aria-required
              type="number"
              step="any"
              id="warehouse-latitude"
              {...register('latitude', { valueAsNumber: true })}
              error={errors.latitude?.message}
            />
          </div>
          <div>
            <label
              htmlFor="warehouse-longitude"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('longitude')} <RequiredIndicator isRequired />
            </label>
            <Input
              aria-required
              type="number"
              step="any"
              id="warehouse-longitude"
              {...register('longitude', { valueAsNumber: true })}
              error={errors.longitude?.message}
            />
          </div>
          <div>
            <label
              htmlFor="warehouse-dailyCapacity"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('dailyCapacity')} <RequiredIndicator isRequired />
            </label>
            <div className="relative">
              <Activity
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                aria-required
                type="number"
                id="warehouse-dailyCapacity"
                {...register('dailyCapacity', { valueAsNumber: true })}
                className="pl-9"
                error={errors.dailyCapacity?.message}
              />
            </div>
            <p className="mt-1.5 text-sm text-[var(--sc-text-secondary)]">
              {t('dailyCapacityHelp')}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {warehouse ? (
              <label>
                {t('region')}
                <p>{t(`regions.${warehouse.region}`)}</p>
                <p className="text-sm text-[var(--sc-text-secondary)]">{t('regionHelp')}</p>
                <input type="hidden" {...register('region')} />
              </label>
            ) : (
              <Select
                aria-required
                {...register('region')}
                label={t('region')}
                options={(['NORTH', 'CENTRAL', 'SOUTH'] as const).map((value) => ({
                  value,
                  label: t(`regions.${value}`),
                }))}
                error={errors.region?.message}
                helperText={t('regionHelp')}
              />
            )}
          </div>
          <Input label={t('timeZone')} value="Asia/Ho_Chi_Minh" readOnly />
        </div>
        <WarehouseHoursFields
          control={control}
          errors={errors}
          start={startMinute ?? 480}
          end={endMinute ?? 1080}
          cutoff={cutoffMinute ?? 840}
        />
        <hr className="my-2 border-[var(--sc-border-default)]" />

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label
              htmlFor="warehouse-contactName"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('contactName')}
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                id="warehouse-contactName"
                {...register('contactName')}
                placeholder={t('contactName')}
                className="pl-9"
                error={errors.contactName?.message}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="warehouse-contactPhone"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('contactPhone')}
            </label>
            <div className="relative">
              <Phone
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                id="warehouse-contactPhone"
                {...register('contactPhone')}
                placeholder={t('contactPhone')}
                className="pl-9"
                error={errors.contactPhone?.message}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="warehouse-contactEmail"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('contactEmail')}
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                id="warehouse-contactEmail"
                {...register('contactEmail')}
                placeholder={t('contactEmail')}
                className="pl-9"
                error={errors.contactEmail?.message}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-5">
          <Button type="button" variant="secondary" onClick={handleClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {t(warehouse ? 'editAction' : 'createAction')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
