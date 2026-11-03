import { useEffect, useRef, useState } from 'react';

import { useForm, useWatch } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp, RefreshCw, Warehouse } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Button, Card, Select } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './ReceiptWorkspace.module.css';
import {
  receiptStockApi,
  receiptStockInputSchema,
  type ReceiptStockInput,
  type ReceiptStockState,
} from '../api/receiptStockApi';
interface Props {
  onPendingChange?: (key: string, locked: boolean) => void;
  warehouseId: string;
  asnId: string;
  recordId: string;
  receiptId: string;
  canWrite: boolean;
  onSaved: () => void;
}
export function ReceiptStockPanel({
  onPendingChange,
  warehouseId,
  asnId,
  recordId,
  receiptId,
  canWrite,
  onSaved,
}: Props) {
  const t = useTranslations('Receiving'),
    owner = useAuthStore((s) => s.user);
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false),
    [state, setState] = useState<ReceiptStockState | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [primaryZoneId, setPrimaryZoneId] = useState(''),
    [quarantineZoneId, setQuarantineZoneId] = useState('');
  const [attempt, setAttempt] = useState<{
    input: ReceiptStockInput;
    receipt: string;
    quantity: number;
  } | null>(null);
  useEffect(() => {
    onPendingChange?.(`stock:${recordId}`, busy || attempt !== null);
    return () => onPendingChange?.(`stock:${recordId}`, false);
  }, [onPendingChange, recordId, busy, attempt]);
  const generation = useRef(0),
    active = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<ReceiptStockInput>({
    resolver: zodResolver(receiptStockInputSchema),
    defaultValues: { operationKey: createUuid(), expectedVersion: 1, binId: '' },
  });
  const [binId, quarantineBinId] = useWatch({ control, name: ['binId', 'quarantineBinId'] });
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    active.current = controller;
    setState(null);
    setAttempt(null);
    setBusy(false);
    setError('');
    setLoadError('');
    setPrimaryZoneId('');
    setQuarantineZoneId('');
    reset({ operationKey: createUuid(), expectedVersion: 1, binId: '' });
    return () => {
      generation.current = version + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, recordId, receiptId, owner, reset]);
  useEffect(() => {
    if (!expanded) return;
    const version = generation.current,
      controller = new AbortController();
    setLoading(true);
    void receiptStockApi
      .get(warehouseId, asnId, recordId, receiptId, controller.signal)
      .then((result) => {
        if (
          !controller.signal.aborted &&
          version === generation.current &&
          owner === useAuthStore.getState().user
        ) {
          setState(result);
          setLoadError('');
          if (!attempt) {
            reset({
              operationKey: createUuid(),
              expectedVersion: result.receiptVersion,
              binId: '',
            });
          }
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted && version === generation.current) {
          setLoadError(e instanceof ApiError ? e.message : t('stockError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && version === generation.current) setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, warehouseId, asnId, recordId, receiptId, owner, refresh, attempt, reset, t]);
  async function send(command: { input: ReceiptStockInput; receipt: string; quantity: number }) {
    if (
      busy ||
      !canWrite ||
      (!attempt && !state?.canPost) ||
      owner !== useAuthStore.getState().user
    ) {
      return;
    }
    if (!attempt && state) {
      const primary = state.bins.find((bin) => bin.id === command.input.binId);
      const quarantine = state.bins.find((bin) => bin.id === command.input.quarantineBinId);
      const blocker =
        primary?.primaryBlocker ??
        (state.load.quarantineQty > 0 ? quarantine?.quarantineBlocker : null);
      if (!primary || (state.load.quarantineQty > 0 && !quarantine) || blocker) {
        setError(blocker ? t(`stockBinBlock${blocker}`) : t('stockSelectBin'));
        return;
      }
    }
    const version = generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await receiptStockApi.post(
        warehouseId,
        asnId,
        recordId,
        command.receipt,
        command.quantity,
        command.input,
        active.current?.signal,
      );
      if (version !== generation.current || owner !== useAuthStore.getState().user) return;
      toast.success(t('stockSuccess', { quantity: result.recognizedQty }));
      setAttempt(null);
      setRefresh((v) => v + 1);
      onSaved();
    } catch (e: unknown) {
      if (version !== generation.current || owner !== useAuthStore.getState().user) return;
      setError(e instanceof ApiError ? e.message : t('stockError'));
      if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status)) {
        setAttempt(null);
        setState(null);
        setRefresh((v) => v + 1);
      } else setAttempt(command);
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  const panelId = `stock-${recordId}`;
  const quarantineZones = state?.zones.filter((zone) => zone.zoneType === 'QUARANTINE') ?? [];
  const primaryZones =
    state && !state.load.primaryRequiresQuarantine ? state.zones : quarantineZones;
  const primaryBins = state?.bins.filter((bin) => bin.zoneId === primaryZoneId) ?? [];
  const quarantineBins = state?.bins.filter((bin) => bin.zoneId === quarantineZoneId) ?? [];
  const hasSplitQty = (state?.load.quarantineQty ?? 0) > 0;
  const primaryBin = primaryBins.find((bin) => bin.id === binId);
  const quarantineBin = quarantineBins.find((bin) => bin.id === quarantineBinId);
  const canSubmit =
    !!primaryBin &&
    primaryBin.primaryBlocker === null &&
    (!hasSplitQty ||
      (!!quarantineBin &&
        quarantineBin.quarantineBlocker === null &&
        quarantineBin.id !== primaryBin.id));
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  const format = (value: string | number) => formatter.format(Number(value));
  const binSpace = (bin: ReceiptStockState['bins'][number]) =>
    t('stockBinSpace', {
      availableWeight: format(Number(bin.availableWeightG) / 1000),
      maxWeight: format(Number(bin.maxWeightG) / 1000),
      availableVolume: format(bin.availableVolumeM3),
      maxVolume: format(bin.maxVolumeM3),
    });
  const binOption = (bin: ReceiptStockState['bins'][number], quarantine = false) => {
    const blocker = quarantine ? bin.quarantineBlocker : bin.primaryBlocker;
    const space = binSpace(bin);
    return {
      value: bin.id,
      label: `${bin.code} · ${space}${blocker ? ` · ${t(`stockBinBlock${blocker}`)}` : ''}`,
      disabled: blocker !== null,
    };
  };
  return (
    <Card padding="none" className={styles.panel}>
      <div className={styles.actionPanelHeader}>
        <h3 className={styles.actionPanelHeading}>
          <Button
            type="button"
            variant="ghost"
            className={styles.actionPanelToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-describedby={`${panelId}-summary`}
            onClick={() => setExpanded((v) => !v)}
          >
            <Warehouse size={20} aria-hidden="true" className={styles.panelIcon} />
            <span>{t('stockTitle')}</span>
            {expanded ? (
              <ChevronUp size={16} aria-hidden="true" className={styles.chevron} />
            ) : (
              <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
            )}
          </Button>
        </h3>
        {expanded && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.actionPanelRefresh}
            aria-label={t('stockReload')}
            disabled={busy || loading}
            onClick={() => {
              setError('');
              setRefresh((v) => v + 1);
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('stockReload')}
          </Button>
        )}
      </div>
      <p id={`${panelId}-summary`} className={styles.actionPanelSummary}>
        {t('stockSummary')}
      </p>
      {expanded && (
        <div id={panelId} className={styles.actionPanelBody}>
          {state?.qcState === 'APPROVED' && (
            <div className={`${styles.record} ${styles.stockRecord}`}>
              <p className="font-medium">
                {t('stockQcBreakdown', {
                  accepted: state.acceptedQty.toLocaleString(),
                  quarantined: state.quarantinedQty.toLocaleString(),
                  rejected: state.rejectedQty.toLocaleString(),
                })}
              </p>
              <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">
                {t('stockRecognized', {
                  quantity: state.recognizedQty.toLocaleString(),
                  total: (state.acceptedQty + state.quarantinedQty).toLocaleString(),
                })}
              </p>
              <dl className="mt-3 grid gap-3 border-t border-[var(--sc-border-default)] pt-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--sc-text-secondary)]">{t('stockPerUnit')}</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {t('stockUnitMeasurements', {
                      length: format(state.load.lengthCm),
                      width: format(state.load.widthCm),
                      height: format(state.load.heightCm),
                      weight: format(state.load.unitWeightG / 1000),
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--sc-text-secondary)]">
                    {t('stockTotalLoad', {
                      quantity: state.load.primaryQty + state.load.quarantineQty,
                    })}
                  </dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {t('stockLoadMeasurements', {
                      weight: format(
                        ((state.load.primaryQty + state.load.quarantineQty) *
                          state.load.unitWeightG) /
                          1000,
                      ),
                      volume: format(
                        (state.load.primaryQty + state.load.quarantineQty) *
                          Number(state.load.unitVolumeM3),
                      ),
                    })}
                  </dd>
                </div>
              </dl>
            </div>
          )}
          {loading && <p role="status">{t('loading')}</p>}
          {(error || loadError) && <Alert variant="error" title={error || loadError} />}
          {attempt && <Alert variant="warning" title={t('stockUncertain')} />}
          {state && (
            <>
              {(!!state.items.length || (!state.canPost && state.recognizedQty === 0)) && (
                <div className={`${styles.record} ${styles.stockRecord}`}>
                  {!!state.items.length && (
                    <ul className={styles.stockLocations}>
                      {state.items.map((item) => (
                        <li key={item.stockId}>
                          {t('stockLocation', {
                            code:
                              state.bins.find((bin) => bin.id === item.binId)?.code ??
                              t('stockSavedLocation'),
                            quantity: item.quantity.toLocaleString(),
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!state.canPost && state.recognizedQty === 0 && (
                    <p className="text-sm text-[var(--sc-text-secondary)]">
                      {t('stockAwaitReview')}
                    </p>
                  )}
                </div>
              )}
              {canWrite && state.canPost && !attempt && (
                <form
                  className="space-y-3"
                  onSubmit={handleSubmit(
                    (input) =>
                      void send({
                        input,
                        receipt: state.receiptId,
                        quantity: state.acceptedQty + state.quarantinedQty,
                      }),
                  )}
                >
                  <fieldset disabled={busy || loading} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        label={t(
                          state.load.primaryRequiresQuarantine
                            ? 'stockQuarantineArea'
                            : 'stockPrimaryArea',
                        )}
                        placeholder={t('stockSelectZone')}
                        value={primaryZoneId}
                        required
                        onChange={(event) => {
                          setPrimaryZoneId(event.target.value);
                          setValue('binId', '');
                          clearErrors('binId');
                          setError('');
                        }}
                        options={primaryZones.map((zone) => ({
                          value: zone.id,
                          label: zone.code,
                        }))}
                      />
                      <Select
                        label={t(
                          state.load.primaryRequiresQuarantine
                            ? 'stockQuarantineBin'
                            : 'stockPrimaryBin',
                        )}
                        placeholder={t('stockSelectBin')}
                        required
                        disabled={!primaryZoneId || busy || loading}
                        {...register('binId', { onChange: () => setError('') })}
                        options={primaryBins.map((bin) => binOption(bin))}
                        helperText={
                          primaryBin
                            ? binSpace(primaryBin)
                            : primaryZoneId
                              ? t('stockCapacityHint')
                              : undefined
                        }
                        error={errors.binId ? t('stockSelectBin') : undefined}
                      />
                    </div>
                    {hasSplitQty && (
                      <p className="text-sm text-[var(--sc-text-secondary)]">
                        {t('stockPrimaryLoad', {
                          quantity: state.load.primaryQty,
                          weight: format((state.load.primaryQty * state.load.unitWeightG) / 1000),
                          volume: format(state.load.primaryQty * Number(state.load.unitVolumeM3)),
                        })}
                      </p>
                    )}
                    {state.load.primaryRequiresQuarantine && state.acceptedQty > 0 && (
                      <Alert variant="warning" title={t('stockShelfLifeQuarantine')} />
                    )}
                    {primaryZoneId && !primaryBins.some((bin) => bin.primaryBlocker === null) && (
                      <Alert variant="warning" title={t('stockNoFittingBins')} />
                    )}
                    {hasSplitQty && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select
                          label={t('stockQuarantineArea')}
                          placeholder={t('stockSelectZone')}
                          value={quarantineZoneId}
                          required
                          onChange={(event) => {
                            setQuarantineZoneId(event.target.value);
                            setValue('quarantineBinId', '');
                            clearErrors('quarantineBinId');
                            setError('');
                          }}
                          options={quarantineZones.map((zone) => ({
                            value: zone.id,
                            label: zone.code,
                          }))}
                        />
                        <Select
                          label={t('stockQuarantineBin')}
                          placeholder={t('stockSelectBin')}
                          required
                          disabled={!quarantineZoneId || busy || loading}
                          {...register('quarantineBinId', { onChange: () => setError('') })}
                          options={quarantineBins.map((bin) => binOption(bin, true))}
                          helperText={t('stockQuarantineLoad', {
                            quantity: state.load.quarantineQty,
                            weight: format(
                              (state.load.quarantineQty * state.load.unitWeightG) / 1000,
                            ),
                            volume: format(
                              state.load.quarantineQty * Number(state.load.unitVolumeM3),
                            ),
                          })}
                          error={errors.quarantineBinId ? t('stockSelectBin') : undefined}
                        />
                      </div>
                    )}
                    {hasSplitQty &&
                      quarantineZoneId &&
                      !quarantineBins.some((bin) => bin.quarantineBlocker === null) && (
                        <Alert variant="warning" title={t('stockNoFittingBins')} />
                      )}
                    <Button
                      type="submit"
                      isLoading={busy}
                      disabled={!canSubmit || loading || !!loadError}
                    >
                      {t('stockSubmit', {
                        quantity: (state.acceptedQty + state.quarantinedQty).toLocaleString(),
                      })}
                    </Button>
                  </fieldset>
                </form>
              )}
            </>
          )}
          {attempt && canWrite && (
            <Button type="button" isLoading={busy} onClick={() => void send(attempt)}>
              {t('stockRetry')}
            </Button>
          )}
          {!canWrite && state?.canPost && !loading && <p>{t('stockStaffOnly')}</p>}
        </div>
      )}
    </Card>
  );
}
