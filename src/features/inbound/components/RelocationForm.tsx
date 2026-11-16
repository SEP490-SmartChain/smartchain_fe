import { useCallback, useEffect, useRef, useState } from 'react';

import { Controller, useForm, useWatch } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Select,
} from '@/components/Common';
import { SearchableSelect } from '@/components/Common/Select/SearchableSelect';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { relocationApi, type RelocationInput, type RelocationPosition } from '../api/relocationApi';
import { manualRelocationConfirmation, type RelocationBin } from '../lib/relocationConfirmation';
import { createRelocationFormSchema } from '../schemas/relocationSchema';

const SCANS = ['fromBinScan', 'toBinScan', 'skuScan', 'lotScan'] as const;
const REASONS = ['REARRANGE', 'CAPACITY', 'CHECK', 'OTHER'] as const;
interface Props {
  warehouse: string;
  source: RelocationPosition;
  disabled: boolean;
  onLock: (locked: boolean) => void;
  onSaved: () => void;
  onClose: () => void;
}

export function RelocationForm({ warehouse, source, disabled, onLock, onSaved, onClose }: Props) {
  const t = useTranslations('Relocation');
  const user = useAuthStore((state) => state.user);
  const [bins, setBins] = useState<RelocationBin[]>([]);
  const [moreBins, setMoreBins] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [attempt, setAttempt] = useState<RelocationInput | null>(null);
  const [destination, setDestination] = useState<RelocationBin | null>(null);
  const [mode, setMode] = useState<'MANUAL' | 'SCAN'>('MANUAL');
  const [confirmed, setConfirmed] = useState(false);
  const [reasonChoice, setReasonChoice] = useState('');
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const schema = createRelocationFormSchema(source);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<RelocationInput>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      operationKey: createUuid(),
      expectedVersion: source.version,
      toBinId: '',
      fromBinScan: '',
      toBinScan: '',
      skuScan: '',
      lotScan: '',
      reason: '',
    },
  });
  const quantity = useWatch({ control, name: 'qty' });
  const quantityValid = schema.shape.qty.safeParse(quantity).success;
  const quantityError = errors.qty || (quantity !== undefined && !quantityValid);
  const searching = query.trim() !== search;
  const noDestinations = !loading && !loadError && !search && bins.length === 0;
  const options =
    destination && !bins.some((bin) => bin.id === destination.id) ? [destination, ...bins] : bins;
  const changeSearch = useCallback((value: string) => setQuery(value.slice(0, 64)), []);

  function confirmPhysical(checked: boolean, target = destination) {
    const values = manualRelocationConfirmation(source, target, checked);
    for (const field of SCANS) setValue(field, values[field]);
    setConfirmed(checked && target !== null && target.id !== source.fromBinId);
    if (checked) clearErrors([...SCANS]);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController(),
      version = ++generation.current;
    active.current = controller;
    return () => {
      generation.current = version + 1;
      controller.abort();
    };
  }, [warehouse, source.id, user]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    void relocationApi
      .bins(warehouse, source.id, search, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && user === useAuthStore.getState().user) {
          setBins(data.bins);
          setMoreBins(data.moreBins);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setBins([]);
          setLoadError(reason instanceof ApiError ? reason.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [warehouse, source.id, search, user, retry, t]);
  useEffect(() => {
    onLock(busy || attempt !== null);
    return () => onLock(false);
  }, [busy, attempt, onLock]);

  async function send(input: RelocationInput) {
    if (disabled || busy || user !== useAuthStore.getState().user) return;
    if (
      !attempt &&
      (loadError ||
        loading ||
        searching ||
        destination?.id !== input.toBinId ||
        (mode === 'MANUAL' && !confirmed))
    ) {
      return;
    }
    const version = generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await relocationApi.post(warehouse, source, input, active.current?.signal);
      if (version !== generation.current || user !== useAuthStore.getState().user) return;
      setAttempt(null);
      toast.success(t('success', { qty: result.qty }));
      onSaved();
    } catch (reason: unknown) {
      if (version !== generation.current || user !== useAuthStore.getState().user) return;
      setError(reason instanceof ApiError ? reason.message : t('saveError'));
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setAttempt(null);
        if ([403, 404, 409].includes(reason.status)) onSaved();
      } else setAttempt(input);
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{t('moveTitle')}</h3>
            <p className="mb-1 mt-2 font-medium">{source.productName}</p>
            <p className="break-all text-xs text-[var(--sc-text-secondary)]">
              {source.sku} · {t('lotLabel')}: {source.lotCode}
            </p>
          </div>
          <Badge
            status={source.stockState === 'QUARANTINE' ? 'warning' : 'success'}
            label={t(`state.${source.stockState}`)}
          />
        </div>
        <p className="rounded-lg bg-[var(--sc-bg-secondary)] p-3 text-sm">
          {t('source', {
            bin: source.fromBinCode,
            qty: source.availableQty,
            state: t(`state.${source.stockState}`),
          })}
        </p>
        {source.stockState === 'QUARANTINE' && (
          <Alert variant="warning">{t('quarantineHint')}</Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        {attempt ? (
          <>
            <Alert variant="warning">{t('unknown')}</Alert>
            <Button disabled={busy || disabled} isLoading={busy} onClick={() => void send(attempt)}>
              {t('retry')}
            </Button>
          </>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={handleSubmit((input) => void send(input))}
          >
            <Controller
              control={control}
              name="toBinId"
              render={({ field }) => (
                <SearchableSelect
                  label={t('destination')}
                  required
                  value={field.value}
                  options={options.map((bin) => ({ value: bin.id, label: bin.code }))}
                  placeholder={t('destinationPlaceholder')}
                  searchPlaceholder={t('destinationSearch')}
                  emptyMessage={t('noSearchResults')}
                  onSearchChange={changeSearch}
                  loading={loading || searching}
                  loadingMessage={t('loadingDestinations')}
                  searchMaxLength={64}
                  helperText={moreBins ? t('moreBins') : t('destinationHint')}
                  disabled={busy || disabled}
                  error={errors.toBinId ? t('required') : undefined}
                  onChange={(id) => {
                    const bin = options.find((item) => item.id === id) ?? null;
                    field.onChange(id);
                    setDestination(bin);
                    confirmPhysical(false, bin);
                  }}
                />
              )}
            />
            {loadError && (
              <Alert variant="error" title={loadError}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => setRetry((value) => value + 1)}
                >
                  {t('reloadDestinations')}
                </Button>
              </Alert>
            )}
            {noDestinations ? (
              <>
                <Alert variant="info">
                  {t(
                    source.stockState === 'QUARANTINE'
                      ? 'noQuarantineDestinations'
                      : 'noDestinations',
                  )}
                </Alert>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || disabled}
                  onClick={onClose}
                >
                  {t('cancel')}
                </Button>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={t('quantity')}
                    type="number"
                    required
                    min={1}
                    max={source.availableQty}
                    step={1}
                    inputMode="numeric"
                    disabled={busy || disabled}
                    {...register('qty', { valueAsNumber: true })}
                    helperText={t('quantityLimit', { max: source.availableQty })}
                    error={
                      quantityError ? t('quantityError', { max: source.availableQty }) : undefined
                    }
                  />
                  <Select
                    label={t('reason')}
                    required
                    disabled={busy || disabled}
                    value={reasonChoice}
                    options={REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }))}
                    onChange={(event) => {
                      setReasonChoice(event.target.value);
                      setValue(
                        'reason',
                        event.target.value === 'OTHER' ? '' : t(`reasons.${event.target.value}`),
                        { shouldValidate: true },
                      );
                    }}
                    error={errors.reason && reasonChoice !== 'OTHER' ? t('reasonError') : undefined}
                  />
                </div>
                {reasonChoice === 'OTHER' && (
                  <Input
                    label={t('customReason')}
                    required
                    maxLength={500}
                    disabled={busy || disabled}
                    {...register('reason')}
                    error={errors.reason ? t('reasonError') : undefined}
                  />
                )}
                <Select
                  label={t('confirmationMode')}
                  value={mode}
                  disabled={busy || disabled}
                  options={[
                    { value: 'MANUAL', label: t('manualMode') },
                    { value: 'SCAN', label: t('scanMode') },
                  ]}
                  onChange={(event) => {
                    setMode(event.target.value as 'MANUAL' | 'SCAN');
                    confirmPhysical(false);
                  }}
                />
                {mode === 'MANUAL' ? (
                  <Checkbox
                    label={t('physicalConfirmation')}
                    required
                    checked={confirmed}
                    disabled={
                      busy || disabled || !destination || loading || searching || !!loadError
                    }
                    onChange={(event) => confirmPhysical(event.target.checked)}
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {SCANS.map((name) => (
                      <Input
                        key={name}
                        label={t(
                          (
                            {
                              fromBinScan: 'fromScan',
                              toBinScan: 'toScan',
                              skuScan: 'skuScan',
                              lotScan: 'lotScan',
                            } as const
                          )[name],
                        )}
                        required
                        disabled={busy || disabled}
                        {...register(name)}
                        error={errors[name] ? t('required') : undefined}
                      />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || disabled}
                    onClick={onClose}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    type="submit"
                    isLoading={busy}
                    disabled={
                      busy ||
                      disabled ||
                      loading ||
                      searching ||
                      !!loadError ||
                      !quantityValid ||
                      !destination ||
                      (mode === 'MANUAL' && !confirmed)
                    }
                  >
                    {t('confirm')}
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
