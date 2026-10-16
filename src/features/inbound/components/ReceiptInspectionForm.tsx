import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Controller, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp, ClipboardCheck, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, Checkbox, Input, Select } from '@/components/Common';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './ReceiptWorkspace.module.css';
import { evidenceApi, type ReceiptEvidence } from '../api/evidenceApi';
import { inspectionApi, type InspectionState, type ReceiptInspection } from '../api/inspectionApi';
import {
  inspectionFormSchema,
  qcReasons,
  type InspectionInput,
  type InspectionValues,
} from '../schemas/receiptInspectionSchema';

interface Props {
  onPendingChange?: (key: string, locked: boolean) => void;
  warehouseId: string;
  asnId: string;
  recordId: string;
  receivedQty: number;
  requiresQuarantine: boolean;
  canWrite: boolean;
  onSaved: (row: ReceiptInspection) => void;
  photoRevision?: number;
}
export function ReceiptInspectionForm({
  onPendingChange,
  warehouseId,
  asnId,
  recordId,
  receivedQty,
  requiresQuarantine,
  canWrite,
  onSaved,
  photoRevision = 0,
}: Props) {
  const t = useTranslations('Receiving');
  const owner = useAuthStore((state) => state.user);
  const [expanded, setExpanded] = useState(true);
  const [state, setState] = useState<InspectionState | null>(null);
  const [photos, setPhotos] = useState<ReceiptEvidence[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [attempt, setAttempt] = useState<InspectionInput | null>(null);
  const [saved, setSaved] = useState<ReceiptInspection | null>(null);
  useEffect(() => {
    onPendingChange?.(`qc:${recordId}`, busy || attempt !== null);
    return () => onPendingChange?.(`qc:${recordId}`, false);
  }, [onPendingChange, recordId, busy, attempt]);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const operation = useRef(createUuid());
  const schema = useMemo(
    () => inspectionFormSchema(receivedQty, requiresQuarantine),
    [receivedQty, requiresQuarantine],
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<InspectionValues>({
    resolver: zodResolver(schema),
    defaultValues: { reasonCode: 'NONE', reason: '', photoIds: [] },
  });
  const values = watch();
  const editable =
    canWrite && state?.qcState === 'PENDING' && state.lastDecision !== 'RETURN' && !saved;
  const current = useCallback(
    (revision: number) => revision === generation.current && owner === useAuthStore.getState().user,
    [owner],
  );
  useEffect(() => {
    const revision = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    setState(null);
    setPhotos([]);
    setError('');
    setAttempt(null);
    setSaved(null);
    setBusy(false);
    operation.current = createUuid();
    reset({ reasonCode: 'NONE', reason: '', photoIds: [] });
    return () => {
      generation.current = revision + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, recordId, owner, reset]);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController(),
      revision = generation.current;
    setLoading(true);
    void Promise.all([
      inspectionApi.get(warehouseId, asnId, recordId, controller.signal),
      evidenceApi.list(warehouseId, asnId, recordId, controller.signal),
    ])
      .then(([result, images]) => {
        if (controller.signal.aborted || !current(revision)) return;
        if (result.receivedQty !== receivedQty) throw new Error('Physical count changed');
        setState(result);
        setPhotos(images.filter((photo) => photo.verifiedAt));
        setError('');
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && current(revision)) {
          setState(null);
          setPhotos([]);
          setError(reason instanceof ApiError ? reason.message : t('qcLoadError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current(revision)) setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, warehouseId, asnId, recordId, receivedQty, refresh, photoRevision, current, t]);
  async function send(input: InspectionInput) {
    if (busy || !canWrite || (!editable && !attempt) || owner !== useAuthStore.getState().user) {
      return;
    }
    const revision = generation.current,
      controller = active.current;
    setBusy(true);
    setError('');
    try {
      const result = await inspectionApi.propose(
        warehouseId,
        asnId,
        recordId,
        input,
        controller?.signal,
      );
      if (!current(revision)) return;
      setSaved(result);
      setAttempt(null);
      setState((previous) =>
        previous
          ? {
              ...previous,
              receiptVersion: Math.max(previous.receiptVersion, result.receiptVersion),
              qcState: 'REVIEW_REQUIRED',
              lastDecision: null,
              items: [...previous.items, result],
            }
          : previous,
      );
      onSaved(result);
    } catch (reason) {
      if (!current(revision)) return;
      setError(reason instanceof ApiError ? reason.message : t('qcSubmitError'));
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setAttempt(null);
        operation.current = createUuid();
        setState(null);
        setRefresh((value) => value + 1);
      } else setAttempt(input);
    } finally {
      if (current(revision)) setBusy(false);
    }
  }
  const classified = [values.acceptedQty, values.quarantinedQty, values.rejectedQty].reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
  const panelId = `qc-${recordId}`;
  return (
    <Card padding="none" className={styles.panel}>
      <div className={styles.actionPanelHeader}>
        <h3 className={styles.actionPanelHeading}>
          <Button
            type="button"
            variant="ghost"
            className={styles.actionPanelToggle}
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={panelId}
          >
            <ClipboardCheck size={20} aria-hidden="true" className={styles.panelIcon} />
            <span>{t('qcTitle')}</span>
            {state?.qcState === 'APPROVED' && (
              <span className={styles.approvedBadge}>
                <Badge status="success" label={t('countQcApproved')} />
              </span>
            )}
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
            aria-label={t('reload')}
            disabled={busy || loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('reload')}
          </Button>
        )}
      </div>
      {expanded && (
        <div id={panelId} className={styles.actionPanelBody}>
          {state?.qcState !== 'APPROVED' && (
            <p className="text-sm leading-6 text-[var(--sc-text-secondary)]">{t('qcHelp')}</p>
          )}
          {loading && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error" title={error} />}
          {saved && <Alert variant="success" title={t('qcSaved')} />}
          {attempt && <Alert variant="warning" title={t('qcUncertain')} />}
          {state?.lastDecision === 'RETURN' && (
            <Alert variant="warning" title={t('reinspectionHistoryOnly')} />
          )}
          {state?.items.map((row) => (
            <div key={row.id} className={styles.record}>
              <p className="font-medium">{t('qcRecorded')}</p>
              <dl className={styles.inspectionMetrics}>
                {(
                  [
                    { key: 'accepted', label: 'qcAccepted', quantity: row.acceptedQty },
                    { key: 'quarantine', label: 'qcQuarantined', quantity: row.quarantinedQty },
                    { key: 'rejected', label: 'qcRejected', quantity: row.rejectedQty },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className={styles.inspectionMetric}>
                    <dt>{t(item.label)}</dt>
                    <dd>{item.quantity.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              {row.reason && <p className="mt-3 break-words">{row.reason}</p>}
              <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">
                {t('qcAttached', { count: row.photoIds.length })}
              </p>
            </div>
          ))}
          {editable && (
            <form
              className="space-y-3"
              onSubmit={handleSubmit((form) => {
                if (state) {
                  void send({
                    ...form,
                    operationKey: operation.current,
                    expectedVersion: state.receiptVersion,
                  });
                }
              })}
            >
              <fieldset disabled={busy || loading || Boolean(attempt)} className="space-y-3">
                {requiresQuarantine && <Alert variant="warning" title={t('qcAcceptanceBlocked')} />}
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label={t('qcAccepted')}
                    type="number"
                    min={0}
                    max={1_000_000}
                    step={1}
                    {...register('acceptedQty', { valueAsNumber: true })}
                    error={
                      errors.acceptedQty
                        ? t(
                            errors.acceptedQty.message === 'qcAcceptanceBlocked'
                              ? 'qcAcceptanceBlocked'
                              : 'qcSumInvalid',
                          )
                        : undefined
                    }
                  />
                  <Input
                    label={t('qcQuarantined')}
                    type="number"
                    min={0}
                    max={1_000_000}
                    step={1}
                    {...register('quarantinedQty', { valueAsNumber: true })}
                    error={errors.quarantinedQty ? t('qcInvalid') : undefined}
                  />
                  <Input
                    label={t('qcRejected')}
                    type="number"
                    min={0}
                    max={1_000_000}
                    step={1}
                    {...register('rejectedQty', { valueAsNumber: true })}
                    error={errors.rejectedQty ? t('qcInvalid') : undefined}
                  />
                </div>
                <p className="text-sm" role="status">
                  {t('qcPartition', { count: classified, actual: receivedQty })}
                </p>
                <Select
                  label={t('qcReasonCode')}
                  options={qcReasons.map((value) => ({ value, label: t(`qcReason${value}`) }))}
                  {...register('reasonCode')}
                />
                <Input
                  label={t('qcReason')}
                  maxLength={1000}
                  {...register('reason')}
                  error={errors.reason ? t('qcReasonRequired') : undefined}
                />
                <Controller
                  control={control}
                  name="photoIds"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <p className="font-medium">{t('qcPhotos')}</p>
                      {!photos.length && <p className="text-sm">{t('qcNoPhotos')}</p>}
                      {photos.map((photo, index) => (
                        <Checkbox
                          key={photo.id}
                          label={t('qcPhoto', { number: index + 1 })}
                          checked={field.value.includes(photo.id)}
                          onChange={(event) =>
                            field.onChange(
                              event.target.checked
                                ? [...field.value, photo.id]
                                : field.value.filter((id) => id !== photo.id),
                            )
                          }
                        />
                      ))}
                      {errors.photoIds && (
                        <p role="alert" className="text-sm text-[var(--sc-error)]">
                          {t('qcPhotoRequired')}
                        </p>
                      )}
                    </div>
                  )}
                />
                <Button type="submit" disabled={busy || loading}>
                  {t('qcSubmit')}
                </Button>
              </fieldset>
            </form>
          )}
          {!canWrite && !state?.items.length && <p>{t('qcReadOnly')}</p>}
          {attempt && (
            <Button type="button" disabled={busy || !canWrite} onClick={() => void send(attempt)}>
              {t('qcRetry')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
