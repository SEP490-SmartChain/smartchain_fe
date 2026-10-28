import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { withdrawalApi, type WithdrawalOptions } from '../api/withdrawalApi';
import { isRejectedOperation } from '../lib/fulfillmentRetry';
import { orderScope, sellerWithdrawalAccess } from '../lib/orderScope';
import {
  readPendingWithdrawal,
  persistPendingWithdrawal,
  clearPendingWithdrawal,
} from '../lib/withdrawalPending';
import {
  withdrawalAddressLine,
  withdrawalReviewError,
  withdrawalStockLabel,
} from '../lib/withdrawalReview';
import {
  withdrawalAddressFormSchema,
  type withdrawalCommandSchema,
  withdrawalFormSchema,
} from '../schemas/withdrawalSchema';

import type { z } from 'zod';

type AddressInput = z.infer<typeof withdrawalAddressFormSchema>;
type Pending =
  | { kind: 'ADDRESS'; input: AddressInput & { expectedVersion: number } }
  | { kind: 'WITHDRAWAL'; input: z.infer<typeof withdrawalCommandSchema> };
export function SellerWithdrawalForm({
  scope,
  isOpen,
  onClose,
  onAccepted,
}: {
  scope: string;
  isOpen: boolean;
  onClose: () => void;
  onAccepted: (id: string, code: string) => void;
}) {
  const t = useTranslations('Withdrawal');
  const [data, setData] = useState<WithdrawalOptions | null>(null),
    [locations, setLocations] = useState<Awaited<ReturnType<typeof withdrawalApi.locations>>>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(() => {
      const input = readPendingWithdrawal();
      return input ? { kind: 'WITHDRAWAL', input } : null;
    }),
    [reload, setReload] = useState(0);
  const running = useRef(false),
    abort = useRef(new AbortController());
  const address = useForm<AddressInput>({
    resolver: zodResolver(withdrawalAddressFormSchema),
    defaultValues: {
      recipientName: '',
      recipientPhone: '',
      address: '',
      provinceCode: '',
      wardCode: '',
    },
  });
  const form = useForm<z.infer<typeof withdrawalFormSchema>>({
    resolver: zodResolver(withdrawalFormSchema),
    defaultValues:
      pending?.kind === 'WITHDRAWAL'
        ? {
            selection: [
              pending.input.warehouseId,
              pending.input.productId,
              pending.input.lotId,
            ].join(':'),
            qty: pending.input.qty,
          }
        : { selection: '', qty: 1 },
  });
  const province = address.watch('provinceCode'),
    selection = form.watch('selection'),
    qty = form.watch('qty'),
    addressDraft = address.watch();
  const choices = data?.items ?? [],
    choice = choices.find(
      (item) => [item.warehouseId, item.productId, item.lotId].join(':') === selection,
    );
  const disabled = busy || !!pending;
  const reviewError = withdrawalReviewError(data?.address, addressDraft, choice, qty);
  const unsavedAddress = reviewError === 'ADDRESS_UNSAVED';
  function resetAddress(saved: NonNullable<WithdrawalOptions['address']>) {
    address.reset({
      recipientName: saved.recipientName,
      recipientPhone: saved.recipientPhone,
      address: saved.address,
      provinceCode: saved.provinceCode,
      wardCode: saved.wardCode,
    });
  }
  useEffect(() => {
    abort.current = new AbortController();
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope) abort.current.abort();
    });
    return () => {
      unsubscribe();
      abort.current.abort();
    };
  }, [scope]);
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    void Promise.all([
      withdrawalApi.options(controller.signal),
      withdrawalApi.locations(controller.signal),
    ])
      .then(([options, divisions]) => {
        if (controller.signal.aborted || orderScope() !== scope) return;
        setData(options);
        setLocations(divisions);
        if (options.address) {
          address.reset(
            withdrawalAddressFormSchema.parse({
              recipientName: options.address.recipientName,
              recipientPhone: options.address.recipientPhone,
              address: options.address.address,
              provinceCode: options.address.provinceCode,
              wardCode: options.address.wardCode,
            }),
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('loadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [isOpen, reload, scope, address, t]);
  async function execute(command: Pending) {
    if (running.current || orderScope() !== scope || !sellerWithdrawalAccess()) return;
    running.current = true;
    setBusy(true);
    setPending(command);
    setError('');
    setNotice('');
    try {
      if (command.kind === 'ADDRESS') {
        const saved = await withdrawalApi.register(command.input, abort.current.signal);
        if (orderScope() !== scope || abort.current.signal.aborted) return;
        setData((previous) => (previous ? { ...previous, address: saved } : previous));
        resetAddress(saved);
        setNotice(t('addressSaved'));
      } else {
        try {
          persistPendingWithdrawal(command.input);
        } catch {
          setPending(null);
          setError(t('recoveryUnavailable'));
          return;
        }
        const saved = await withdrawalApi.create(command.input, abort.current.signal);
        if (orderScope() !== scope || abort.current.signal.aborted) return;
        clearPendingWithdrawal(command.input.clientRequestId);
        form.reset({ selection: '', qty: 1 });
        onAccepted(saved.orderId, `WD-${command.input.clientRequestId}`);
        setNotice(t(saved.replayed ? 'recovered' : 'accepted'));
      }
      setPending(null);
    } catch (failure) {
      if (orderScope() !== scope || abort.current.signal.aborted) return;
      if (
        isRejectedOperation(failure) &&
        failure instanceof ApiError &&
        (command.kind !== 'WITHDRAWAL' || ![401, 403, 404, 429].includes(failure.status))
      ) {
        if (command.kind === 'WITHDRAWAL') clearPendingWithdrawal(command.input.clientRequestId);
        setPending(null);
        const code = failure.code.split('.').at(-1) ?? '';
        setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('rejected'));
      } else setError(t('unknown'));
    } finally {
      running.current = false;
      if (orderScope() === scope && !abort.current.signal.aborted) setBusy(false);
    }
  }
  async function more() {
    if (!data?.nextCursor || disabled) return;
    setBusy(true);
    try {
      const page = await withdrawalApi.options(abort.current.signal, data.nextCursor);
      if (orderScope() === scope && !abort.current.signal.aborted) {
        setData((previous) =>
          previous ? { ...page, items: [...previous.items, ...page.items] } : page,
        );
      }
    } catch {
      if (!abort.current.signal.aborted) setError(t('loadError'));
    } finally {
      if (!abort.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <Modal
      isOpen={isOpen}
      title={t('title')}
      width="850px"
      onClose={() => {
        if (!disabled) onClose();
      }}
    >
      <div className="space-y-5">
        <Alert>{t('description')}</Alert>
        {busy && <Alert role="status">{t('processing')}</Alert>}
        {error && (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        )}
        {error === t('errors.WITHDRAWAL_BLOCKED') && (
          <Alert variant="warning">
            <p>{t('eligibilityGuidance')}</p>
            <div className="mt-2 flex flex-wrap gap-4">
              <Link className="underline" to="/statements">
                {t('reviewBalance')}
              </Link>
              <Link className="underline" to="/settings/contract">
                {t('reviewContract')}
              </Link>
            </div>
          </Alert>
        )}
        {notice && (
          <Alert variant="success" role="status">
            {notice}
          </Alert>
        )}
        {pending?.kind === 'WITHDRAWAL' && (
          <Alert>
            {t('pendingReference', {
              code: 'WD-' + pending.input.clientRequestId,
              qty: pending.input.qty,
            })}
          </Alert>
        )}
        {pending && !busy && !error && <Alert>{t('unknown')}</Alert>}
        {pending && (
          <Button disabled={busy} onClick={() => void execute(pending)}>
            {t('retrySame')}
          </Button>
        )}
        {data?.address && (
          <section className="rounded-xl border border-[var(--sc-border-default)] p-4">
            <h3 className="text-base font-semibold">{t('shipTo')}</h3>
            <p>
              {data.address.recipientName} · {data.address.recipientPhone}
            </p>
            <p className="break-words">{withdrawalAddressLine(data.address, locations)}</p>
          </section>
        )}
        <details
          open={!data?.address || unsavedAddress}
          className="rounded-xl border border-[var(--sc-border-default)] p-4"
        >
          <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
            {t(data?.address ? 'editAddress' : 'registeredAddress')}
          </summary>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onChange={() => setNotice('')}
            onInvalidCapture={() => setNotice('')}
            onSubmit={address.handleSubmit((values) =>
              execute({
                kind: 'ADDRESS',
                input: { ...values, expectedVersion: data?.address?.version ?? 0 },
              }),
            )}
          >
            {(['recipientName', 'recipientPhone', 'address'] as const).map((name) => (
              <Input
                key={name}
                label={t(name)}
                required
                disabled={disabled || !data}
                {...address.register(name)}
                error={address.formState.errors[name] ? t('invalid') : undefined}
              />
            ))}
            <Select
              label={t('province')}
              required
              disabled={disabled || !data}
              options={locations
                .filter((v) => v.type === 'PROVINCE')
                .map((v) => ({ value: v.code, label: v.name }))}
              {...address.register('provinceCode')}
              onChange={(e) => {
                void address.register('provinceCode').onChange(e);
                address.setValue('wardCode', '');
              }}
              error={address.formState.errors.provinceCode ? t('invalid') : undefined}
            />
            <Select
              label={t('ward')}
              required
              disabled={disabled || !data}
              options={locations
                .filter((v) => v.type === 'WARD' && v.parentCode === province)
                .map((v) => ({ value: v.code, label: v.name }))}
              {...address.register('wardCode')}
              error={address.formState.errors.wardCode ? t('invalid') : undefined}
            />
            <Button type="submit" disabled={disabled || !data}>
              {t('saveAddress')}
            </Button>
            {unsavedAddress && (
              <Alert variant="warning" role="status" className="sm:col-span-2">
                <p>{t('unsavedAddress')}</p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    if (data?.address) resetAddress(data.address);
                  }}
                >
                  {t('revertAddress')}
                </Button>
              </Alert>
            )}
          </form>
        </details>
        {data && !busy && !error && !choices.length && !data.nextCursor && !pending && (
          <Alert role="status">{t('noStock')}</Alert>
        )}
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
          onChange={() => setNotice('')}
          onInvalidCapture={() => setNotice('')}
          onSubmit={form.handleSubmit((values) => {
            setNotice('');
            const issue = withdrawalReviewError(
              data?.address,
              address.getValues(),
              choice,
              values.qty,
            );
            if (issue === 'ADDRESS_UNSAVED') {
              setError(t('unsavedAddress'));
              return;
            }
            if (issue || !choice || !data?.address) {
              setError(t('unavailable'));
              return;
            }
            return execute({
              kind: 'WITHDRAWAL',
              input: {
                clientRequestId: createUuid(),
                warehouseId: choice.warehouseId,
                productId: choice.productId,
                lotId: choice.lotId,
                qty: values.qty,
                addressVersion: data.address.version,
              },
            });
          })}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <h3 className="text-base font-semibold">{t('chooseGoods')}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setReload((v) => v + 1)}
            >
              {t('reload')}
            </Button>
          </div>
          <Select
            label={t('stock')}
            required
            disabled={disabled || !data?.address}
            options={choices.map((item) => ({
              value: [item.warehouseId, item.productId, item.lotId].join(':'),
              label: withdrawalStockLabel(item),
            }))}
            {...form.register('selection')}
            error={form.formState.errors.selection ? t('invalid') : undefined}
          />
          <Input
            type="number"
            label={t('qty')}
            required
            disabled={disabled || !data?.address}
            min={1}
            max={choice?.availableQty ?? 1000000}
            {...form.register('qty', { valueAsNumber: true })}
            error={form.formState.errors.qty ? t('invalid') : undefined}
          />
          {choice && (
            <section className="space-y-2 break-words rounded-xl border border-[var(--sc-border-default)] p-4 sm:col-span-2">
              <h3 className="text-base font-semibold">{t('selectionReview')}</h3>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>{t('selectedProduct', { name: choice.productName, sku: choice.sku })}</p>
                <p>{t('selectedWarehouse', { name: choice.warehouseName })}</p>
                <p className="break-all">{t('selectedLot', { code: choice.lotCode })}</p>
                <p>
                  {t('selectedQuantity', {
                    requested: Number.isInteger(qty) && qty > 0 ? qty : '—',
                    available: choice.availableQty,
                  })}
                </p>
              </div>
            </section>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4 sm:col-span-2">
            {data?.nextCursor && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                disabled={disabled}
                onClick={() => void more()}
              >
                {t('more')}
              </Button>
            )}
            <Button type="submit" disabled={disabled || !!reviewError}>
              {t('submit')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
