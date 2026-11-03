import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, RequiredNote, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import { carrierManagementApi } from '../api/carrierManagementApi';
import {
  carrierFormSchema,
  carrierServiceFormSchema,
  type CarrierFormValues,
  type CarrierServiceFormValues,
} from '../schemas/carrierManagementSchema';
import { carrierServicePresets } from '../schemas/carrierServicePresets';

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
    defaultValues: current ?? {
      code: '',
      name: '',
      monthlyPurchaseVolumeCount: 0,
      isActive: false,
    },
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
        <RequiredNote />
        <Input
          label={t('carrierCode')}
          {...register('code')}
          isRequired
          readOnly={!!current}
          error={errors.code ? t('invalidCode') : undefined}
          disabled={isSubmitting}
          helperText={t('carrierCodeHint')}
        />
        <Input
          label={t('carrierName')}
          {...register('name')}
          isRequired
          error={errors.name ? t('invalidName') : undefined}
          disabled={isSubmitting}
          helperText={t('carrierNameHint')}
        />
        <Input
          label={t('monthlyPurchaseVolumeCount')}
          type="number"
          min={0}
          step={1}
          {...register('monthlyPurchaseVolumeCount', { valueAsNumber: true })}
          isRequired
          error={
            errors.monthlyPurchaseVolumeCount ? t('invalidMonthlyPurchaseVolumeCount') : undefined
          }
          disabled={isSubmitting}
          helperText={t('monthlyPurchaseVolumeCountHint')}
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
  carrierCode,
  current,
  onClose,
  onSaved,
}: {
  carrierId: string;
  carrierCode: string;
  current?: CarrierService;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('AdminCarriers');
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    setValue,
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
  const presets = carrierServicePresets(carrierCode);
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
        <RequiredNote />
        {!current && presets.length > 0 ? (
          <Select
            label={t('serviceChoice')}
            isRequired
            options={presets.map((preset) => ({ value: preset.code, label: t(preset.labelKey) }))}
            {...register('code', {
              onChange: (event) => {
                const preset = presets.find((item) => item.code === event.target.value);
                if (!preset) return;
                setValue('name', t(preset.labelKey), { shouldDirty: true, shouldValidate: true });
                setValue('transportMode', preset.transportMode, { shouldDirty: true });
              },
            })}
            error={errors.code ? t('invalidService') : undefined}
            disabled={isSubmitting}
            helperText={t('servicePresetHint')}
          />
        ) : (
          <Input
            label={t('service_code')}
            isRequired
            {...register('code')}
            readOnly={!!current}
            error={errors.code ? t('invalidService') : undefined}
            disabled={isSubmitting}
            helperText={t('serviceCodeHint')}
          />
        )}
        <Input
          label={t('service_name')}
          isRequired
          {...register('name')}
          error={errors.name ? t('invalidService') : undefined}
          disabled={isSubmitting}
          helperText={t('serviceNameHint')}
        />
        <Select
          label={t('mode')}
          isRequired
          helperText={t('modeHint')}
          {...register('transportMode')}
          options={['ROAD', 'AIR', 'SEA', 'MULTIMODAL'].map((value) => ({
            value,
            label: t(`mode_${value}`),
          }))}
          disabled={isSubmitting}
        />
        <Input
          type="number"
          label={t('volumetric')}
          isRequired
          helperText={t('volumetricHint')}
          {...register('volumetricDivisor', { valueAsNumber: true })}
          error={errors.volumetricDivisor ? t('invalidService') : undefined}
          disabled={isSubmitting}
        />
        <p className="pt-2 text-sm font-semibold text-[var(--sc-text-primary)]">
          {t('limitTitle')}
        </p>
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
        <div>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('isActive')} disabled={isSubmitting} />
            {t('status_active')}
          </label>
          <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">{t('activeHint')}</p>
        </div>
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
