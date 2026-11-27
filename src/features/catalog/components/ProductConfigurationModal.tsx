import { useEffect, useState } from 'react';

import { useForm, useWatch } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { productApi } from '../api/productApi';
import {
  productConfigurationSchema,
  parseOptionalShelfLifeDays,
  type ProductConfigurationValues,
} from '../schemas/productSchema';

import type { Product } from '../types/product.types';

interface Props {
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

export function ProductConfigurationModal({ product, onClose, onChanged }: Props) {
  const [submitError, setSubmitError] = useState('');
  const t = useTranslations('ProductCatalog');
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductConfigurationValues>({ resolver: zodResolver(productConfigurationSchema) });
  const tracksExpiry = useWatch({ control, name: 'trackExpiry' });
  useEffect(() => {
    if (product) {
      reset({
        trackLot: product.trackLot ?? true,
        trackExpiry: product.trackExpiry ?? false,
        manufactureRequired: product.manufactureRequired ?? false,
        shelfLifeDays: product.shelfLifeDays ?? null,
        minInboundShelfLifePct: Number(product.minInboundShelfLifePct ?? 50),
        minOutboundDays: product.minOutboundDays ?? 30,
        nearExpiryDays: product.nearExpiryDays ?? 30,
      });
    }
  }, [product, reset]);
  const handleSave = async (values: ProductConfigurationValues) => {
    if (!product) return;
    const principal = useAuthStore.getState().user;
    try {
      await productApi.configure(product.id, {
        ...values,
        shelfLifeDays: values.trackExpiry ? values.shelfLifeDays : null,
        expectedUpdatedAt: product.updatedAt,
      });
      if (principal !== useAuthStore.getState().user) return;
      onChanged();
      onClose();
      toast.success(t('editSuccess'));
    } catch (error) {
      if (principal !== useAuthStore.getState().user) return;
      setSubmitError(error instanceof ApiError ? error.message : t('editSaveError'));
    }
  };
  return (
    <Modal
      isOpen={product !== null}
      onClose={onClose}
      title={t('configurationTitle')}
      width="640px"
    >
      <form
        onSubmitCapture={() => setSubmitError('')}
        className="space-y-4"
        noValidate
        onSubmit={(event) => void handleSubmit(handleSave, () => notifyInvalidForm())(event)}
      >
        {submitError && (
          <Alert variant="error" onClose={() => setSubmitError('')}>
            {submitError}
          </Alert>
        )}
        <Checkbox
          label={t('trackLot')}
          helperText={t('trackLotHelp')}
          {...register('trackLot')}
          error={errors.trackLot ? t('expiryRequiresLot') : undefined}
        />
        <Checkbox
          label={t('trackExpiry')}
          helperText={t('trackExpiryHelp')}
          {...register('trackExpiry', {
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
              if (event.target.checked) return;
              setValue('shelfLifeDays', null, { shouldValidate: true });
              setValue('minInboundShelfLifePct', Number(product?.minInboundShelfLifePct ?? 50), {
                shouldValidate: true,
              });
              setValue('minOutboundDays', product?.minOutboundDays ?? 30, { shouldValidate: true });
              setValue('nearExpiryDays', product?.nearExpiryDays ?? 30, { shouldValidate: true });
            },
          })}
          error={errors?.trackExpiry?.message}
        />
        <Checkbox
          label={t('manufactureRequired')}
          helperText={t('manufactureRequiredHelp')}
          {...register('manufactureRequired')}
          error={errors?.manufactureRequired?.message}
        />
        {tracksExpiry ? (
          <div className="space-y-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-4">
            <p className="m-0 text-sm font-medium text-[var(--sc-text-primary)]">
              {t('expiryRulesTitle')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  'shelfLifeDays',
                  'minInboundShelfLifePct',
                  'minOutboundDays',
                  'nearExpiryDays',
                ] as const
              ).map((field) => (
                <Input
                  key={field}
                  label={t(field)}
                  placeholder={
                    field === 'shelfLifeDays' ? t('shelfLifeDaysPlaceholder') : undefined
                  }
                  helperText={t(`${field}Help`)}
                  type="number"
                  min={field === 'shelfLifeDays' ? 1 : 0}
                  max={field === 'minInboundShelfLifePct' ? 100 : 36500}
                  step={field === 'minInboundShelfLifePct' ? '0.01' : '1'}
                  {...register(field, {
                    setValueAs: (value: unknown) =>
                      field === 'shelfLifeDays' ? parseOptionalShelfLifeDays(value) : Number(value),
                  })}
                  error={errors[field] ? t('configurationInvalid') : undefined}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('noExpiryHint')}</p>
        )}
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('configurationHint')}</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('discard')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('saveChanges')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
