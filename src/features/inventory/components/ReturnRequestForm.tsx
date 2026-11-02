import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { returnWorkflowApi, type ReturnEligibleSource } from '../api/returnWorkflowApi';
import {
  returnRequestSchema,
  type ReturnRequestForm as Form,
} from '../schemas/returnWorkflowSchema';

export function ReturnRequestForm({
  warehouseId,
  onClose,
  onAccepted,
}: {
  warehouseId: string;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const t = useTranslations('Returns');
  const revision = useAuthStore((s) => s.revision);
  const [operationId] = useState(createUuid),
    [sources, setSources] = useState<ReturnEligibleSource[]>([]),
    [cursor, setCursor] = useState<string>(),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const pending = useRef<unknown>(null),
    running = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(returnRequestSchema),
    defaultValues: {
      qty: 1,
      sourceId: '',
      reason: '',
      name: '',
      phone: '',
      address: '',
      provinceCode: '',
      wardCode: '',
    },
  });
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(false);
    setSources([]);
    void returnWorkflowApi
      .eligible(warehouseId, cursor, abort.signal)
      .then((p) => {
        if (!abort.signal.aborted) {
          setSources(p.items.filter((s) => s.remainingQty > 0));
          setNext(p.nextCursor);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [warehouseId, cursor]);
  async function submit(v: Form) {
    if (running.current || useAuthStore.getState().revision !== revision) return;
    running.current = true;
    setBusy(true);
    setError(false);
    try {
      if (!pending.current) {
        const source = sources.find((s) => s.id === v.sourceId);
        if (!source || v.qty > source.remainingQty) throw new Error('QUANTITY_EXCEEDED');
        pending.current = {
          operationId,
          fulfillmentOrderId: source.fulfillmentOrderId,
          reason: v.reason,
          lines: [{ fulfillmentItemLotId: source.id, qty: v.qty }],
          pickup: {
            name: v.name,
            phone: v.phone,
            address: v.address,
            provinceCode: v.provinceCode,
            wardCode: v.wardCode,
          },
        };
      }
      await returnWorkflowApi.command(warehouseId, '', pending.current);
      if (useAuthStore.getState().revision === revision) onAccepted();
    } catch {
      if (useAuthStore.getState().revision === revision) setError(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      isOpen
      title={t('request')}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('requestHint')}</p>
        {error && <Alert variant="error" title={t('commandError')} />}
        {loading && <p role="status">{t('loading')}</p>}
        <fieldset disabled={busy || !!pending.current || loading} className="space-y-3">
          <Select
            label={t('source')}
            {...register('sourceId')}
            options={[
              { value: '', label: t('chooseSource') },
              ...sources.map((s) => ({
                value: s.id,
                label: `${s.sku} · ${s.lotCode} · ${t('remaining')}: ${s.remainingQty}`,
              })),
            ]}
            error={errors.sourceId ? t('invalid') : undefined}
          />
          <div className="flex gap-2">
            {cursor && (
              <Button type="button" variant="outline" onClick={() => setCursor(undefined)}>
                {t('first')}
              </Button>
            )}
            {next && (
              <Button type="button" variant="outline" onClick={() => setCursor(next)}>
                {t('next')}
              </Button>
            )}
          </div>
          <Input
            label={t('qty')}
            type="number"
            {...register('qty', { valueAsNumber: true })}
            error={errors.qty ? t('invalid') : undefined}
          />
          {(['reason', 'name', 'phone', 'address', 'provinceCode', 'wardCode'] as const).map(
            (key) => (
              <Input
                key={key}
                label={t(key)}
                {...register(key)}
                error={errors[key] ? t('invalid') : undefined}
              />
            ),
          )}
        </fieldset>
        {!!pending.current && <Alert variant="info" title={t('retrySame')} />}
        {!loading && sources.length === 0 && <p>{t('noEligible')}</p>}
        <div className="flex gap-2">
          <Button
            type="submit"
            isLoading={busy}
            disabled={loading || (!pending.current && sources.length === 0)}
          >
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
