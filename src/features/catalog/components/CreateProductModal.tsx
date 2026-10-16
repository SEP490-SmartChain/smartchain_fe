import { useEffect } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { productApi } from '../api/productApi';
import {
  productCreateFormSchema,
  toUpdateProductInput,
  type ProductCreateFormValues,
} from '../schemas/productSchema';

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

export function CreateProductModal({ isOpen, onClose, onChanged }: Props) {
  const t = useTranslations('ProductCatalog');
  const validation = useTranslations('ProductCatalog.validation');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductCreateFormValues>({
    resolver: zodResolver(productCreateFormSchema),
    defaultValues: { isActive: 'true', declaredValue: 0 },
  });
  useEffect(() => {
    if (isOpen) {
      reset({
        sku: '',
        name: '',
        weightKg: 1,
        lengthCm: 1,
        widthCm: 1,
        heightCm: 1,
        declaredValue: 0,
        isActive: 'true',
      });
    }
  }, [isOpen, reset]);
  const handleCreate = async (values: ProductCreateFormValues) => {
    const principal = useAuthStore.getState().user;
    const update = toUpdateProductInput(values, '');
    const input = {
      barcode: update.barcode,
      declaredCostVnd: update.declaredCostVnd,
      name: update.name,
      weightG: update.weightG,
      lengthCm: update.lengthCm,
      widthCm: update.widthCm,
      heightCm: update.heightCm,
      declaredValue: update.declaredValue,
      isActive: update.isActive,
    };
    try {
      await productApi.create({ ...input, sku: values.sku });
      if (principal !== useAuthStore.getState().user) return;
      onChanged();
      onClose();
      toast.success(t('createSuccess'));
    } catch (error) {
      if (principal !== useAuthStore.getState().user) return;
      toast.error(error instanceof ApiError ? error.message : t('editSaveError'));
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('createTitle')} width="760px">
      <form
        className="space-y-6"
        noValidate
        onSubmit={(event) => void handleSubmit(handleCreate)(event)}
      >
        <section className="min-w-0 rounded-xl border border-[var(--sc-border-default)] p-4 sm:p-5">
          <h4 className="mb-4 mt-0 text-sm font-semibold text-[var(--sc-text-primary)]">
            {t('identitySection')}
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('fieldSku')}
              required
              maxLength={100}
              {...register('sku')}
              error={errors.sku?.message ? validation(errors.sku.message) : undefined}
            />
            <Input
              label={t('fieldBarcode')}
              maxLength={128}
              {...register('barcode')}
              error={errors.barcode?.message ? validation(errors.barcode.message) : undefined}
            />
            <div className="sm:col-span-2">
              <Input
                label={t('fieldName')}
                required
                maxLength={255}
                {...register('name')}
                error={errors.name?.message ? validation(errors.name.message) : undefined}
              />
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-[var(--sc-border-default)] p-4 sm:p-5">
          <h4 className="mb-4 mt-0 text-sm font-semibold text-[var(--sc-text-primary)]">
            {t('shippingSection')}
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['weightKg', 'lengthCm', 'widthCm', 'heightCm'] as const).map((field) => (
              <Input
                key={field}
                label={t(`field${field[0].toUpperCase()}${field.slice(1)}`)}
                type="number"
                required
                step={field === 'weightKg' ? '0.001' : '0.01'}
                {...register(field, { valueAsNumber: true })}
                error={errors[field]?.message ? validation(errors[field].message) : undefined}
              />
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-[var(--sc-border-default)] p-4 sm:p-5">
          <h4 className="mb-4 mt-0 text-sm font-semibold text-[var(--sc-text-primary)]">
            {t('valuationSection')}
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('fieldDeclaredCost')}
              inputMode="numeric"
              maxLength={20}
              {...register('declaredCostVnd')}
              error={
                errors.declaredCostVnd?.message
                  ? validation(errors.declaredCostVnd.message)
                  : undefined
              }
            />
            <Input
              label={t('fieldDeclaredValue')}
              type="number"
              inputMode="numeric"
              step="1"
              min={0}
              required
              {...register('declaredValue', { valueAsNumber: true })}
              error={
                errors.declaredValue?.message ? validation(errors.declaredValue.message) : undefined
              }
            />
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('discard')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
