import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { createUuid } from '@/lib/uuid';
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
};
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
      skuScan: '',
      lotScan: '',
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
          if (!action.line || !v.binScan || !v.skuScan || !v.lotScan) {
            throw new Error('SCAN_REQUIRED');
          }
          z.uuid().parse(v.toBinId);
          pending.current = {
            ...common,
            lineId: action.line.id,
            toBinId: v.toBinId,
            destination: v.destination,
            binScan: v.binScan,
            skuScan: v.skuScan,
            lotScan: v.lotScan,
          };
        } else pending.current = common;
      }
      if (useAuthStore.getState().revision !== revision) return;
      await returnWorkflowApi.command(warehouseId, `${action.id}/${action.kind}`, pending.current);
      if (useAuthStore.getState().revision === revision) onAccepted();
    } catch {
      if (useAuthStore.getState().revision === revision) setError(true);
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
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <p className="break-all text-sm">
          {action.id}
          {action.line ? ` · ${action.line.sku} · ${action.line.lotCode}` : ''}
        </p>
        {error && <Alert variant="error" title={t('commandError')} />}
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
                />
              ))}
            </>
          )}
          {action.kind === 'arrival' && (
            <Input label={t('parcelScan')} {...register('parcelScan')} />
          )}
          {action.kind === 'inspection' && (
            <>
              <Input
                label={t('receivedQty')}
                type="number"
                {...register('qty', { valueAsNumber: true })}
              />
              <Select
                label={t('classification')}
                {...register('classification')}
                options={['ACCEPTED', 'DAMAGED', 'UNKNOWN'].map((value) => ({
                  value,
                  label: t(`classification_${value}`),
                }))}
              />
              <Input
                label={t('photo')}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </>
          )}
          {action.kind === 'review' && (
            <>
              <Select
                label={t('decision')}
                {...register('decision')}
                options={['APPROVE', 'CORRECT'].map((value) => ({ value, label: t(value) }))}
              />
              <Input label={t('reason')} {...register('reason')} />
            </>
          )}
          {action.kind === 'stock' && (
            <>
              <Alert variant="info" title={t('stockHint')} />
              <Select
                label={t('destination')}
                {...register('destination')}
                options={['SELLABLE', 'QUARANTINE'].map((value) => ({ value, label: t(value) }))}
              />
              <Select
                label={t('bin')}
                {...register('toBinId')}
                options={[
                  { value: '', label: t('chooseBin') },
                  ...bins.map((b) => ({
                    value: b.id,
                    label: `${b.code} · ${t(b.zoneType === 'STORAGE' ? 'SELLABLE' : 'QUARANTINE')}`,
                  })),
                ]}
              />
              {(['binScan', 'skuScan', 'lotScan'] as const).map((key) => (
                <Input key={key} label={t(key)} {...register(key)} />
              ))}
            </>
          )}
        </fieldset>
        {!!pending.current && <Alert variant="info" title={t('retrySame')} />}
        <div className="flex gap-2">
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
