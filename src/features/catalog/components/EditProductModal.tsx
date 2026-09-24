import { useEffect, useMemo } from 'react';

import { useForm, useWatch } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { Select } from '@/components/Common/Select/Select';
import { calculateVolumetricWeightKg } from '@/lib/volumetricWeight';
import { ApiError } from '@/services/apiClient';

import { productApi } from '../api/productApi';
import {
  productEditFormSchema,
  toProductEditFormValues,
  toUpdateProductInput,
  type ProductEditFormValues,
} from '../schemas/productSchema';

import type { Product } from '../types/product.types';

interface EditProductModalProps {
  readonly product: Product | null;
  readonly onClose: () => void;
  /** Gọi sau khi lưu thành công hoặc khi dữ liệu đã cũ, để bảng tải lại bản mới nhất. */
  readonly onChanged: () => void;
}

const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;

export function EditProductModal({ product, onClose, onChanged }: EditProductModalProps) {
  const t = useTranslations('ProductCatalog');
  const tValidation = useTranslations('ProductCatalog.validation');
  const locale = useLocale();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductEditFormValues>({ resolver: zodResolver(productEditFormSchema) });

  const [weightKg, lengthCm, widthCm, heightCm] = useWatch({
    control,
    name: ['weightKg', 'lengthCm', 'widthCm', 'heightCm'],
  });

  const weightFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );

  useEffect(() => {
    if (product) reset(toProductEditFormValues(product));
  }, [product, reset]);

  const volumetricWeightKg = calculateVolumetricWeightKg(lengthCm, widthCm, heightCm);
  const chargeableWeightKg =
    volumetricWeightKg !== null && Number.isFinite(weightKg) && weightKg > 0
      ? Math.max(weightKg, volumetricWeightKg)
      : null;

  const fieldError = (message: string | undefined) => (message ? tValidation(message) : undefined);

  const handleSave = async (values: ProductEditFormValues) => {
    if (!product) return;
    try {
      await productApi.update(product.id, toUpdateProductInput(values, product.updatedAt));
      toast.success(t('editSuccess'));
      onChanged();
      onClose();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === HTTP_CONFLICT) {
        toast.error(t('editConflict'));
        onChanged();
        onClose();
        return;
      }
      if (failure instanceof ApiError && failure.status === HTTP_NOT_FOUND) {
        toast.error(failure.message);
        onChanged();
        onClose();
        return;
      }
      toast.error(t('editSaveError'));
    }
  };

  return (
    <Modal isOpen={product !== null} onClose={onClose} title={t('editTitle')} width="560px">
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(handleSave)(event)}
        className="space-y-4 p-5 sm:p-6"
      >
        <Input label={t('fieldSku')} value={product?.sku ?? ''} disabled readOnly />

        <Input
          label={t('fieldName')}
          required
          maxLength={255}
          error={fieldError(errors.name?.message)}
          {...register('name')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('fieldWeightKg')}
            type="number"
            inputMode="decimal"
            step="0.001"
            min={0}
            required
            error={fieldError(errors.weightKg?.message)}
            {...register('weightKg', { valueAsNumber: true })}
          />
          <Input
            label={t('fieldDeclaredValue')}
            type="number"
            inputMode="numeric"
            step="1"
            min={0}
            required
            error={fieldError(errors.declaredValue?.message)}
            {...register('declaredValue', { valueAsNumber: true })}
          />
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-medium text-[var(--sc-text-primary)]">
            {t('fieldDimensions')}
          </legend>
          <Input
            label={t('fieldLengthCm')}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            required
            error={fieldError(errors.lengthCm?.message)}
            {...register('lengthCm', { valueAsNumber: true })}
          />
          <Input
            label={t('fieldWidthCm')}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            required
            error={fieldError(errors.widthCm?.message)}
            {...register('widthCm', { valueAsNumber: true })}
          />
          <Input
            label={t('fieldHeightCm')}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            required
            error={fieldError(errors.heightCm?.message)}
            {...register('heightCm', { valueAsNumber: true })}
          />
        </fieldset>

        <dl
          className="grid gap-2 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3.5 text-sm sm:grid-cols-2"
          aria-live="polite"
        >
          <div>
            <dt className="text-[var(--sc-text-secondary)]">{t('volumetricWeight')}</dt>
            <dd className="m-0 font-medium text-[var(--sc-text-primary)]">
              {volumetricWeightKg === null
                ? t('notAvailable')
                : t('weightKgValue', { weight: weightFormatter.format(volumetricWeightKg) })}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--sc-text-secondary)]">{t('chargeableWeight')}</dt>
            <dd className="m-0 font-medium text-[var(--sc-text-primary)]">
              {chargeableWeightKg === null
                ? t('notAvailable')
                : t('weightKgValue', { weight: weightFormatter.format(chargeableWeightKg) })}
            </dd>
          </div>
          <p className="m-0 text-xs text-[var(--sc-text-secondary)] sm:col-span-2">
            {t('volumetricHint')}
          </p>
        </dl>

        <Select
          label={t('fieldStatus')}
          options={[
            { value: 'true', label: t('active') },
            { value: 'false', label: t('inactive') },
          ]}
          error={fieldError(errors.isActive?.message)}
          {...register('isActive')}
        />

        <div className="flex justify-end gap-3 pt-2">
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
