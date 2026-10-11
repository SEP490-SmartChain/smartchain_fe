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
    <Modal isOpen={isOpen} onClose={onClose} title={t('createTitle')} width="560px">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => void handleSubmit(handleCreate)(event)}
      >
        <Input
          label={t('fieldSku')}
          {...register('sku')}
          error={errors.sku?.message ? validation(errors.sku.message) : undefined}
        />
        <Input
          label={t('fieldBarcode')}
          maxLength={128}
          {...register('barcode')}
          error={errors.barcode?.message ? validation(errors.barcode.message) : undefined}
        />
        <Input
          label={t('fieldDeclaredCost')}
          inputMode="numeric"
          maxLength={20}
          {...register('declaredCostVnd')}
          error={
            errors.declaredCostVnd?.message ? validation(errors.declaredCostVnd.message) : undefined
          }
        />
        <Input
          label={t('fieldName')}
          {...register('name')}
          error={errors.name?.message ? validation(errors.name.message) : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {(['weightKg', 'lengthCm', 'widthCm', 'heightCm', 'declaredValue'] as const).map(
            (field) => (
              <Input
                key={field}
                label={t(`field${field[0].toUpperCase()}${field.slice(1)}`)}
                type="number"
                step={field === 'weightKg' ? '0.001' : field === 'declaredValue' ? '1' : '0.01'}
                {...register(field, { valueAsNumber: true })}
                error={errors[field]?.message ? validation(errors[field].message) : undefined}
              />
            ),
          )}
        </div>
        <div className="flex justify-end gap-3">
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
