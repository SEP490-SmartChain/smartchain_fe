import { useState } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';

import { freightTariffApi } from '../api/freightTariffApi';
import {
  purchaseInput,
  sellerInput,
  tariffFormSchema,
  type FreightPolicy,
  type PurchaseTariff,
  type SellerTariff,
  type TariffFormValues,
  type TariffService,
} from '../schemas/freightTariffSchema';

const emptyPolicy: FreightPolicy = {
  version: 1,
  divisor: 5000,
  roundingGram: 500,
  returnFeeVnd: '0',
  declaredValuePpm: 0,
};
function emptyBand() {
  return {
    minWeightG: 0,
    maxWeightG: null,
    includedWeightG: 1000,
    stepWeightG: 500,
    basePriceVnd: '0',
    stepPriceVnd: '0',
    direction: 'OUTBOUND' as const,
    laneCode: 'INTRA_PROVINCE' as const,
    policy: { ...emptyPolicy },
    referenceBaseVnd: '0',
    referenceStepVnd: '0',
  };
}
export function FreightTariffEditor({
  kind,
  row,
  services,
  onClose,
  onSaved,
}: {
  kind: 'purchase' | 'sell';
  row: PurchaseTariff | SellerTariff | null;
  services: TariffService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('FreightTariffs');
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [fresh, setFresh] = useState<PurchaseTariff | SellerTariff | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expected, setExpected] = useState(row ? { id: row.id, version: row.version } : undefined);
  const purchase = row && 'carrierId' in row ? row : null;
  const seller = row && 'code' in row ? row : null;
  const form = useForm<TariffFormValues>({
    resolver: zodResolver(tariffFormSchema),
    defaultValues: {
      kind,
      serviceId: purchase?.serviceId ?? '',
      zone: purchase?.zone ?? '',
      code: seller?.code ?? '',
      versionNo: seller?.versionNo ?? 1,
      referenceSource: seller?.referenceSource ?? '',
      effectiveFrom: row?.effectiveFrom.slice(0, 16) ?? '',
      effectiveTo: row?.effectiveTo?.slice(0, 16) ?? '',
      volumeTierMin: purchase?.volumeTierMin ?? 0,
      volumeTierMax: purchase?.volumeTierMax ?? null,
      policy: purchase?.policy ?? { ...emptyPolicy },
      bands: row
        ? row.bands.map((b) => ({
            ...emptyBand(),
            ...b,
            ...('policy' in b ? { policy: b.policy } : {}),
          }))
        : [emptyBand()],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'bands' });
  function bindField(
    name: Parameters<typeof form.register>[0],
    options?: Parameters<typeof form.register>[1],
  ) {
    const registered = form.register(name, options);
    return {
      ...registered,
      error: form.getFieldState(name, form.formState).error ? t('fieldInvalid') : undefined,
    };
  }
  async function readLatest() {
    if (!row) return;
    setRefreshing(true);
    try {
      setFresh(await freightTariffApi.read(kind, row.id));
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }
  function useLatest() {
    if (!fresh || fresh.status !== 'DRAFT') return;
    const p = 'carrierId' in fresh ? fresh : null;
    const s = 'code' in fresh ? fresh : null;
    form.reset({
      ...form.getValues(),
      serviceId: p?.serviceId ?? '',
      zone: p?.zone ?? '',
      code: s?.code ?? '',
      versionNo: s?.versionNo ?? 1,
      referenceSource: s?.referenceSource ?? '',
      effectiveFrom: fresh.effectiveFrom.slice(0, 16),
      effectiveTo: fresh.effectiveTo?.slice(0, 16) ?? '',
      volumeTierMin: p?.volumeTierMin ?? 0,
      volumeTierMax: p?.volumeTierMax ?? null,
      policy: p?.policy ?? { ...emptyPolicy },
      bands: fresh.bands.map((b) => ({
        ...emptyBand(),
        ...b,
        ...('policy' in b ? { policy: b.policy } : {}),
      })),
    });
    setExpected({ id: fresh.id, version: fresh.version });
    setFresh(null);
    setConflict(false);
    setError(false);
  }
  async function save(values: TariffFormValues) {
    setError(false);
    try {
      if (kind === 'purchase') {
        const service = services.find((s) => s.id === values.serviceId);
        if (!service) throw new Error('Missing service');
        await freightTariffApi.savePurchase(purchaseInput(values, service), expected);
      } else await freightTariffApi.saveSell(sellerInput(values), expected);
      onSaved();
    } catch (failure) {
      setError(true);
      setConflict(failure instanceof ApiError && failure.status === 409);
    }
  }
  const numberOptions = { valueAsNumber: true } as const;
  const nullableOptions = {
    setValueAs: (v: unknown) => (v === '' || v === null ? null : Number(v)),
  };
  return (
    <Modal isOpen onClose={onClose} title={t(row ? 'edit' : 'create')} width="920px">
      <form className="space-y-5" onSubmit={form.handleSubmit(save)}>
        {error && <Alert variant="error">{t('saveError')}</Alert>}
        {conflict && row && (
          <Button
            type="button"
            variant="secondary"
            isLoading={refreshing}
            onClick={() => void readLatest()}
          >
            {t('readLatest')}
          </Button>
        )}
        {fresh && (
          <Alert variant="info">
            <p>
              {t('latestInfo', { version: fresh.version, status: t(`status_${fresh.status}`) })}
            </p>
            <p>
              {fresh.bands
                .map((b) => `${b.minWeightG}–${b.maxWeightG ?? '∞'}g: ${b.basePriceVnd} VND`)
                .join(' · ')}
            </p>
            {fresh.status === 'DRAFT' && (
              <Button type="button" variant="secondary" onClick={useLatest}>
                {t('useLatest')}
              </Button>
            )}
          </Alert>
        )}
        {Object.keys(form.formState.errors).length > 0 && (
          <Alert variant="error">{t('validation')}</Alert>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {kind === 'purchase' ? (
            <>
              <Select
                aria-required
                label={t('service')}
                options={services.map((s) => ({
                  value: s.id,
                  label: `${s.carrier.name} · ${s.name}`,
                }))}
                {...bindField('serviceId', {
                  onChange: (e) => {
                    const s = services.find((s) => s.id === e.target.value);
                    if (s) form.setValue('policy.divisor', s.volumetricDivisor);
                  },
                })}
              />
              <Input aria-required label={t('zone')} {...bindField('zone')} />
              <Input
                aria-required
                label={t('volumeMin')}
                type="number"
                {...bindField('volumeTierMin', numberOptions)}
              />
              <Input
                label={t('volumeMax')}
                type="number"
                {...bindField('volumeTierMax', nullableOptions)}
              />
            </>
          ) : (
            <>
              <Input aria-required label={t('code')} {...bindField('code')} />
              <Input
                aria-required
                label={t('versionNo')}
                type="number"
                {...bindField('versionNo', numberOptions)}
              />
              <Input
                aria-required
                label={t('referenceSource')}
                className="md:col-span-2"
                {...bindField('referenceSource')}
              />
            </>
          )}
          <Input
            aria-required
            label={t('effectiveFrom')}
            type="datetime-local"
            {...bindField('effectiveFrom')}
          />
          <Input label={t('effectiveTo')} type="datetime-local" {...bindField('effectiveTo')} />
          {kind === 'purchase' && (
            <>
              <Input
                aria-required
                label={t('divisor')}
                type="number"
                {...bindField('policy.divisor', numberOptions)}
              />
              <Input
                aria-required
                label={t('rounding')}
                type="number"
                {...bindField('policy.roundingGram', numberOptions)}
              />
              <Input aria-required label={t('returnFee')} {...bindField('policy.returnFeeVnd')} />
              <Input
                aria-required
                label={t('declaredFee')}
                type="number"
                {...bindField('policy.declaredValuePpm', numberOptions)}
              />
            </>
          )}
        </div>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('bandHelp')}</p>
        {fields.map((field, index) => (
          <fieldset
            key={field.id}
            className="space-y-3 rounded-lg border border-[var(--sc-border-default)] p-4"
          >
            <legend className="px-2 text-sm font-semibold">
              {t('band', { number: index + 1 })}
            </legend>
            <div className="grid gap-3 md:grid-cols-3">
              {kind === 'sell' && (
                <>
                  <Select
                    aria-required
                    label={t('direction')}
                    options={['OUTBOUND', 'RETURN'].map((value) => ({
                      value,
                      label: t(`direction_${value}`),
                    }))}
                    {...bindField(`bands.${index}.direction`)}
                  />
                  <Select
                    aria-required
                    label={t('lane')}
                    options={['INTRA_PROVINCE', 'INTRA_REGION', 'INTER_REGION'].map((value) => ({
                      value,
                      label: t(`lane_${value}`),
                    }))}
                    {...bindField(`bands.${index}.laneCode`)}
                  />
                </>
              )}
              <Input
                aria-required
                label={t('minWeight')}
                type="number"
                {...bindField(`bands.${index}.minWeightG`, numberOptions)}
              />
              <Input
                label={t('maxWeight')}
                type="number"
                {...bindField(`bands.${index}.maxWeightG`, nullableOptions)}
              />
              <Input
                aria-required
                label={t('includedWeight')}
                type="number"
                {...bindField(`bands.${index}.includedWeightG`, numberOptions)}
              />
              <Input
                aria-required
                label={t('stepWeight')}
                type="number"
                {...bindField(`bands.${index}.stepWeightG`, numberOptions)}
              />
              <Input
                aria-required
                label={t('basePrice')}
                {...bindField(`bands.${index}.basePriceVnd`)}
              />
              <Input
                aria-required
                label={t('stepPrice')}
                {...bindField(`bands.${index}.stepPriceVnd`)}
              />
              {kind === 'sell' && (
                <>
                  <Input
                    aria-required
                    label={t('divisor')}
                    type="number"
                    {...bindField(`bands.${index}.policy.divisor`, numberOptions)}
                  />
                  <Input
                    aria-required
                    label={t('rounding')}
                    type="number"
                    {...bindField(`bands.${index}.policy.roundingGram`, numberOptions)}
                  />
                  <Input
                    aria-required
                    label={t('returnFee')}
                    {...bindField(`bands.${index}.policy.returnFeeVnd`)}
                  />
                  <Input
                    aria-required
                    label={t('declaredFee')}
                    type="number"
                    {...bindField(`bands.${index}.policy.declaredValuePpm`, numberOptions)}
                  />
                  <Input
                    aria-required
                    label={t('referenceBase')}
                    {...bindField(`bands.${index}.referenceBaseVnd`)}
                  />
                  <Input
                    aria-required
                    label={t('referenceStep')}
                    {...bindField(`bands.${index}.referenceStepVnd`)}
                  />
                </>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={fields.length === 1 || form.formState.isSubmitting}
              onClick={() => remove(index)}
            >
              {t('removeBand')}
            </Button>
          </fieldset>
        ))}
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={fields.length >= 100 || form.formState.isSubmitting}
            onClick={() => append(emptyBand())}
          >
            {t('addBand')}
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={form.formState.isSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!!fresh || refreshing}
              isLoading={form.formState.isSubmitting}
            >
              {t('saveDraft')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
