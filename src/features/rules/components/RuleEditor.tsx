import { useEffect, useRef, useState } from 'react';

import { Controller, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { Radio } from '@/components/Common/Radio/Radio';
import { Select } from '@/components/Common/Select/Select';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ConditionEditor } from './ConditionEditor';
import { RuleSentence } from './RuleSentence';
import { ruleApi } from '../api/ruleApi';
import { ruleFormSchema, toDefinition, type RuleFormValues } from '../schemas/ruleSchema';

import type { RuleKind, RuleRecord, RuleTarget, TargetKind } from '../types/rule.types';

const ALLOCATION_STRATEGIES = ['NEAREST_WAREHOUSE', 'EXPIRY_FIRST', 'TOTAL_COST'] as const;

interface StepTitleProps {
  number: number;
  title: string;
  hint?: string;
}
function StepTitle({ number, title, hint }: StepTitleProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sc-primary)] text-sm font-semibold text-white">
        {number}
      </span>
      <div>
        <h3 className="text-base font-semibold text-[var(--sc-text-primary)]">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-[var(--sc-text-secondary)]">{hint}</p>}
      </div>
    </div>
  );
}

interface RuleEditorProps {
  rule: RuleRecord | null;
  kind: RuleKind;
  nextPriority: number;
  onClose: () => void;
  onSaved: () => void;
}
export function RuleEditor({ rule, kind, nextPriority, onClose, onSaved }: RuleEditorProps) {
  const t = useTranslations('Rules');
  const operationKey = useRef<string | null>(null);
  const [current, setCurrent] = useState(rule);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [options, setOptions] = useState<Record<TargetKind, RuleTarget[]>>({
    WAREHOUSE: [],
    CARRIER_SERVICE: [],
  });
  const [cursors, setCursors] = useState<Record<TargetKind, string | null>>({
    WAREHOUSE: null,
    CARRIER_SERVICE: null,
  });
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const principal = useAuthStore((s) => s.user);
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema(t('invalid'), !!rule)),
    defaultValues: {
      name: rule?.name ?? '',
      kind: rule?.kind ?? kind,
      warehouseId: rule?.warehouseId ?? '',
      exceptionTenantId: rule?.exceptionTenantId ?? '',
      priority: rule?.priority ?? nextPriority,
      condition: rule?.condition ?? { kind: 'ALL', conditions: [] },
      strategy: rule && 'strategy' in rule.action ? rule.action.strategy : 'NEAREST_WAREHOUSE',
      carrierServiceId:
        rule && 'carrierServiceId' in rule.action ? rule.action.carrierServiceId : '',
      fallbackServiceIds:
        rule && 'fallbackServiceIds' in rule.action ? rule.action.fallbackServiceIds : [],
      reason: '',
    },
  });
  const ruleKind = watch('kind');
  const fallbackIds = watch('fallbackServiceIds');
  const primary = watch('carrierServiceId');
  const condition = watch('condition');
  const strategy = watch('strategy');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setOptionsLoading(true);
    setOptionsError(null);
    void Promise.all(
      (['WAREHOUSE', 'CARRIER_SERVICE'] as const).map(async (type) => ({
        type,
        page: await ruleApi.targets(type, undefined, controller.signal),
      })),
    )
      .then((results) => {
        if (!active) return;
        for (const { type, page } of results) {
          setOptions((prev) => ({ ...prev, [type]: page.items }));
          setCursors((prev) => ({
            ...prev,
            [type]: page.pagination.hasNext ? page.pagination.nextCursor : null,
          }));
        }
      })
      .catch((failure) => {
        if (active) setOptionsError(failure instanceof ApiError ? failure.message : t('loadError'));
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [principal, t, optionsRetry]);
  const loadMore = async (type: TargetKind) => {
    const cursor = cursors[type];
    if (!cursor || optionsLoading) return;
    const identity = useAuthStore.getState().user;
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const page = await ruleApi.targets(type, cursor);
      if (identity !== useAuthStore.getState().user) return;
      setOptions((prev) => ({
        ...prev,
        [type]: [
          ...prev[type],
          ...page.items.filter((n) => !prev[type].some((p) => p.id === n.id)),
        ],
      }));
      setCursors((prev) => ({
        ...prev,
        [type]: page.pagination.hasNext ? page.pagination.nextCursor : null,
      }));
    } catch (failure) {
      if (identity === useAuthStore.getState().user) {
        setOptionsError(failure instanceof ApiError ? failure.message : t('loadError'));
      }
    } finally {
      if (identity === useAuthStore.getState().user) setOptionsLoading(false);
    }
  };
  const save = handleSubmit(async (values) => {
    const identity = useAuthStore.getState().user;
    setError(null);
    try {
      if (current) await ruleApi.edit(current, toDefinition(values), values.reason);
      else {
        operationKey.current ??= createUuid();
        await ruleApi.create(
          operationKey.current,
          toDefinition(values),
          values.reason.trim() || t('createReasonDefault'),
        );
      }
      if (identity === useAuthStore.getState().user) onSaved();
    } catch (failure) {
      if (identity !== useAuthStore.getState().user) return;
      setError(failure instanceof ApiError ? failure.message : t('saveError'));
      setStale(failure instanceof ApiError && failure.code === 'RULES.STALE_VERSION');
    }
  });
  const reloadLatest = async () => {
    if (!current) return;
    const identity = useAuthStore.getState().user;
    setReloading(true);
    try {
      const latest = await ruleApi.get(current.id);
      if (identity !== useAuthStore.getState().user) return;
      setCurrent(latest);
      setStale(false);
      setError(null);
    } catch (failure) {
      if (identity === useAuthStore.getState().user) {
        setError(failure instanceof ApiError ? failure.message : t('loadError'));
      }
    } finally {
      if (identity === useAuthStore.getState().user) setReloading(false);
    }
  };
  const warehouses = options.WAREHOUSE;
  const services = options.CARRIER_SERVICE;
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));
  if (rule?.warehouseId && !warehouseOptions.some((w) => w.value === rule.warehouseId)) {
    warehouseOptions.push({
      value: rule.warehouseId,
      label: t('unavailableReference', { id: rule.warehouseId }),
    });
  }
  const serviceOptions = services.map((s) => ({ value: s.id, label: s.name }));
  for (const id of [primary, ...fallbackIds]) {
    if (id && !serviceOptions.some((s) => s.value === id)) {
      serviceOptions.push({ value: id, label: t('unavailableReference', { id }) });
    }
  }
  const busy = isSubmitting || reloading;
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title={current ? t('editRule') : t('createRule')}
      width="1040px"
    >
      <form onSubmit={save} className="space-y-5">
        <Alert>
          {t('draftNotice')}
          {current && (
            <span className="ml-1">{t('reviewVersion', { version: current.version })}</span>
          )}
        </Alert>
        {error && (
          <Alert variant="error">
            {error}
            {stale && (
              <div className="mt-3 space-y-2">
                <p>{t('staleNotice')}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void reloadLatest()}
                  isLoading={reloading}
                >
                  {t('reloadVersion')}
                </Button>
              </div>
            )}
          </Alert>
        )}
        {current && rule && current.version !== rule.version && (
          <Alert variant="warning">
            {t('versionUpdated', { version: current.version })}
            <details className="mt-2">
              <summary>{t('serverDefinition')}</summary>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(
                  {
                    name: current.name,
                    warehouseId: current.warehouseId,
                    exceptionTenantId: current.exceptionTenantId,
                    condition: current.condition,
                    action: current.action,
                    priority: current.priority,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </Alert>
        )}
        <section className="space-y-3">
          <StepTitle number={1} title={t('stepName')} />
          <input type="hidden" {...register('kind')} />
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Input
              label={t('name')}
              placeholder={t(
                ruleKind === 'ALLOCATION' ? 'namePlaceholderAllocation' : 'namePlaceholder',
              )}
              {...register('name')}
              error={errors.name?.message}
              disabled={busy}
            />
            <div>
              <p className="mb-1.5 text-sm font-medium text-[var(--sc-text-primary)]">
                {t('type')}
              </p>
              <Badge status="info" variant="solid" label={t(`types.${ruleKind}`)} />
            </div>
          </div>
          <details
            className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3"
            open={!!(errors.warehouseId || errors.exceptionTenantId || errors.priority)}
          >
            <summary className="cursor-pointer text-sm font-medium text-[var(--sc-text-primary)]">
              {t('advanced')}
            </summary>
            <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">{t('advancedHint')}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Select
                label={t('warehouse')}
                {...register('warehouseId')}
                options={warehouseOptions}
                placeholder={t('allWarehouses')}
                isPlaceholderDisabled={false}
                disabled={busy || !!rule}
                error={errors.warehouseId?.message}
                helperText={t('warehouseHint')}
              />
              <Input
                label={t('sellerException')}
                {...register('exceptionTenantId')}
                helperText={t('sellerHint')}
                disabled={busy}
                error={errors.exceptionTenantId?.message}
              />
            </div>
            <p className="mt-3 text-sm text-[var(--sc-text-secondary)]">{t('priorityHint')}</p>
          </details>
        </section>
        {optionsLoading && (
          <p role="status" className="text-sm">
            {t('loadingOptions')}
          </p>
        )}
        {optionsError && (
          <Alert variant="error">
            {optionsError}
            <Button type="button" variant="outline" onClick={() => setOptionsRetry((n) => n + 1)}>
              {t('retry')}
            </Button>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          {cursors.WAREHOUSE && (
            <Button
              type="button"
              variant="outline"
              disabled={optionsLoading}
              onClick={() => void loadMore('WAREHOUSE')}
            >
              {t('moreWarehouses')}
            </Button>
          )}
          {cursors.CARRIER_SERVICE && (
            <Button
              type="button"
              variant="outline"
              disabled={optionsLoading}
              onClick={() => void loadMore('CARRIER_SERVICE')}
            >
              {t('moreServices')}
            </Button>
          )}
        </div>
        <section className="space-y-3">
          <StepTitle number={2} title={t('stepWhen')} hint={t('stepWhenHint')} />
          <Controller
            name="condition"
            control={control}
            render={({ field }) => (
              <ConditionEditor
                value={
                  field.value.kind === 'PREDICATE'
                    ? { kind: 'ALL', conditions: [field.value] }
                    : field.value
                }
                onChange={field.onChange}
                warehouses={warehouses}
                disabled={busy}
              />
            )}
          />
          {errors.condition && (
            <p role="alert" className="text-sm text-[var(--sc-error)]">
              {t('conditionInvalid')}
            </p>
          )}
        </section>
        <section className="space-y-3">
          <StepTitle number={3} title={t('stepThen')} hint={t(`stepThenHint.${ruleKind}`)} />
          {ruleKind === 'ALLOCATION' ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-[var(--sc-text-primary)]">
                {t('strategy')}
              </legend>
              {ALLOCATION_STRATEGIES.map((value) => (
                <div
                  key={value}
                  onClick={() => {
                    if (!busy) setValue('strategy', value, { shouldDirty: true });
                  }}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                    strategy === value
                      ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-lighter)]'
                      : 'border-[var(--sc-border-default)]'
                  }`}
                >
                  <Radio
                    value={value}
                    label={t(`strategies.${value}`)}
                    {...register('strategy')}
                    disabled={busy}
                  />
                  <p className="ml-7 mt-1 text-sm text-[var(--sc-text-secondary)]">
                    {t(`strategyDescriptions.${value}`)}
                  </p>
                </div>
              ))}
            </fieldset>
          ) : (
            <div className="space-y-3">
              <Select
                label={t('primaryService')}
                {...register('carrierServiceId')}
                options={serviceOptions}
                error={errors.carrierServiceId?.message}
                disabled={busy}
              />
              <p className="text-sm text-[var(--sc-text-secondary)]">{t('fallbackHint')}</p>
              {fallbackIds.length === 0 && (
                <p className="rounded-lg border border-dashed border-[var(--sc-border-default)] px-3 py-2.5 text-sm text-[var(--sc-text-secondary)]">
                  {t('fallbackEmpty')}
                </p>
              )}
              {fallbackIds.map((id, index) => (
                <div
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-3 py-2"
                >
                  <Badge
                    status="default"
                    variant="solid"
                    label={t('fallbackItem', { number: index + 1 })}
                  />
                  <span className="min-w-0 flex-1 break-words text-sm font-medium">
                    {serviceOptions.find((s) => s.value === id)?.label ?? id}
                  </span>
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    disabled={busy || index === 0}
                    onClick={() => {
                      const values = [...fallbackIds];
                      [values[index - 1], values[index]] = [id, values[index - 1] ?? id];
                      setValue('fallbackServiceIds', values, { shouldValidate: true });
                    }}
                  >
                    {t('moveUp')}
                  </Button>
                  <Button
                    type="button"
                    variant="softDanger"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      setValue(
                        'fallbackServiceIds',
                        fallbackIds.filter((v) => v !== id),
                        { shouldValidate: true },
                      )
                    }
                  >
                    {t('remove')}
                  </Button>
                </div>
              ))}
              <Select
                label={t('addFallback')}
                value=""
                options={serviceOptions.filter(
                  (s) => s.value !== primary && !fallbackIds.includes(s.value),
                )}
                disabled={busy || fallbackIds.length >= 10}
                onChange={(e) =>
                  setValue('fallbackServiceIds', [...fallbackIds, e.target.value], {
                    shouldValidate: true,
                  })
                }
              />
            </div>
          )}
        </section>
        <section className="space-y-2 rounded-xl border border-[var(--sc-primary-light)] bg-[var(--sc-primary-alpha-08)] p-4">
          <p className="text-xs font-semibold tracking-wide text-[var(--sc-text-secondary)] uppercase">
            {t('preview')}
          </p>
          {ruleKind === 'CARRIER' && !primary ? (
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('previewNeedService')}</p>
          ) : (
            <RuleSentence
              condition={condition}
              action={
                ruleKind === 'ALLOCATION'
                  ? { strategy }
                  : { carrierServiceId: primary, fallbackServiceIds: fallbackIds }
              }
              serviceNames={Object.fromEntries(serviceOptions.map((o) => [o.value, o.label]))}
              areServicesReady={false}
            />
          )}
        </section>
        <Input
          label={t(rule ? 'reason' : 'reasonOptional')}
          placeholder={t(rule ? 'reasonPlaceholder' : 'reasonOptionalPlaceholder')}
          {...register('reason')}
          error={errors.reason?.message}
          disabled={busy}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={busy || stale}>
            {t('saveDraft')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
