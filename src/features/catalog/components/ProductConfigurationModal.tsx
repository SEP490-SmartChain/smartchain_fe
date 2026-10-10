import { useEffect } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { productApi } from '../api/productApi';
import {
  productConfigurationSchema,
  type ProductConfigurationValues,
} from '../schemas/productSchema';

import type { Product } from '../types/product.types';

interface Props {
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

export function ProductConfigurationModal({ product, onClose, onChanged }: Props) {
  const t = useTranslations('ProductCatalog');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductConfigurationValues>({ resolver: zodResolver(productConfigurationSchema) });
  useEffect(() => {
    if (product) {
      reset({
        trackLot: product.trackLot ?? true,
        trackExpiry: product.trackExpiry ?? false,
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
      await productApi.configure(product.id, { ...values, expectedUpdatedAt: product.updatedAt });
      if (principal !== useAuthStore.getState().user) return;
      onChanged();
      onClose();
      toast.success(t('editSuccess'));
    } catch (error) {
      if (principal !== useAuthStore.getState().user) return;
      toast.error(error instanceof ApiError ? error.message : t('editSaveError'));
    }
  };
  return (
    <Modal
      isOpen={product !== null}
      onClose={onClose}
      title={t('configurationTitle')}
      width="560px"
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => void handleSubmit(handleSave)(event)}
      >
        <Checkbox
          label={t('trackLot')}
          {...register('trackLot')}
          error={errors.trackLot ? t('expiryRequiresLot') : undefined}
        />
        <Checkbox label={t('trackExpiry')} {...register('trackExpiry')} />
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
              type="number"
              min={field === 'shelfLifeDays' ? 1 : 0}
              max={field === 'minInboundShelfLifePct' ? 100 : 36500}
              step={field === 'minInboundShelfLifePct' ? '0.01' : '1'}
              {...register(field, {
                setValueAs: (value: string) =>
                  field === 'shelfLifeDays' && value === '' ? null : Number(value),
              })}
              error={errors[field] ? t('configurationInvalid') : undefined}
            />
          ))}
        </div>
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
