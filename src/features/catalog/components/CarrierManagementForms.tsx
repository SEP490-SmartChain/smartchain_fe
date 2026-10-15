import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import { carrierManagementApi } from '../api/carrierManagementApi';
import {
  carrierFormSchema,
  carrierServiceFormSchema,
  type CarrierFormValues,
  type CarrierServiceFormValues,
} from '../schemas/carrierManagementSchema';

import type { CarrierService, CarrierSummary } from '../types/carrierCatalog.types';

function ErrorNotice({ message }: { message: string }) {
  const t = useTranslations('AdminCarriers');
  return (
    <Alert variant="error" title={t('saveError')}>
      {message}
    </Alert>
  );
}
export function CarrierEditor({
  current,
  onClose,
  onSaved,
}: {
  current?: CarrierSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('AdminCarriers');
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CarrierFormValues>({
    resolver: zodResolver(carrierFormSchema),
    defaultValues: current ?? { code: '', name: '', isActive: false },
  });
  const submit = handleSubmit(async (values) => {
    const actor = useAuthStore.getState().user;
    if (actor?.actorScope !== 'PLATFORM' || !actor.roles.includes('ORCA_ADMIN')) return;
    setError('');
    try {
      await carrierManagementApi.saveCarrier(values, current);
      if (actor === useAuthStore.getState().user) onSaved();
    } catch (e) {
      if (actor === useAuthStore.getState().user) {
        setError(e instanceof Error ? e.message : t('saveError'));
      }
    }
  });
  return (
    <Modal
      isOpen
      title={t(current ? 'editCarrier' : 'createCarrier')}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <Input
          aria-required
          label={t('carrierCode')}
          {...register('code')}
          readOnly={!!current}
          error={errors.code ? t('invalidCode') : undefined}
          disabled={isSubmitting}
        />
        <Input
          aria-required
          label={t('carrierName')}
          {...register('name')}
          error={errors.name ? t('invalidName') : undefined}
          disabled={isSubmitting}
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('isActive')} disabled={isSubmitting} />
          {t('status_active')}
        </label>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('catalogHint')}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function CarrierServiceEditor({
  carrierId,
  current,
  onClose,
  onSaved,
}: {
  carrierId: string;
  current?: CarrierService;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('AdminCarriers');
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CarrierServiceFormValues>({
    resolver: zodResolver(carrierServiceFormSchema),
    defaultValues: {
      code: current?.code ?? '',
      name: current?.name ?? '',
      transportMode: current?.transportMode ?? 'ROAD',
      volumetricDivisor: current?.volumetricDivisor ?? 5000,
      isActive: current?.isActive ?? true,
      maxWeightG: current?.maxWeightG?.toString() ?? '',
      maxLengthCm: current?.maxLengthCm?.toString() ?? '',
      maxWidthCm: current?.maxWidthCm?.toString() ?? '',
      maxHeightCm: current?.maxHeightCm?.toString() ?? '',
      maxDimensionSumCm: current?.maxDimensionSumCm?.toString() ?? '',
    },
  });
  const submit = handleSubmit(async (values) => {
    const actor = useAuthStore.getState().user;
    if (actor?.actorScope !== 'PLATFORM' || !actor.roles.includes('ORCA_ADMIN')) return;
    setError('');
    try {
      await carrierManagementApi.saveService(carrierId, values, current);
      if (actor === useAuthStore.getState().user) onSaved();
    } catch (e) {
      if (actor === useAuthStore.getState().user) {
        setError(e instanceof Error ? e.message : t('saveError'));
      }
    }
  });
  const limitFields = [
    'maxWeightG',
    'maxLengthCm',
    'maxWidthCm',
    'maxHeightCm',
    'maxDimensionSumCm',
  ] as const;
  return (
    <Modal
      isOpen
      title={t(current ? 'editService' : 'createService')}
      width="620px"
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <Input
          aria-required
          label={t('service_code')}
          {...register('code')}
          readOnly={!!current}
          error={errors.code ? t('invalidService') : undefined}
          disabled={isSubmitting}
          helperText={t('serviceCodeHint')}
        />
        <Input
          aria-required
          label={t('service_name')}
          {...register('name')}
          error={errors.name ? t('invalidService') : undefined}
          disabled={isSubmitting}
        />
        <Select
          aria-required
          label={t('mode')}
          {...register('transportMode')}
          options={['ROAD', 'AIR', 'SEA', 'RAIL'].map((value) => ({
            value,
            label: t(`mode_${value}`),
          }))}
          disabled={isSubmitting}
        />
        <Input
          aria-required
          type="number"
          label={t('volumetric')}
          {...register('volumetricDivisor', { valueAsNumber: true })}
          error={errors.volumetricDivisor ? t('invalidService') : undefined}
          disabled={isSubmitting}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {limitFields.map((field) => (
            <Input
              key={field}
              type="number"
              step={field === 'maxWeightG' ? '1' : '0.01'}
              label={t(field)}
              {...register(field)}
              error={errors[field] ? t('invalidService') : undefined}
              disabled={isSubmitting}
            />
          ))}
        </div>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('limitHint')}</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('isActive')} disabled={isSubmitting} />
          {t('status_active')}
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
