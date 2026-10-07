import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Building, Phone, User, Mail, Hash, Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { warehouseApi } from '../api/warehouseApi';
import {
  getCreateWarehouseSchema,
  toWarehouseChanges,
  type CreateWarehouseFormValues,
} from '../schemas/warehouseSchema';

import type { Warehouse } from '../types/warehouse';

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWarehouseFormValues>({
    resolver: zodResolver(getCreateWarehouseSchema(t, warehouse !== null)),
    defaultValues: {
      region: 'SOUTH',
      timeZone: 'Asia/Ho_Chi_Minh',
      cutoffMinute: 840,
      operatingStartMinute: 480,
      operatingEndMinute: 1080,
      dailyCapacity: 100,
      latitude: 10.762622,
      longitude: 106.660172,
    },
  });

  useEffect(() => {
    if (isOpen) {
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
              latitude: 10.762622,
              longitude: 106.660172,
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
          ...toWarehouseChanges(values),
          expectedVersion: warehouse.version,
        });
      } else {
        await warehouseApi.create({
          ...values,
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

  if (!can('warehouses.manage')) return null;

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
              {t('code')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <div className="relative">
              <Hash
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
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
              {t('name')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <div className="relative">
              <Building
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                id="warehouse-name"
                {...register('name')}
                placeholder={t('name')}
                className="pl-9"
                error={errors.name?.message}
              />
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="warehouse-address"
            className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
          >
            {t('address')} <span className="text-[var(--sc-error)]">*</span>
          </label>
          <div className="relative">
            <MapPin
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
            />
            <Input
              id="warehouse-address"
              {...register('address')}
              placeholder={t('address')}
              className="pl-9"
              error={errors.address?.message}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="warehouse-provinceCode"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('provinceCode')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <Input
              id="warehouse-provinceCode"
              {...register('provinceCode')}
              placeholder="79"
              error={errors.provinceCode?.message}
            />
          </div>
          <div>
            <label
              htmlFor="warehouse-districtCode"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('districtCode')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <Input
              id="warehouse-districtCode"
              {...register('districtCode')}
              placeholder="760"
              error={errors.districtCode?.message}
            />
          </div>
          <div>
            <label
              htmlFor="warehouse-wardCode"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('wardCode')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <Input
              id="warehouse-wardCode"
              {...register('wardCode')}
              placeholder="26734"
              error={errors.wardCode?.message}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label
              htmlFor="warehouse-latitude"
              className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]"
            >
              {t('latitude')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <Input
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
              {t('longitude')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <Input
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
              {t('dailyCapacity')} <span className="text-[var(--sc-error)]">*</span>
            </label>
            <div className="relative">
              <Activity
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                type="number"
                id="warehouse-dailyCapacity"
                {...register('dailyCapacity', { valueAsNumber: true })}
                className="pl-9"
                error={errors.dailyCapacity?.message}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            {t('region')}
            {warehouse ? (
              <>
                <p>{t(`regions.${warehouse.region}`)}</p>
                <input type="hidden" {...register('region')} />
              </>
            ) : (
              <select
                {...register('region')}
                className="block w-full rounded border p-2 bg-[var(--sc-bg-primary)]"
              >
                {['NORTH', 'CENTRAL', 'SOUTH'].map((v) => (
                  <option key={v} value={v}>
                    {t(`regions.${v}`)}
                  </option>
                ))}
              </select>
            )}
          </label>
          <p>{t('timeZone')}: Asia/Ho_Chi_Minh</p>
          {(['operatingStartMinute', 'operatingEndMinute', 'cutoffMinute'] as const).map(
            (field) => (
              <label key={field}>
                {t(field)}
                <Input
                  type="number"
                  {...register(field, { valueAsNumber: true })}
                  error={errors[field]?.message}
                />
              </label>
            ),
          )}
          <p className="text-sm">{t('minuteHelp')}</p>
        </div>
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
