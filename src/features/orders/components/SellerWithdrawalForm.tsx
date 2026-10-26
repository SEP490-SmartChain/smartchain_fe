import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { withdrawalApi, type WithdrawalOptions } from '../api/withdrawalApi';
import { orderScope, sellerWithdrawalAccess } from '../lib/orderScope';
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
    [pending, setPending] = useState<Pending | null>(null),
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
    defaultValues: { selection: '', qty: 1 },
  });
  const province = address.watch('provinceCode'),
    selection = form.watch('selection');
  const choices = data?.items ?? [],
    choice = choices.find(
      (item) => [item.warehouseId, item.productId, item.lotId].join(':') === selection,
    );
  const disabled = busy || !!pending;
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
        setNotice(t('addressSaved'));
      } else {
        const saved = await withdrawalApi.create(command.input, abort.current.signal);
        if (orderScope() !== scope || abort.current.signal.aborted) return;
        form.reset();
        onAccepted(saved.orderId, `WD-${command.input.clientRequestId}`);
        setNotice(t('accepted'));
      }
      setPending(null);
    } catch (failure) {
      if (orderScope() !== scope || abort.current.signal.aborted) return;
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
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
        {error && (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert variant="success" role="status">
            {notice}
          </Alert>
        )}
        {pending && (
          <Button disabled={busy} onClick={() => void execute(pending)}>
            {t('retrySame')}
          </Button>
        )}
        <Button variant="outline" disabled={disabled} onClick={() => setReload((v) => v + 1)}>
          {t('reload')}
        </Button>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onChange={() => setNotice('')}
          onInvalidCapture={() => setNotice('')}
          onSubmit={address.handleSubmit((values) =>
            execute({
              kind: 'ADDRESS',
              input: { ...values, expectedVersion: data?.address?.version ?? 0 },
            }),
          )}
        >
          <h3 className="font-semibold sm:col-span-2">{t('registeredAddress')}</h3>
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
        </form>
        {data?.address && (
          <section className="rounded-xl border border-[var(--sc-border-default)] p-4">
            <h3 className="font-semibold">{t('shipTo')}</h3>
            <p>
              {data.address.recipientName} · {data.address.recipientPhone}
            </p>
            <p>{data.address.address}</p>
          </section>
        )}
        <form
          className="grid gap-3 sm:grid-cols-2"
          onChange={() => setNotice('')}
          onInvalidCapture={() => setNotice('')}
          onSubmit={form.handleSubmit((values) => {
            setNotice('');
            if (!choice || !data?.address || values.qty > choice.availableQty) {
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
          <Select
            label={t('stock')}
            required
            disabled={disabled || !data?.address}
            options={choices.map((item) => ({
              value: [item.warehouseId, item.productId, item.lotId].join(':'),
              label: `${item.warehouseName} · ${item.sku} · ${item.lotCode} (${item.availableQty})`,
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
          {data?.nextCursor && (
            <Button type="button" variant="outline" disabled={disabled} onClick={() => void more()}>
              {t('more')}
            </Button>
          )}
          <Button type="submit" disabled={disabled || !data?.address}>
            {t('submit')}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
