import { useCallback, useEffect, useRef, useState } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronDown, ChevronUp, Package, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, Input, Select } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ReceiptCartonPanel } from './ReceiptCartonPanel';
import { ReceiptDiscrepancyPanel } from './ReceiptDiscrepancyPanel';
import { ReceiptInspectionForm } from './ReceiptInspectionForm';
import { ReceiptPackagingPanel } from './ReceiptPackagingPanel';
import { ReceiptPhotos } from './ReceiptPhotos';
import { ReceiptReviewPanel } from './ReceiptReviewPanel';
import { ReceiptStockPanel } from './ReceiptStockPanel';
import styles from './ReceiptWorkspace.module.css';
import { receivingApi, type ReceivingState } from '../api/receivingApi';
import {
  countCommand,
  derivedReceiptExpiry,
  receiptCountSchemaFor,
  type ReceiptCountFormValues,
  type ReceiptCountInput,
} from '../schemas/receiptCountSchema';

interface Props {
  warehouseId: string;
  asnId: string;
  canWrite: boolean;
  onSaved: () => void;
  onReceiptChanged: () => void;
  onNavigationLockChange?: (locked: boolean) => void;
}

export function ReceiptCountForm({
  warehouseId,
  asnId,
  canWrite,
  onSaved,
  onReceiptChanged,
  onNavigationLockChange,
}: Props) {
  const t = useTranslations('Receiving');
  const locale = useLocale();
  const { can } = useAccess();
  const owner = useAuthStore((state) => state.user);
  const [receipt, setReceipt] = useState<ReceivingState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uncertain, setUncertain] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [activeLot, setActiveLot] = useState('');
  const [aiLot, setAiLot] = useState('');
  const [aiApplied, setAiApplied] = useState(false);
  const [aiQuarantine, setAiQuarantine] = useState(false);
  const [pendingCommands, setPendingCommands] = useState<Record<string, boolean>>({});
  const handlePending = useCallback((key: string, locked: boolean) => {
    setPendingCommands((previous) =>
      previous[key] === locked ? previous : { ...previous, [key]: locked },
    );
  }, []);
  const isLocked = busy || uncertain || Object.values(pendingCommands).some(Boolean);
  const otherPending = (key: string) =>
    busy ||
    uncertain ||
    Object.entries(pendingCommands).some(([name, pending]) => pending && name !== key);
  useEffect(() => {
    onNavigationLockChange?.(isLocked);
    return () => onNavigationLockChange?.(false);
  }, [isLocked, onNavigationLockChange]);
  const operationKey = useRef(createUuid());
  const lastAttempt = useRef<ReceiptCountInput | null>(null);
  const mounted = useRef(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ReceiptCountFormValues>({
    resolver: (values, context, options) =>
      zodResolver(
        receiptCountSchemaFor(receipt?.lines.find((item) => item.id === values.inboundLineId)),
      )(values, context, options),
    defaultValues: { inboundLineId: '', lots: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lots' });
  const lineId = watch('inboundLineId');
  const line = receipt?.lines.find((row) => row.id === lineId);
  const openLines = receipt?.lines.filter((row) => row.count === null) ?? [];
  const editable =
    canWrite &&
    receipt?.status === 'RECEIVING' &&
    ['ARRIVED', 'RECEIVING'].includes(receipt.asnStatus) &&
    openLines.length > 0;
  const countedLines = receipt?.lines.filter((row) => row.count !== null) ?? [];
  const lots = countedLines.flatMap((row) => row.count?.lots ?? []);
  const inspectedLots = lots.filter((lot) => lot.qcState !== 'PENDING').length;
  const isApproved = receipt?.status === 'APPROVED' || receipt?.status === 'COMPLETED';
  const reinspection = receipt?.status === 'RECEIVING' && receipt.lastReview?.decision === 'RETURN';
  const live = useRef({ receipt, isLocked, isDirty });
  useEffect(() => {
    live.current = { receipt, isLocked, isDirty };
  }, [receipt, isLocked, isDirty]);

  useEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    setLoading(true);
    setReceipt(null);
    void receivingApi
      .receipt(warehouseId, asnId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || owner !== useAuthStore.getState().user) return;
        setReceipt(result);
        if (!lastAttempt.current) {
          reset({ inboundLineId: result.lines.find((row) => !row.count)?.id ?? '', lots: [] });
        }
        // A read confirms whether an uncertain write committed; do not invent a new operation.
        const saved = result.lines.find(
          (row) => row.id === lastAttempt.current?.inboundLineId,
        )?.count;
        if (saved) {
          lastAttempt.current = null;
          operationKey.current = createUuid();
          reset({ inboundLineId: result.lines.find((row) => !row.count)?.id ?? '', lots: [] });
          setUncertain(false);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && owner === useAuthStore.getState().user) {
          setError(reason instanceof ApiError ? reason.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [warehouseId, asnId, owner, refresh, reset, t]);

  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    async function checkForChanges() {
      if (checking || live.current.isLocked || !live.current.receipt || document.hidden) return;
      checking = true;
      try {
        const result = await receivingApi.receipt(warehouseId, asnId, controller.signal);
        const previous = live.current;
        if (
          controller.signal.aborted ||
          owner !== useAuthStore.getState().user ||
          previous.isLocked ||
          !previous.receipt
        ) {
          return;
        }
        if (
          result.version <= previous.receipt.version &&
          result.receivingRound === previous.receipt.receivingRound
        ) {
          return;
        }
        const newRound = result.receivingRound !== previous.receipt.receivingRound;
        if (!newRound && previous.isDirty) return;
        setReceipt(result);
        setError('');
        setActiveLot('');
        reset({ inboundLineId: result.lines.find((row) => !row.count)?.id ?? '', lots: [] });
        if (newRound) {
          lastAttempt.current = null;
          operationKey.current = createUuid();
          setPendingCommands({});
          setPhotoRevision((value) => value + 1);
        }
        onReceiptChanged();
      } catch (reason) {
        if (!controller.signal.aborted && owner === useAuthStore.getState().user) {
          setError(reason instanceof ApiError ? reason.message : t('loadError'));
        }
      } finally {
        checking = false;
      }
    }
    const refreshOnFocus = () => void checkForChanges();
    const timer = window.setInterval(refreshOnFocus, 15000);
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [warehouseId, asnId, owner, onReceiptChanged, reset, t]);

  async function send(input: ReceiptCountInput) {
    if (
      busy ||
      Object.values(pendingCommands).some(Boolean) ||
      !editable ||
      owner !== useAuthStore.getState().user
    ) {
      return;
    }
    setBusy(true);
    setError('');
    lastAttempt.current = input;
    try {
      await receivingApi.recordCount(warehouseId, asnId, input);
      if (mounted.current && owner === useAuthStore.getState().user) {
        lastAttempt.current = null;
        operationKey.current = createUuid();
        setUncertain(false);
        setRefresh((v) => v + 1);
        onSaved();
      }
    } catch (reason) {
      if (!mounted.current || owner !== useAuthStore.getState().user) return;
      setError(reason instanceof ApiError ? reason.message : t('countError'));
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        lastAttempt.current = null;
        setUncertain(false);
        if (reason.status === 409) setRefresh((value) => value + 1);
      } else setUncertain(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className={styles.workspace}>
      {loading && <p role="status">{t('loading')}</p>}
      {error && <Alert variant="error" title={error} />}
      {error && !receipt && !loading && (
        <Button type="button" variant="outline" onClick={() => setRefresh((value) => value + 1)}>
          {t('reload')}
        </Button>
      )}
      {uncertain && <Alert variant="warning" title={t('countUncertain')} />}
      {reinspection && receipt?.lastReview && (
        <Alert variant="warning" title={t('reinspectionTitle')}>
          <p className="whitespace-pre-wrap break-words">{receipt.lastReview.reason}</p>
        </Alert>
      )}
      {receipt && (
        <Card>
          <div className={styles.overview}>
            <div>
              <h2 className={styles.heading}>{t('receiptProgress')}</h2>
            </div>
            <Badge
              status={
                isApproved
                  ? 'success'
                  : reinspection
                    ? 'warning'
                    : receipt.status === 'CANCELLED'
                      ? 'default'
                      : 'info'
              }
              label={t(
                isApproved
                  ? 'progressApproved'
                  : reinspection
                    ? 'progressReinspection'
                    : receipt.status === 'CANCELLED'
                      ? 'progressCancelled'
                      : 'progressInProgress',
              )}
            />
          </div>
          <ol aria-label={t('receiptSteps')} className={styles.steps}>
            {[
              {
                title: t('progressCount'),
                description: t('progressItems', {
                  done: countedLines.length,
                  total: receipt.lines.length,
                }),
                complete: openLines.length === 0,
              },
              {
                title: t('progressInspect'),
                description:
                  lots.length === 0 && openLines.length > 0
                    ? t('progressCountFirst')
                    : t('progressLots', { done: inspectedLots, total: lots.length }),
                complete: openLines.length === 0 && inspectedLots === lots.length,
              },
              {
                title: t('progressReview'),
                description: t(
                  isApproved
                    ? 'progressApproved'
                    : reinspection
                      ? 'progressReinspection'
                      : receipt.status === 'CANCELLED'
                        ? 'progressCancelled'
                        : 'progressNotApproved',
                ),
                complete: isApproved,
              },
            ].map((step, index) => (
              <li className={styles.step} data-complete={step.complete} key={step.title}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {step.complete ? <Check size={16} /> : index + 1}
                </span>
                <div>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepCopy}>{step.description}</span>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.shipmentHeader}>
            <h3 className="text-sm font-semibold">{t('sellerShipment')}</h3>
            <Badge status="default" label={t('declaredCartons', { count: receipt.cartonCount })} />
          </div>
          <div className={styles.comparisonScroll}>
            <table className={styles.comparison} aria-label={t('sellerShipment')}>
              <thead>
                <tr>
                  <th scope="col">{t('shipmentSku')}</th>
                  <th scope="col">{t('declaredQuantity')}</th>
                  <th scope="col">{t('summaryActual')}</th>
                  <th scope="col">{t('quantityVariance')}</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((row) => {
                  const variance = row.count ? row.count.receivedQty - row.declaredQty : null;
                  return (
                    <tr key={row.id}>
                      <th scope="row">
                        <span>{row.productName}</span>
                        <small>{row.sku}</small>
                      </th>
                      <td>{row.declaredQty.toLocaleString(locale)}</td>
                      <td>{row.count ? row.count.receivedQty.toLocaleString(locale) : '—'}</td>
                      <td data-variance={variance !== null && variance !== 0}>
                        {variance === null
                          ? '—'
                          : `${variance > 0 ? '+' : ''}${variance.toLocaleString(locale)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {isLocked && <Alert variant="info" title={t('lockedWork')} />}
      {receipt && (
        <Card>
          <ReceiptPhotos
            key={`media:${receipt.receivingRound}`}
            warehouseId={warehouseId}
            asnId={asnId}
            recordId={null}
            receiptId={receipt.receiptId}
            receivingRound={receipt.receivingRound}
            canWrite={
              receipt.status === 'RECEIVING' &&
              !otherPending('photo:null') &&
              can('warehouse.asn.uploadPhoto')
            }
            onPendingChange={handlePending}
            onUploaded={() => setPhotoRevision((value) => value + 1)}
          />
        </Card>
      )}
      <div className={styles.columns}>
        <div className={styles.main}>
          {editable && (
            <Card>
              <div className={styles.sectionHeader}>
                <h2 className={styles.heading}>{t('progressCount')}</h2>
                <Badge status="info" label={t('countRemaining', { count: openLines.length })} />
              </div>
              <form
                className="space-y-4"
                noValidate
                onSubmit={handleSubmit((values) => {
                  if (receipt) {
                    void send(countCommand(values, operationKey.current, receipt.version, line));
                  }
                })}
              >
                <fieldset disabled={isLocked || loading} className="space-y-4">
                  <Select
                    label={t('countLine')}
                    required
                    options={openLines.map((row) => ({
                      value: row.id,
                      label: `${row.sku} — ${row.productName}`,
                    }))}
                    {...register('inboundLineId')}
                    error={errors.inboundLineId ? t('countInvalid') : undefined}
                    onChange={(event) => {
                      reset({ inboundLineId: event.target.value, lots: [] });
                      operationKey.current = createUuid();
                    }}
                  />
                  {line?.trackExpiry && (
                    <Alert
                      variant="info"
                      title={t('countExpiryHelp', {
                        percent: line.minInboundShelfLifePct,
                      })}
                    >
                      {line.shelfLifeDays
                        ? t('countExpiryDuration', { days: line.shelfLifeDays })
                        : t('countExpiryNoDuration')}
                    </Alert>
                  )}
                  <div className="grid items-end gap-3 sm:grid-cols-2">
                    <Input
                      label={
                        line
                          ? t('countQuantityExpected', {
                              quantity: line.declaredQty.toLocaleString(locale),
                            })
                          : t('countQuantity')
                      }
                      required
                      type="number"
                      min={0}
                      max={1_000_000}
                      step={1}
                      {...register('receivedQty', { valueAsNumber: true })}
                      error={errors.receivedQty ? t('countInvalid') : undefined}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setValue('receivedQty', 0);
                        setValue('lots', []);
                      }}
                    >
                      {t('countZero')}
                    </Button>
                  </div>
                  {line?.trackLot && (
                    <p className="text-sm text-[var(--sc-text-secondary)]">
                      {t('countLotCodeHelp')}
                    </p>
                  )}
                  {line?.trackLot &&
                    fields.map((field, index) => (
                      <fieldset
                        key={field.id}
                        className="space-y-3 rounded-lg border border-[var(--sc-border-default)] p-3"
                      >
                        <legend className="px-2 font-medium text-[var(--sc-text-primary)]">
                          {t('countLot', { number: index + 1 })}
                        </legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            label={t('countLotQuantity')}
                            required
                            type="number"
                            min={1}
                            max={1_000_000}
                            step={1}
                            {...register(`lots.${index}.receivedQty`, { valueAsNumber: true })}
                            error={
                              errors.lots?.[index]?.receivedQty ? t('countInvalid') : undefined
                            }
                          />
                          <Input
                            label={t('countLotCode')}
                            maxLength={100}
                            {...register(`lots.${index}.lotCode`, {
                              setValueAs: (value: string) => value.trim() || undefined,
                            })}
                            error={errors.lots?.[index]?.lotCode ? t('countInvalid') : undefined}
                          />
                          {(line?.trackExpiry || line?.manufactureRequired) && (
                            <Input
                              label={t('countManufacture', { number: index + 1 })}
                              required={Boolean(
                                line?.manufactureRequired ||
                                (line?.trackExpiry && !line.shelfLifeDays),
                              )}
                              type="date"
                              {...register(`lots.${index}.manufacturedOn`)}
                              error={
                                errors.lots?.[index]?.manufacturedOn
                                  ? t(
                                      errors.lots[index]?.manufacturedOn?.message ===
                                        'countManufactureRequired'
                                        ? 'countManufactureRequired'
                                        : 'countInvalid',
                                    )
                                  : undefined
                              }
                            />
                          )}
                          {line?.trackExpiry && (
                            <Input
                              label={t('countExpiry', { number: index + 1 })}
                              required={
                                !derivedReceiptExpiry(
                                  watch(`lots.${index}.manufacturedOn`),
                                  line.shelfLifeDays,
                                )
                              }
                              type="date"
                              {...register(`lots.${index}.expiresOn`)}
                              error={
                                errors.lots?.[index]?.expiresOn
                                  ? t(
                                      errors.lots[index]?.expiresOn?.message ===
                                        'countExpiryRequired'
                                        ? 'countExpiryRequired'
                                        : 'countInvalid',
                                    )
                                  : undefined
                              }
                            />
                          )}
                        </div>
                        {line?.trackExpiry &&
                          !watch(`lots.${index}.expiresOn`) &&
                          derivedReceiptExpiry(
                            watch(`lots.${index}.manufacturedOn`),
                            line.shelfLifeDays,
                          ) && (
                            <p className="text-sm text-[var(--sc-text-secondary)]">
                              {t('derivedExpiryPreview', {
                                date:
                                  derivedReceiptExpiry(
                                    watch(`lots.${index}.manufacturedOn`),
                                    line.shelfLifeDays,
                                  ) ?? '',
                              })}
                            </p>
                          )}
                        {can('warehouse.asn.packagingAssist') && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setAiApplied(false);
                              setAiLot(field.id);
                            }}
                          >
                            {t('packagingAssist')}
                          </Button>
                        )}
                        <Button type="button" variant="ghost" onClick={() => remove(index)}>
                          {t('countRemoveLot', { number: index + 1 })}
                        </Button>
                      </fieldset>
                    ))}
                  {(errors.lots?.message || errors.lots?.root) && (
                    <p role="alert" className="text-sm text-[var(--sc-error-dark)]">
                      {t(
                        errors.lots?.message === 'countLotsRequired' ||
                          errors.lots?.root?.message === 'countLotsRequired'
                          ? 'countLotsRequired'
                          : 'countBreakdownInvalid',
                      )}
                    </p>
                  )}
                  {line?.trackLot && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={fields.length >= 50}
                      onClick={() =>
                        append({
                          receivedQty: Number.NaN,
                          manufacturedOn: '',
                          expiresOn: '',
                        })
                      }
                    >
                      <Plus size={16} aria-hidden="true" />
                      {t('countAddLot')}
                    </Button>
                  )}
                </fieldset>
                <div className={styles.formActions}>
                  {uncertain ? (
                    <Button
                      type="button"
                      isLoading={busy}
                      onClick={() => {
                        if (lastAttempt.current) void send(lastAttempt.current);
                      }}
                    >
                      {t('countRetry')}
                    </Button>
                  ) : (
                    <Button type="submit" isLoading={busy} disabled={loading || isLocked}>
                      {t('countSave')}
                    </Button>
                  )}
                </div>
              </form>
              {aiApplied && (
                <Alert
                  variant="info"
                  title={t(aiQuarantine ? 'packagingAppliedQuarantine' : 'packagingApplied')}
                />
              )}
              {aiLot &&
                receipt &&
                line &&
                fields.some((field) => field.id === aiLot) &&
                can('warehouse.asn.packagingAssist') && (
                  <ReceiptPackagingPanel
                    key={`${warehouseId}:${asnId}:${receipt.receiptId}:${receipt.version}:${receipt.receivingRound}:${line.id}:${aiLot}`}
                    warehouseId={warehouseId}
                    asnId={asnId}
                    policy={line}
                    scope={{
                      receiptId: receipt.receiptId,
                      inboundLineId: line.id,
                      receiptVersion: receipt.version,
                      receivingRound: receipt.receivingRound,
                    }}
                    onPendingChange={handlePending}
                    onClose={() => setAiLot('')}
                    onAccepted={(value) => {
                      const index = fields.findIndex((field) => field.id === aiLot);
                      if (index < 0) return;
                      setValue(`lots.${index}.lotCode`, value.lotCode ?? undefined, {
                        shouldDirty: true,
                      });
                      setValue(`lots.${index}.manufacturedOn`, value.manufacturedOn ?? '', {
                        shouldDirty: true,
                      });
                      setValue(`lots.${index}.expiresOn`, value.expiresOn ?? '', {
                        shouldDirty: true,
                      });
                      setAiQuarantine(value.requiresQuarantine);
                      setAiApplied(true);
                      setAiLot('');
                    }}
                  />
                )}
            </Card>
          )}
          {countedLines.length > 0 && (
            <Card>
              <div className={styles.sectionHeader}>
                <h2 className={styles.heading}>{t('countedProducts')}</h2>
                <Badge
                  status="default"
                  label={t('progressItems', {
                    done: countedLines.length,
                    total: receipt?.lines.length ?? 0,
                  })}
                />
              </div>
              {receipt?.lines
                .filter((row) => row.count !== null)
                .map((row) => (
                  <div key={row.id} className={styles.product}>
                    <div className={styles.productHeader}>
                      <div className="min-w-0">
                        <span className={styles.sku}>{row.sku}</span>
                        <h3 className={styles.productName}>{row.productName}</h3>
                      </div>
                      <div className={styles.quantity}>
                        <strong>{row.count?.receivedQty.toLocaleString(locale)}</strong>
                        <span>{t('actualUnits')}</span>
                      </div>
                    </div>
                    {row.count?.receivedQty === 0 && (
                      <p className={styles.copy}>{t('countZero')}</p>
                    )}
                    {row.count?.lots.map((lot) => (
                      <div
                        key={lot.recordId}
                        className={styles.lot}
                        data-active={activeLot === lot.recordId}
                      >
                        <div className={styles.lotHeader}>
                          <div className="min-w-0">
                            <div className={styles.lotInfo}>
                              <Package size={16} aria-hidden="true" className={styles.panelIcon} />
                              <span className={styles.lotCode}>
                                {lot.lotCodeSource === 'RECEIVING'
                                  ? `${t('internalReferenceLabel')}: `
                                  : ''}
                                {lot.lotCode}
                              </span>
                              <Badge
                                status={
                                  lot.qcState === 'APPROVED'
                                    ? 'success'
                                    : lot.qcState === 'REVIEW_REQUIRED'
                                      ? 'info'
                                      : 'warning'
                                }
                                label={
                                  lot.qcState === 'REVIEW_REQUIRED'
                                    ? t('qcReviewRequired')
                                    : lot.qcState === 'APPROVED'
                                      ? t('countQcApproved')
                                      : lot.quarantinedQty > 0
                                        ? t('countQuarantine')
                                        : t('countPendingQc')
                                }
                              />
                            </div>
                            <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                              {t('lotUnits', { quantity: lot.receivedQty.toLocaleString(locale) })}
                              {row.trackExpiry &&
                                ` · ${t('lotExpiry', { date: lot.expiresOn ?? '—' })}`}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant={activeLot === lot.recordId ? 'secondary' : 'outline'}
                            size="sm"
                            aria-expanded={activeLot === lot.recordId}
                            aria-controls={`lot-${lot.recordId}`}
                            aria-label={t('lotWork', { code: lot.lotCode })}
                            disabled={isLocked}
                            onClick={() =>
                              setActiveLot((previous) =>
                                previous === lot.recordId ? '' : lot.recordId,
                              )
                            }
                          >
                            {t(activeLot === lot.recordId ? 'lotClose' : 'lotDetails')}
                            {activeLot === lot.recordId ? (
                              <ChevronUp size={14} aria-hidden="true" />
                            ) : (
                              <ChevronDown size={14} aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                        {activeLot === lot.recordId && (
                          <div id={`lot-${lot.recordId}`} className={styles.lotDetail}>
                            <ReceiptPhotos
                              warehouseId={warehouseId}
                              asnId={asnId}
                              recordId={lot.recordId}
                              onPendingChange={handlePending}
                              onUploaded={() => setPhotoRevision((v) => v + 1)}
                              canWrite={
                                !otherPending(`photo:${lot.recordId}`) &&
                                can('warehouse.asn.uploadPhoto') &&
                                receipt.status === 'RECEIVING' &&
                                ['ARRIVED', 'RECEIVING'].includes(receipt.asnStatus) &&
                                lot.qcState !== 'APPROVED'
                              }
                            />
                            <ReceiptInspectionForm
                              key={`${lot.recordId}:${refresh}`}
                              warehouseId={warehouseId}
                              asnId={asnId}
                              recordId={lot.recordId}
                              receivedQty={lot.receivedQty}
                              photoRevision={photoRevision}
                              onPendingChange={handlePending}
                              requiresQuarantine={
                                lot.quarantinedQty > 0 ||
                                !['SELLABLE', 'NEAR_EXPIRY'].includes(lot.lotStatus)
                              }
                              canWrite={
                                !otherPending(`qc:${lot.recordId}`) &&
                                can('warehouse.asn.inspect') &&
                                receipt.status === 'RECEIVING' &&
                                ['ARRIVED', 'RECEIVING'].includes(receipt.asnStatus)
                              }
                              onSaved={(inspection) =>
                                setReceipt((previous) =>
                                  previous
                                    ? {
                                        ...previous,
                                        version: Math.max(
                                          previous.version,
                                          inspection.receiptVersion,
                                        ),
                                        lines: previous.lines.map((item) => ({
                                          ...item,
                                          count: item.count
                                            ? {
                                                ...item.count,
                                                lots: item.count.lots.map((itemLot) =>
                                                  itemLot.recordId === lot.recordId
                                                    ? { ...itemLot, qcState: 'REVIEW_REQUIRED' }
                                                    : itemLot,
                                                ),
                                              }
                                            : null,
                                        })),
                                      }
                                    : previous,
                                )
                              }
                            />
                            <ReceiptStockPanel
                              key={`stock:${lot.recordId}:${refresh}`}
                              onPendingChange={handlePending}
                              receiptId={receipt.receiptId}
                              warehouseId={warehouseId}
                              asnId={asnId}
                              recordId={lot.recordId}
                              canWrite={
                                !otherPending(`stock:${lot.recordId}`) &&
                                can('warehouse.asn.postStock')
                              }
                              onSaved={() => {
                                setRefresh((v) => v + 1);
                                onReceiptChanged();
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </Card>
          )}
          {receipt && (
            <ReceiptDiscrepancyPanel
              key={`discrepancy:${receipt.receivingRound}`}
              onPendingChange={handlePending}
              warehouseId={warehouseId}
              asnId={asnId}
              receiptVersion={receipt.version}
              receiptStatus={receipt.status}
              canWrite={
                !otherPending(`discrepancy:${asnId}`) && can('warehouse.asn.reportDiscrepancy')
              }
              onSaved={() => {
                setRefresh((v) => v + 1);
                onReceiptChanged();
              }}
            />
          )}
        </div>
        <aside className={styles.sidebar} aria-label={t('reviewHistoryTitle')}>
          {receipt && isApproved && (
            <ReceiptCartonPanel
              warehouseId={warehouseId}
              asnId={asnId}
              receiptId={receipt.receiptId}
              receiptVersion={receipt.version}
              canWrite={!otherPending(`cartons:${asnId}`) && can('warehouse.asn.review')}
              onPendingChange={handlePending}
              onSaved={onReceiptChanged}
            />
          )}
          {receipt && (
            <ReceiptReviewPanel
              key={`review:${receipt.receivingRound}`}
              mediaRevision={photoRevision}
              onPendingChange={handlePending}
              warehouseId={warehouseId}
              asnId={asnId}
              receiptVersion={receipt.version}
              isCountComplete={openLines.length === 0}
              canWrite={!otherPending(`review:${asnId}`) && can('warehouse.asn.review')}
              onSaved={() => {
                setRefresh((v) => v + 1);
                onReceiptChanged();
              }}
            />
          )}
        </aside>
      </div>
      {!loading && receipt && !editable && openLines.length > 0 && (
        <Alert variant="info" title={t(canWrite ? 'countClosed' : 'countReadOnly')} />
      )}
    </div>
  );
}
