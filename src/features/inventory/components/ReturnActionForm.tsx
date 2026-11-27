import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Dropzone, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { returnWorkflowApi, type ReturnLine } from '../api/returnWorkflowApi';
import {
  reverseParcelSchema,
  returnActionSchema,
  type ReturnActionForm as Form,
} from '../schemas/returnWorkflowSchema';

export type ReturnAction = {
  kind: 'authorize' | 'arrival' | 'inspection' | 'review' | 'stock';
  id: string;
  version: number;
  line?: ReturnLine;
  /** Human-readable code printed on the parcel (waybill), shown instead of the internal id. */
  label?: string;
};
const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp';
const PHOTO_MAX_MB = 5;
/** Client size/type checks and the server's byte-signature check both reject the photo itself. */
function isPhotoRejected(cause: unknown): boolean {
  return (
    (cause instanceof Error && cause.message === 'INVALID_EVIDENCE') ||
    (cause instanceof ApiError && cause.code === 'UPLOAD.EVIDENCE_INVALID')
  );
}
export function ReturnActionForm({
  warehouseId,
  action,
  onClose,
  onAccepted,
}: {
  warehouseId: string;
  action: ReturnAction;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const t = useTranslations('Returns'),
    revision = useAuthStore((s) => s.revision);
  const [operationId] = useState(createUuid),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [photoError, setPhotoError] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [bins, setBins] = useState<{ id: string; code: string; zoneType: string }[]>([]);
  const running = useRef(false),
    pending = useRef<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(returnActionSchema),
    defaultValues: {
      parcelScan: '',
      qty: 1,
      classification: 'ACCEPTED',
      decision: 'APPROVE',
      reason: '',
      toBinId: '',
      destination: 'SELLABLE',
      binScan: '',
    },
  });
  useEffect(() => {
    if (action.kind !== 'stock') return;
    const abort = new AbortController();
    void returnWorkflowApi
      .bins(warehouseId, abort.signal)
      .then((p) => {
        if (!abort.signal.aborted) setBins(p.items);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [warehouseId, action.kind]);
  async function submit(v: Form) {
    if (running.current || useAuthStore.getState().revision !== revision) return;
    running.current = true;
    setBusy(true);
    setError(false);
    setPhotoError(false);
    try {
      if (!pending.current) {
        const common = { operationId, expectedVersion: action.version };
        if (action.kind === 'authorize') {
          pending.current = {
            ...common,
            parcel: reverseParcelSchema.parse({
              weightG: v.weightG,
              lengthCm: v.lengthCm,
              widthCm: v.widthCm,
              heightCm: v.heightCm,
            }),
          };
        } else if (action.kind === 'arrival') {
          if (!v.parcelScan.trim()) throw new Error('SCAN_REQUIRED');
          pending.current = { ...common, parcelScan: v.parcelScan };
        } else if (action.kind === 'inspection') {
          if (!file || !action.line || v.qty > action.line.requestedQty) {
            throw new Error('INSPECTION_REQUIRED');
          }
          const evidence = await returnWorkflowApi.evidence(
            warehouseId,
            action.id,
            action.line.id,
            file,
          );
          pending.current = {
            ...common,
            lineId: action.line.id,
            receivedQty: v.qty,
            classification: v.classification,
            evidence,
          };
        } else if (action.kind === 'review') {
          if (v.reason.trim().length < 3 || !action.line) throw new Error('REVIEW_REQUIRED');
          pending.current = {
            ...common,
            lineId: action.line.id,
            decision: v.decision,
            reason: v.reason,
          };
        } else if (action.kind === 'stock') {
          if (!action.line || !v.binScan.trim()) {
            throw new Error('SCAN_REQUIRED');
          }
          z.uuid().parse(v.toBinId);
          pending.current = {
            ...common,
            lineId: action.line.id,
            toBinId: v.toBinId,
            destination: v.destination,
            binScan: v.binScan,
          };
        } else pending.current = common;
      }
      if (useAuthStore.getState().revision !== revision) return;
      await returnWorkflowApi.command(warehouseId, `${action.id}/${action.kind}`, pending.current);
      if (useAuthStore.getState().revision === revision) onAccepted();
    } catch (cause) {
      if (useAuthStore.getState().revision !== revision) return;
      if (action.kind === 'inspection' && isPhotoRejected(cause)) {
        // The rejected photo was never accepted, so a different photo may be chosen and sent.
        pending.current = null;
        setFile(null);
        setPhotoError(true);
      } else setError(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const inputError = Object.keys(errors).length > 0;
  return (
    <Modal
      isOpen
      title={t(action.kind)}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="space-y-4" onSubmit={handleSubmit(submit, () => notifyInvalidForm())}>
        {(action.label || action.kind === 'arrival') && (
          <p className="m-0 break-all text-sm">{action.label ?? t('noWaybillYet')}</p>
        )}
        {action.line && (
          <dl className="m-0 grid gap-3 rounded-[12px] border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-w-0">
              <dt className="text-xs text-[var(--sc-text-secondary)]">{t('productLabel')}</dt>
              <dd className="m-0 mt-0.5 break-all text-sm font-semibold text-[var(--sc-text-primary)]">
                {action.line.sku}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-[var(--sc-text-secondary)]">{t('originalLot')}</dt>
              <dd className="m-0 mt-0.5 break-all font-mono text-xs text-[var(--sc-text-primary)]">
                {action.line.lotCode}
              </dd>
            </div>
          </dl>
        )}
        {error && <Alert variant="error" title={t('commandError')} />}
        {photoError && <Alert variant="error" title={t('photoInvalid')} />}
        {inputError && <Alert variant="error" title={t('invalid')} />}
        <fieldset disabled={busy || !!pending.current} className="space-y-3">
          {action.kind === 'authorize' && (
            <>
              <Alert variant="info" title={t('reverseMeasurementsHint')} />
              {(['weightG', 'lengthCm', 'widthCm', 'heightCm'] as const).map((key) => (
                <Input
                  key={key}
                  label={t(key)}
                  type="number"
                  required
                  min={1}
                  max={key === 'weightG' ? 50000 : 200}
                  {...register(key, { valueAsNumber: true })}
                  error={errors[key]?.message}
                />
              ))}
            </>
          )}
          {action.kind === 'arrival' && (
            <Input
              label={t('parcelScan')}
              {...register('parcelScan')}
              error={errors?.parcelScan?.message}
            />
          )}
          {action.kind === 'inspection' && (
            <>
              <Input
                label={t('receivedQty')}
                type="number"
                {...register('qty', { valueAsNumber: true })}
                error={errors?.qty?.message}
              />
              <Select
                label={t('classification')}
                {...register('classification')}
                error={errors?.classification?.message}
                options={['ACCEPTED', 'DAMAGED', 'UNKNOWN'].map((value) => ({
                  value,
                  label: t(`classification_${value}`),
                }))}
              />
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-[var(--sc-text-primary)]">{t('photo')}</p>
                <Dropzone
                  files={file ? [file] : []}
                  onFilesChange={(next) => {
                    setFile(next[0] ?? null);
                    setPhotoError(false);
                  }}
                  accept={PHOTO_ACCEPT}
                  multiple={false}
                  maxSizeMb={PHOTO_MAX_MB}
                  disabled={busy || !!pending.current}
                  inputLabel={t('photo')}
                />
              </div>
            </>
          )}
          {action.kind === 'review' && (
            <>
              <Select
                label={t('decision')}
                {...register('decision')}
                error={errors?.decision?.message}
                options={['APPROVE', 'CORRECT'].map((value) => ({ value, label: t(value) }))}
              />
              <Input label={t('reason')} {...register('reason')} error={errors?.reason?.message} />
            </>
          )}
          {action.kind === 'stock' && (
            <>
              <Alert variant="info" title={t('stockHint')} />
              <Select
                label={t('destination')}
                {...register('destination')}
                error={errors?.destination?.message}
                options={['SELLABLE', 'QUARANTINE'].map((value) => ({ value, label: t(value) }))}
              />
              <Select
                label={t('bin')}
                {...register('toBinId')}
                error={errors?.toBinId?.message}
                options={[
                  { value: '', label: t('chooseBin') },
                  ...bins.map((b) => ({
                    value: b.id,
                    label: `${b.code} · ${t(b.zoneType === 'STORAGE' ? 'SELLABLE' : 'QUARANTINE')}`,
                  })),
                ]}
              />
              <Input
                label={t('binScan')}
                {...register('binScan')}
                error={errors.binScan?.message}
              />
            </>
          )}
        </fieldset>
        <div className="flex gap-3 pt-1">
          <Button type="submit" isLoading={busy}>
            {t(pending.current ? 'retry' : 'submit')}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
