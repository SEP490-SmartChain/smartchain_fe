import { useEffect, useRef, useState } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { warehouseApi } from '@/features/catalog';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { asnApi } from '../api/asnApi';
import { asnFormSchema, type AsnFormValues } from '../schemas/asnSchema';

import type { Asn, AsnSkuOption } from '../types/asn.types';

const blankLine = { productId: '', declaredQty: 1, declaredLotCode: '', declaredExpiryOn: '' };
interface Props {
  readonly draft: Asn | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}
export function AsnForm({ draft, onClose, onSaved }: Props) {
  const t = useTranslations('Asns');
  const creationKey = useRef(crypto.randomUUID());
  const user = useAuthStore((state) => state.user);
  const [products, setProducts] = useState<AsnSkuOption[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; code: string; name: string }>>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AsnFormValues>({
    resolver: zodResolver(asnFormSchema),
    defaultValues: draft
      ? {
          warehouseId: draft.warehouseId,
          externalReference: draft.externalReference ?? '',
          cartonCount: draft.cartonCount,
          expectedArrivalAt: draft.expectedArrivalAt ? localDateTime(draft.expectedArrivalAt) : '',
          lines: draft.lines.map((line) => ({
            productId: line.productId,
            declaredQty: line.declaredQty,
            declaredLotCode: line.declaredLotCode ?? '',
            declaredExpiryOn: line.declaredExpiryOn?.slice(0, 10) ?? '',
          })),
        }
      : {
          warehouseId: '',
          externalReference: '',
          expectedArrivalAt: '',
          cartonCount: 1,
          lines: [{ ...blankLine }],
        },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setProducts([]);
    setWarehouses([]);
    setLoadFailed(false);
    async function load() {
      try {
        const skus: AsnSkuOption[] = [],
          destinations: Array<{ id: string; code: string; name: string }> = [];
        let cursor: string | undefined;
        do {
          const page = await asnApi.skuOptions('', cursor, controller.signal);
          if (!current || user !== useAuthStore.getState().user) return;
          skus.push(...page.items);
          cursor = page.pagination.hasNext ? (page.pagination.nextCursor ?? undefined) : undefined;
        } while (cursor);
        do {
          const page = await warehouseApi.list({ search: '', status: 'ACTIVE' }, cursor);
          if (!current || user !== useAuthStore.getState().user) return;
          destinations.push(...page.items.filter((warehouse) => warehouse.tenantId === null));
          cursor = page.pagination.hasNext ? (page.pagination.nextCursor ?? undefined) : undefined;
        } while (cursor);
        setProducts(skus);
        setWarehouses(destinations);
      } catch {
        if (current && user === useAuthStore.getState().user) setLoadFailed(true);
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => {
      current = false;
      controller.abort();
    };
  }, [user, reload]);
  const save = async (values: AsnFormValues) => {
    const principal = useAuthStore.getState().user;
    const payload = {
      warehouseId: values.warehouseId,
      cartonCount: values.cartonCount,
      externalReference: values.externalReference,
      expectedArrivalAt: values.expectedArrivalAt
        ? new Date(values.expectedArrivalAt).toISOString()
        : undefined,
      lines: values.lines.map((line) => ({
        productId: line.productId,
        declaredQty: line.declaredQty,
        declaredLotCode: line.declaredLotCode || undefined,
        declaredExpiryOn: line.declaredExpiryOn || undefined,
      })),
    };
    try {
      if (draft) {
        const { warehouseId: _warehouseId, ...changes } = payload;
        await asnApi.update(draft.id, {
          ...changes,
          expectedArrivalAt: changes.expectedArrivalAt ?? null,
          version: draft.version,
        });
      } else await asnApi.create({ ...payload, operationKey: creationKey.current });
      if (principal !== useAuthStore.getState().user) return;
      toast.success(t('saved'));
      onSaved();
      onClose();
    } catch (error) {
      if (principal !== useAuthStore.getState().user) return;
      toast.error(error instanceof ApiError ? error.message : t('saveError'));
    }
  };
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title={draft ? t('editDraft') : t('createTitle')}
      width="900px"
    >
      <form noValidate className="space-y-5" onSubmit={(event) => void handleSubmit(save)(event)}>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('createDescription')}</p>
        {loadFailed && (
          <Alert variant="error" title={t('loadError')}>
            <Button type="button" onClick={() => setReload((value) => value + 1)}>
              {t('retry')}
            </Button>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('warehouse')}
            placeholder={t('selectWarehouse')}
            options={warehouses.map((warehouse) => ({
              value: warehouse.id,
              label: `${warehouse.code} — ${warehouse.name}`,
            }))}
            disabled={Boolean(draft) || loading}
            {...register('warehouseId')}
            error={errors.warehouseId ? t('invalidForm') : undefined}
          />
          <Input
            label={t('reference')}
            {...register('externalReference')}
            error={errors.externalReference ? t('invalidForm') : undefined}
          />
          <Input
            label={t('arrival')}
            type="datetime-local"
            {...register('expectedArrivalAt')}
            error={errors.expectedArrivalAt ? t('invalidForm') : undefined}
          />
          <Input
            label={t('cartons')}
            type="number"
            min={1}
            max={1000}
            {...register('cartonCount', { valueAsNumber: true })}
            error={errors.cartonCount ? t('invalidForm') : undefined}
          />
        </div>
        {fields.map((field, index) => (
          <fieldset
            key={field.id}
            className="rounded-lg border border-[var(--sc-border-default)] p-4"
          >
            <legend className="px-2 text-sm font-medium">
              {t('lineNumber', { number: index + 1 })}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t('sku')}
                placeholder={t('selectSku')}
                disabled={loading}
                options={products.map((product) => ({
                  value: product.id,
                  label: `${product.sku} — ${product.name}`,
                }))}
                {...register(`lines.${index}.productId`)}
                error={errors.lines?.[index]?.productId ? t('invalidForm') : undefined}
              />
              <Input
                label={t('quantity')}
                type="number"
                min={1}
                max={1000000}
                {...register(`lines.${index}.declaredQty`, { valueAsNumber: true })}
                error={errors.lines?.[index]?.declaredQty ? t('invalidForm') : undefined}
              />
              <Input
                label={t('lot')}
                {...register(`lines.${index}.declaredLotCode`)}
                error={errors.lines?.[index]?.declaredLotCode ? t('invalidForm') : undefined}
              />
              <Input
                label={t('expiry')}
                type="date"
                {...register(`lines.${index}.declaredExpiryOn`)}
                error={errors.lines?.[index]?.declaredExpiryOn ? t('invalidForm') : undefined}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={fields.length === 1 || isSubmitting}
              onClick={() => remove(index)}
            >
              {t('removeLine')}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={fields.length >= 100 || isSubmitting}
          onClick={() => append({ ...blankLine })}
        >
          {t('addLine')}
        </Button>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onClose}>
            {t('close')}
          </Button>
          <Button type="submit" disabled={loading || loadFailed} isLoading={isSubmitting}>
            {t('saveDraft')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
