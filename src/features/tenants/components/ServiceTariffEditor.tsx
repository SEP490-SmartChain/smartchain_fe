import { useEffect, useRef, useState } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import { serviceTariffApi } from '../api/serviceTariffApi';
import {
  SERVICE_FEE_UNITS,
  serviceTariffFormSchema,
  type ServiceTariff,
  type ServiceTariffForm,
} from '../schemas/serviceTariffSchema';

export function ServiceTariffEditor({
  row,
  onClose,
  onSaved,
}: {
  row: ServiceTariff | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('ServiceTariffs');
  const abort = useRef(new AbortController());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    return () => controller.abort();
  }, []);
  const form = useForm<ServiceTariffForm>({
    resolver: zodResolver(serviceTariffFormSchema),
    defaultValues: row
      ? {
          code: row.code,
          versionNo: row.versionNo,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo ?? '',
          reason: '',
          lines: row.lines,
        }
      : {
          code: 'FULFILLMENT',
          versionNo: 1,
          effectiveFrom: new Date().toISOString(),
          effectiveTo: '',
          reason: '',
          lines: [
            {
              feeType: 'PICK_PACK_ORDER',
              unit: 'ORDER',
              lowerBound: '0',
              upperBound: null,
              unitPriceVnd: '8000',
              rounding: 'CEIL_VND',
            },
          ],
        },
  });
  const fields = useFieldArray({ control: form.control, name: 'lines' });
  const submit = form.handleSubmit(async (input) => {
    setError(null);
    try {
      await serviceTariffApi.save(input, row ?? undefined, abort.current.signal);
      if (!abort.current.signal.aborted) onSaved();
    } catch (failure) {
      if (!abort.current.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('saveError'));
      }
    }
  });
  const invalid = (hasError: unknown) => (hasError ? t('invalid') : undefined);
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!form.formState.isSubmitting) onClose();
      }}
      title={row ? t('edit') : t('create')}
      width="900px"
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('code')}
            required
            readOnly={Boolean(row)}
            error={invalid(form.formState.errors.code)}
            {...form.register('code')}
          />
          <Input
            label={t('version')}
            type="number"
            min={1}
            step={1}
            required
            readOnly={Boolean(row)}
            error={invalid(form.formState.errors.versionNo)}
            {...form.register('versionNo', { valueAsNumber: true })}
          />
          <Input
            label={t('fromUtc')}
            required
            error={invalid(form.formState.errors.effectiveFrom)}
            {...form.register('effectiveFrom')}
          />
          <Input
            label={t('toUtc')}
            error={invalid(form.formState.errors.effectiveTo)}
            {...form.register('effectiveTo')}
          />
        </div>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('bandHelp')}</p>
        {fields.fields.map((field, index) => (
          <fieldset
            key={field.id}
            className="grid gap-3 rounded-xl border border-[var(--sc-border-default)] p-4 sm:grid-cols-3"
          >
            <legend className="px-2 text-sm">{t('line', { number: index + 1 })}</legend>
            <Select
              label={t('feeType')}
              required
              options={Object.keys(SERVICE_FEE_UNITS).map((value) => ({
                value,
                label: t(`fee_${value}`),
              }))}
              {...form.register(`lines.${index}.feeType`, {
                onChange: (event: { target: { value: string } }) => {
                  const type = event.target.value;
                  if (Object.hasOwn(SERVICE_FEE_UNITS, type)) {
                    form.setValue(
                      `lines.${index}.unit`,
                      SERVICE_FEE_UNITS[type as keyof typeof SERVICE_FEE_UNITS],
                    );
                  }
                },
              })}
            />
            <Input label={t('unit')} readOnly {...form.register(`lines.${index}.unit`)} />
            <Input
              label={t('price')}
              type="number"
              min={0}
              step={1000}
              required
              error={invalid(form.formState.errors.lines?.[index]?.unitPriceVnd)}
              {...form.register(`lines.${index}.unitPriceVnd`)}
            />
            <Input
              label={t('lower')}
              type="number"
              min={0}
              step="any"
              required
              {...form.register(`lines.${index}.lowerBound`)}
            />
            <Input
              label={t('upper')}
              type="number"
              min={0}
              step="any"
              {...form.register(`lines.${index}.upperBound`, {
                setValueAs: (value: string) => (value === '' ? null : value),
              })}
            />
            <Button
              type="button"
              variant="ghost"
              disabled={fields.fields.length === 1}
              onClick={() => fields.remove(index)}
            >
              {t('remove')}
            </Button>
          </fieldset>
        ))}
        {form.formState.errors.lines && <Alert variant="error">{t('invalidBands')}</Alert>}
        <Button
          type="button"
          variant="outline"
          disabled={fields.fields.length >= 100}
          onClick={() =>
            fields.append({
              feeType: 'INBOUND_CARTON',
              unit: 'CARTON',
              lowerBound: '0',
              upperBound: null,
              unitPriceVnd: '20000',
              rounding: 'CEIL_VND',
            })
          }
        >
          {t('addLine')}
        </Button>
        <Input
          label={t('reason')}
          required
          error={invalid(form.formState.errors.reason)}
          {...form.register('reason')}
        />
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={form.formState.isSubmitting}
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={form.formState.isSubmitting}>
            {t('saveDraft')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
