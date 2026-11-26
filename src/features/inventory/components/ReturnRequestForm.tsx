import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Button, Input } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { ReturnPickupDivisionFields } from './ReturnPickupDivisionFields';
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
  const t = useTranslations('Returns'),
    locale = useLocale();
  const revision = useAuthStore((s) => s.revision);
  const [operationId] = useState(createUuid),
    [sources, setSources] = useState<ReturnEligibleSource[]>([]),
    [cursor, setCursor] = useState<string>(),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const pending = useRef<unknown>(null),
    running = useRef(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFieldError,
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
  const selectedId = watch('sourceId');
  const needle = query.trim().toLowerCase();
  const visibleSources = needle
    ? sources.filter((s) =>
        [s.orderCode, s.productName, s.sku, s.lotCode].some((v) =>
          v.toLowerCase().includes(needle),
        ),
      )
    : sources;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  async function submit(v: Form) {
    if (running.current || useAuthStore.getState().revision !== revision) return;
    running.current = true;
    setBusy(true);
    setError(false);
    try {
      if (!pending.current) {
        const source = sources.find((s) => s.id === v.sourceId);
        if (!source) {
          setFieldError('sourceId', { type: 'validate' });
          return;
        }
        if (v.qty > source.remainingQty) {
          setFieldError('qty', { type: 'max' });
          return;
        }
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
      width="760px"
      title={t('request')}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="space-y-5" onSubmit={handleSubmit(submit, () => notifyInvalidForm())}>
        <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-[var(--sc-text-secondary)]">
          <li>{t('requestRuleWindow')}</li>
        </ul>
        {error && <Alert variant="error" title={t('commandError')} />}
        <fieldset
          disabled={busy || !!pending.current || loading}
          className="m-0 space-y-5 border-0 p-0"
        >
          <div className="space-y-2">
            <legend className="text-sm font-semibold">{t('source')}</legend>
            {loading && <p role="status">{t('loading')}</p>}
            {!loading && sources.length === 0 && (
              <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{t('noEligible')}</p>
            )}
            {sources.length > 0 && (
              <Input
                type="search"
                placeholder={t('searchSource')}
                aria-label={t('searchSource')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {sources.length > 0 && visibleSources.length === 0 && (
              <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{t('noMatch')}</p>
            )}
            <div
              role="radiogroup"
              aria-label={t('source')}
              className="max-h-72 space-y-2 overflow-y-auto pr-1"
            >
              {visibleSources.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150 hover:border-[var(--sc-primary)] ${
                    selectedId === s.id
                      ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)]'
                      : 'border-[var(--sc-border-default)]'
                  }`}
                >
                  <input
                    type="radio"
                    value={s.id}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--sc-primary)]"
                    {...register('sourceId')}
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-semibold">
                        {t('orderCode', { code: s.orderCode })}
                        {s.parcelSequenceNo > 1 && (
                          <span className="ml-1 font-normal text-[var(--sc-text-secondary)]">
                            · {t('parcelNo', { n: s.parcelSequenceNo })}
                          </span>
                        )}
                      </span>
                      {s.deliveredAt && (
                        <span className="text-xs text-[var(--sc-text-secondary)]">
                          {t('deliveredOn', { date: dateFormat.format(new Date(s.deliveredAt)) })}
                        </span>
                      )}
                    </span>
                    <span className="block text-sm">
                      {s.productName}
                      <span className="text-[var(--sc-text-secondary)]"> · {s.sku}</span>
                    </span>
                    <span className="block text-xs text-[var(--sc-text-secondary)]">
                      {t('remainingQty', { qty: s.remainingQty })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {errors.sourceId && <Alert variant="error" compact title={t('chooseSourceError')} />}
            {(cursor || next) && (
              <div className="flex gap-2">
                {cursor && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor(undefined)}
                  >
                    {t('first')}
                  </Button>
                )}
                {next && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setCursor(next)}>
                    {t('next')}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Input
              label={t('qty')}
              type="number"
              min={1}
              {...register('qty', { valueAsNumber: true })}
              error={errors.qty ? t('qtyInvalid') : undefined}
            />
            <Input
              label={t('reason')}
              placeholder={t('reasonPlaceholder')}
              autoComplete="off"
              {...register('reason')}
              error={errors.reason ? t('reasonInvalid') : undefined}
            />
          </div>
          <div className="space-y-3 border-t border-[var(--sc-border-default)] pt-4">
            <p className="m-0 text-sm font-semibold">{t('pickupSection')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(['name', 'phone'] as const).map((key) => (
                <Input
                  key={key}
                  label={t(key)}
                  {...register(key)}
                  autoComplete={key === 'name' ? 'name' : 'tel'}
                  error={errors[key] ? t(`${key}Invalid`) : undefined}
                />
              ))}
            </div>
            <Input
              label={t('address')}
              {...register('address')}
              error={errors.address ? t('addressInvalid') : undefined}
            />
            <ReturnPickupDivisionFields
              register={register}
              setValue={setValue}
              errors={errors}
              provinceCode={watch('provinceCode')}
            />
          </div>
        </fieldset>
        {!!pending.current && <Alert variant="info" title={t('retrySame')} />}
        <div className="mt-2 flex justify-end gap-2 border-t border-[var(--sc-border-default)] pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t('close')}
          </Button>
          <Button
            type="submit"
            isLoading={busy}
            disabled={loading || (!pending.current && sources.length === 0)}
          >
            {t(pending.current ? 'retry' : 'submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
