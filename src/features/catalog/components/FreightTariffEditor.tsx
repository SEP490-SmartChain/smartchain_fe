import { useEffect, useState, type ReactNode } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, RequiredNote, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--sc-text-primary)]">{title}</h3>
      {children}
    </section>
  );
}

/** Collapsed group for fields that usually keep their defaults; opens itself on errors. */
function Advanced({
  title,
  hint,
  hasError,
  children,
}: {
  title: string;
  hint?: string;
  hasError: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={hasError ? true : undefined}
      className="group rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
        {title}
        {hint && <span className="font-normal text-[var(--sc-text-secondary)]">· {hint}</span>}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="ml-auto text-[var(--sc-text-secondary)] transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-4 border-t border-[var(--sc-border-default)] p-4 md:grid-cols-2">
        {children}
      </div>
    </details>
  );
}

export function FreightTariffEditor({
  kind,
  row,
  template = null,
  services,
  onClose,
  onSaved,
}: {
  kind: 'purchase' | 'sell';
  row: PurchaseTariff | SellerTariff | null;
  /** A published tariff to copy into a new draft (repricing); ignored when editing a draft. */
  template?: PurchaseTariff | SellerTariff | null;
  services: TariffService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('FreightTariffs');
  const { can } = useAccess();
  const [error, setError] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesError, setZonesError] = useState(false);
  const [zonesRevision, setZonesRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [fresh, setFresh] = useState<PurchaseTariff | SellerTariff | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expected, setExpected] = useState(row ? { id: row.id, version: row.version } : undefined);
  const source = row ?? template;
  const purchase = source && 'carrierId' in source ? source : null;
  const seller = source && 'code' in source ? source : null;
  const form = useForm<TariffFormValues>({
    resolver: zodResolver(tariffFormSchema),
    defaultValues: {
      kind,
      serviceId: purchase?.serviceId ?? '',
      zone: purchase?.zone ?? '',
      code: seller?.code ?? '',
      versionNo: seller ? seller.versionNo + (row ? 0 : 1) : 1,
      referenceSource: seller?.referenceSource ?? '',
      effectiveFrom: row?.effectiveFrom.slice(0, 16) ?? '',
      effectiveTo: row?.effectiveTo?.slice(0, 16) ?? '',
      volumeTierMin: purchase?.volumeTierMin ?? 0,
      volumeTierMax: purchase?.volumeTierMax ?? null,
      policy: purchase?.policy ?? { ...emptyPolicy },
      bands: source
        ? source.bands.map((b) => ({
            ...emptyBand(),
            ...b,
            ...('policy' in b ? { policy: b.policy } : {}),
          }))
        : [emptyBand()],
    },
  });
  const errors = form.formState.errors;
  const selectedService = services.find((service) => service.id === form.watch('serviceId'));
  const carrierId = selectedService?.carrierId;
  const zonePlaceholder = !carrierId
    ? t('zoneChooseService')
    : zonesLoading
      ? t('zonesLoading')
      : zonesError
        ? t('zonesLoadFailedPlaceholder')
        : zones.length
          ? t('zoneSelect')
          : t('zonesEmptyPlaceholder');
  const zoneLabel = (zone: string) => (t.has(`zone_${zone}`) ? t(`zone_${zone}`) : zone);
  useEffect(() => {
    const abort = new AbortController();
    setZones([]);
    setZonesError(false);
    if (kind !== 'purchase' || !carrierId) {
      setZonesLoading(false);
      return () => abort.abort();
    }
    setZonesLoading(true);
    void freightTariffApi
      .zoneCodes(carrierId, abort.signal)
      .then((codes) => {
        if (!abort.signal.aborted) setZones(codes);
      })
      .catch(() => {
        if (!abort.signal.aborted) setZonesError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setZonesLoading(false);
      });
    return () => abort.abort();
  }, [carrierId, kind, zonesRevision]);
  // Zone options load after the form; re-apply the saved zone once its option exists,
  // otherwise the native select shows (and submits) the first option instead.
  useEffect(() => {
    const zone = form.getValues('zone');
    if (zone && zones.includes(zone)) form.setValue('zone', zone);
  }, [zones, form]);
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
      setError(t('saveError'));
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
    setError('');
  }
  async function save(values: TariffFormValues) {
    setError('');
    try {
      if (kind === 'purchase') {
        if (zonesLoading || zonesError || !zones.includes(values.zone)) {
          form.setError('zone', { message: t('invalidZone') });
          return;
        }
        const service = services.find((s) => s.id === values.serviceId);
        if (!service) throw new Error('Missing service');
        await freightTariffApi.savePurchase(purchaseInput(values, service), expected);
      } else await freightTariffApi.saveSell(sellerInput(values), expected);
      onSaved();
    } catch (failure) {
      const messages: Record<string, string> = {
        'RATING.INVALID_ZONE': 'invalidZone',
        'RATING.INVALID_SERVICE_POLICY': 'invalidServicePolicy',
        'RATING.STALE_OR_PUBLISHED': 'staleSave',
        'AUTH.FORBIDDEN': 'saveForbidden',
      };
      setError(
        t(failure instanceof ApiError ? (messages[failure.code] ?? 'saveError') : 'saveError'),
      );
      setConflict(failure instanceof ApiError && failure.status === 409);
    }
  }
  const numberOptions = { valueAsNumber: true } as const;
  const nullableOptions = {
    setValueAs: (v: unknown) => (v === '' || v === null ? null : Number(v)),
  };
  const title = row ? 'edit' : template ? 'repriceTitle' : 'create';
  return (
    <Modal isOpen onClose={onClose} title={t(title)} width="880px">
      <form className="space-y-6" onSubmit={form.handleSubmit(save)}>
        {error && <Alert variant="error">{error}</Alert>}
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
        {template && !row && <Alert variant="info">{t('repriceHint')}</Alert>}
        {Object.keys(errors).length > 0 && <Alert variant="error">{t('validation')}</Alert>}
        <RequiredNote />

        <Section title={t(kind === 'purchase' ? 'sectionService' : 'sectionSeller')}>
          <div className="grid gap-4 md:grid-cols-2">
            {kind === 'purchase' ? (
              <>
                <Select
                  label={t('service')}
                  isRequired
                  options={services.map((s) => ({
                    value: s.id,
                    label: `${s.carrier.name} · ${s.name}`,
                  }))}
                  {...bindField('serviceId', {
                    onChange: (e) => {
                      const s = services.find((s) => s.id === e.target.value);
                      if (s) form.setValue('policy.divisor', s.volumetricDivisor);
                      form.setValue('zone', '');
                      form.clearErrors('zone');
                    },
                  })}
                />
                <div className="space-y-2">
                  <Select
                    label={t('zone')}
                    isRequired
                    placeholder={zonePlaceholder}
                    options={zones.map((zone) => ({ value: zone, label: zoneLabel(zone) }))}
                    {...bindField('zone')}
                    disabled={!carrierId || zonesLoading || zonesError || !zones.length}
                  />
                  {carrierId && !zonesLoading && (zonesError || !zones.length) && (
                    <Alert variant={zonesError ? 'error' : 'warning'}>
                      {t(zonesError ? 'zonesError' : 'zonesEmpty')}
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setZonesRevision((n) => n + 1)}
                        >
                          {t('reloadZones')}
                        </Button>
                        {!zonesError && can('platform.carriers.manage') && (
                          <a
                            href="/admin/carriers"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[var(--sc-primary)] underline"
                          >
                            {t('manageZones')}
                          </a>
                        )}
                      </div>
                    </Alert>
                  )}
                </div>
              </>
            ) : (
              <>
                <Input
                  label={t('code')}
                  isRequired
                  placeholder={t('codeHint')}
                  {...bindField('code')}
                />
                <Input
                  label={t('versionNo')}
                  isRequired
                  type="number"
                  {...bindField('versionNo', numberOptions)}
                />
                <Input
                  label={t('referenceSource')}
                  isRequired
                  placeholder={t('referenceSourceHint')}
                  className="md:col-span-2"
                  {...bindField('referenceSource')}
                />
              </>
            )}
          </div>
        </Section>

        <Section title={t('sectionTime')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t('effectiveFrom')}
              isRequired
              helperText={t('effectiveFromHint')}
              type="datetime-local"
              {...bindField('effectiveFrom')}
            />
            <Input
              label={t('effectiveTo')}
              helperText={t('effectiveToHint')}
              type="datetime-local"
              {...bindField('effectiveTo')}
            />
          </div>
        </Section>

        <Section title={t('sectionPrices')}>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('bandHelp')}</p>
          {fields.map((field, index) => {
            const hint = (key: string) => (index === 0 ? t(key) : undefined);
            return (
              <fieldset
                key={field.id}
                className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
              >
                <legend className="float-left flex w-full items-center justify-between gap-3 text-sm font-semibold">
                  {t('band', { number: index + 1 })}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title={t('removeBand')}
                    aria-label={`${t('removeBand')} ${index + 1}`}
                    disabled={fields.length === 1 || form.formState.isSubmitting}
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </legend>
                <div className="clear-both grid gap-3 md:grid-cols-3">
                  {kind === 'sell' && (
                    <>
                      <Select
                        label={t('direction')}
                        isRequired
                        options={['OUTBOUND', 'RETURN'].map((value) => ({
                          value,
                          label: t(`direction_${value}`),
                        }))}
                        {...bindField(`bands.${index}.direction`)}
                      />
                      <Select
                        label={t('lane')}
                        isRequired
                        options={['INTRA_PROVINCE', 'INTRA_REGION', 'INTER_REGION'].map(
                          (value) => ({
                            value,
                            label: t(`lane_${value}`),
                          }),
                        )}
                        {...bindField(`bands.${index}.laneCode`)}
                      />
                    </>
                  )}
                  <Input
                    label={t('minWeight')}
                    isRequired
                    helperText={hint('minWeightHint')}
                    type="number"
                    {...bindField(`bands.${index}.minWeightG`, numberOptions)}
                  />
                  <Input
                    label={t('maxWeight')}
                    helperText={hint('maxWeightHint')}
                    type="number"
                    {...bindField(`bands.${index}.maxWeightG`, nullableOptions)}
                  />
                  <Input
                    label={t('includedWeight')}
                    isRequired
                    helperText={hint('includedWeightHint')}
                    type="number"
                    {...bindField(`bands.${index}.includedWeightG`, numberOptions)}
                  />
                  <Input
                    label={t('basePrice')}
                    isRequired
                    {...bindField(`bands.${index}.basePriceVnd`)}
                  />
                  <Input
                    label={t('stepWeight')}
                    isRequired
                    helperText={hint('stepWeightHint')}
                    type="number"
                    {...bindField(`bands.${index}.stepWeightG`, numberOptions)}
                  />
                  <Input
                    label={t('stepPrice')}
                    isRequired
                    {...bindField(`bands.${index}.stepPriceVnd`)}
                  />
                  {kind === 'sell' && (
                    <>
                      <Input
                        label={t('referenceBase')}
                        isRequired
                        helperText={hint('referenceBaseHint')}
                        {...bindField(`bands.${index}.referenceBaseVnd`)}
                      />
                      <Input
                        label={t('referenceStep')}
                        isRequired
                        helperText={hint('referenceStepHint')}
                        {...bindField(`bands.${index}.referenceStepVnd`)}
                      />
                    </>
                  )}
                </div>
                {kind === 'sell' && (
                  <Advanced
                    title={t('bandPolicy')}
                    hint={t('advancedHint')}
                    hasError={!!errors.bands?.[index]?.policy}
                  >
                    <Input
                      label={t('divisor')}
                      isRequired
                      helperText={hint('divisorHint')}
                      type="number"
                      {...bindField(`bands.${index}.policy.divisor`, numberOptions)}
                    />
                    <Input
                      label={t('rounding')}
                      isRequired
                      helperText={hint('roundingHint')}
                      type="number"
                      {...bindField(`bands.${index}.policy.roundingGram`, numberOptions)}
                    />
                    <Input
                      label={t('returnFee')}
                      isRequired
                      helperText={hint('returnFeeHint')}
                      {...bindField(`bands.${index}.policy.returnFeeVnd`)}
                    />
                    <Input
                      label={t('declaredFee')}
                      isRequired
                      helperText={hint('declaredFeeHint')}
                      type="number"
                      {...bindField(`bands.${index}.policy.declaredValuePpm`, numberOptions)}
                    />
                  </Advanced>
                )}
              </fieldset>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            disabled={fields.length >= 100 || form.formState.isSubmitting}
            onClick={() => append(emptyBand())}
          >
            <Plus size={16} />
            {t('addBand')}
          </Button>
        </Section>

        {kind === 'purchase' && (
          <Advanced
            title={t('sectionAdvanced')}
            hint={t('advancedHint')}
            hasError={!!(errors.volumeTierMin || errors.volumeTierMax || errors.policy)}
          >
            <Input
              label={t('volumeMin')}
              isRequired
              helperText={t('volumeMinHint')}
              type="number"
              {...bindField('volumeTierMin', numberOptions)}
            />
            <Input
              label={t('volumeMax')}
              helperText={t('volumeMaxHint')}
              type="number"
              {...bindField('volumeTierMax', nullableOptions)}
            />
            <Input
              label={t('divisor')}
              isRequired
              helperText={t('divisorHint')}
              type="number"
              {...bindField('policy.divisor', numberOptions)}
            />
            <Input
              label={t('rounding')}
              isRequired
              helperText={t('roundingHint')}
              type="number"
              {...bindField('policy.roundingGram', numberOptions)}
            />
            <Input
              label={t('returnFee')}
              isRequired
              helperText={t('returnFeeHint')}
              {...bindField('policy.returnFeeVnd')}
            />
            <Input
              label={t('declaredFee')}
              isRequired
              helperText={t('declaredFeeHint')}
              type="number"
              {...bindField('policy.declaredValuePpm', numberOptions)}
            />
          </Advanced>
        )}

        <div className="flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
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
            disabled={
              !!fresh ||
              refreshing ||
              (kind === 'purchase' && (zonesLoading || zonesError || !zones.length))
            }
            isLoading={form.formState.isSubmitting}
          >
            {t('saveDraft')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
