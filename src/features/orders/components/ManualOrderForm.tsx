import { useEffect, useMemo, useRef, useState } from 'react';

import { useFieldArray, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useProducts } from '@/features/catalog';
import { createUuid } from '@/lib/uuid';
import { useAuthStore } from '@/stores/authStore';

import { OrderPaymentSummary } from './OrderPaymentSummary';
import {
  completeManualDraft,
  manualDraftSchema,
  normalizeOrderMoneyInput,
  calculateOrderPayment,
  ordersApi,
  type ManualDraft,
} from '../api/ordersApi';
import { useOrderLocations } from '../hooks/useOrderLocations';
import { orderErrorKey } from '../lib/orderFeedback';
import { orderScope, sellerOrderAccess } from '../lib/orderScope';

export function ManualOrderForm({
  scope,
  isOpen,
  onClose,
  onAccepted,
  onBusyChange,
}: {
  scope: string;
  isOpen: boolean;
  onClose: () => void;
  onAccepted: (id: string, code: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations('Orders');
  const canIntake = useAuthStore((state) => state.user?.serviceStatus === 'ACTIVE');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const filters = useMemo(
    () => ({ search: debouncedSearch, isActive: 'true' as const }),
    [debouncedSearch],
  );
  const products = useProducts(filters);
  const addresses = useOrderLocations(scope);
  const [cachedProducts, setCachedProducts] = useState<typeof products.products>([]);
  useEffect(() => {
    setCachedProducts((previous) => [
      ...new Map(
        [...previous, ...products.products].map((product) => [product.id, product]),
      ).values(),
    ]);
  }, [products.products]);
  const automaticCode = useRef(
    `ORCA-${createUuid().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
  );
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope) controller.current?.abort();
    });
    return () => {
      unsubscribe();
      controller.current?.abort();
    };
  }, [scope]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const form = useForm<ManualDraft>({
    resolver: zodResolver(manualDraftSchema),
    mode: 'onTouched',
    defaultValues: {
      entryMode: 'DIRECT',
      collectionAmount: '',
      deliveryNote: '',
      goodsPaymentMode: 'COD',
      paymentBreakdown: {
        discountAmount: '0',
        goodsPaidAmount: '0',
        shippingChargeAmount: '0',
        shippingPaidAmount: '0',
      },
      externalOrderCode: '',
      sourceChannel: 'manual',
      recipientName: '',
      recipientPhone: '',
      recipientAddress: '',
      toProvinceCode: '',
      toWardCode: '',
      codAmount: '',
      declaredValue: '',
      customerShippingFee: '0',
      shippingFeePayer: 'SENDER',
      items: [{ productId: '', qty: 1, unitPrice: '' }],
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'items' });
  const resetDraft = () => {
    form.reset();
    automaticCode.current = `ORCA-${createUuid().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    operation.current = null;
    setError(null);
    setSearch('');
    setDebouncedSearch('');
    setConfirmDiscard(false);
  };
  const province = form.watch('toProvinceCode');
  const draft = form.watch();
  const direct = draft.entryMode === 'DIRECT';
  const paymentMode = draft.goodsPaymentMode ?? 'COD';
  // RHF mutates watched values before registered onChange callbacks; snapshot the IDs.
  const selectedIds = draft.items.map((item) => item.productId);
  const payer =
    /^(0|[1-9]\d{0,11})$/.test(draft.paymentBreakdown?.shippingChargeAmount ?? '') &&
    BigInt(draft.paymentBreakdown?.shippingChargeAmount ?? '0') > BigInt(0)
      ? 'RECIPIENT'
      : 'SENDER';
  const searching = products.isLoading || search.trim() !== debouncedSearch;
  let goodsTotal: string | null = null;
  let paymentError = false;
  const paymentErrors: Record<string, string> = {};
  let paymentSummary: ReturnType<typeof calculateOrderPayment> | null = null;
  try {
    if (
      !direct &&
      draft.items.every(
        (item) =>
          Number.isInteger(item.qty) && item.qty > 0 && /^(0|[1-9]\d{0,11})$/.test(item.unitPrice),
      )
    ) {
      goodsTotal = draft.items
        .reduce((sum, item) => sum + BigInt(item.qty) * BigInt(item.unitPrice), BigInt(0))
        .toString();
      if (
        /^(|0|[1-9]\d{0,11})$/.test(draft.codAmount) &&
        /^(0|[1-9]\d{0,11})$/.test(draft.customerShippingFee)
      ) {
        if (draft.paymentBreakdown) {
          const p = draft.paymentBreakdown;
          const isMoney = (v: string) => /^(0|[1-9]\d{0,11})$/.test(v);
          if (isMoney(p.discountAmount)) {
            const net = BigInt(goodsTotal) - BigInt(p.discountAmount);
            if (net < BigInt(0)) paymentErrors.discountAmount = t('discount_exceeds');
            else if (
              paymentMode === 'PARTIAL' &&
              isMoney(p.goodsPaidAmount) &&
              BigInt(p.goodsPaidAmount) > net
            ) {
              paymentErrors.goodsPaidAmount = t('goods_paid_exceeds');
            }
          }
          if (
            isMoney(p.shippingChargeAmount) &&
            isMoney(p.shippingPaidAmount) &&
            BigInt(p.shippingPaidAmount) > BigInt(p.shippingChargeAmount)
          ) {
            paymentErrors.shippingPaidAmount = t('shipping_paid_exceeds');
          }
          paymentSummary = calculateOrderPayment(
            goodsTotal,
            draft.paymentBreakdown,
            payer,
            paymentMode,
          );
        }
      }
    }
  } catch {
    paymentError = true;
  }
  const options = cachedProducts
    .filter(
      (product) =>
        selectedIds.includes(product.id) ||
        products.products.some((current) => current.id === product.id),
    )
    .map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }));
  const addProduct = (productId: string) => {
    if (selectedIds.includes(productId)) return;
    const emptyIndex = draft.items.findIndex((item) => !item.productId);
    if (emptyIndex >= 0) {
      form.setValue(`items.${emptyIndex}.productId`, productId, {
        shouldValidate: true,
        shouldDirty: true,
      });
      form.setValue(`items.${emptyIndex}.unitPrice`, '', { shouldDirty: true });
      form.setFocus(`items.${emptyIndex}.${direct ? 'qty' : 'unitPrice'}`);
    } else if (draft.items.length < 100) {
      lines.append(
        { productId, qty: 1, unitPrice: '' },
        {
          focusName: `items.${draft.items.length}.${direct ? 'qty' : 'unitPrice'}`,
        },
      );
    } else {
      return;
    }
    setSearch('');
    setDebouncedSearch('');
  };
  const itemGroupError =
    form.formState.errors.items?.root?.message || form.formState.errors.items?.message;
  const submit = form.handleSubmit(async (draft) => {
    if (
      running.current ||
      orderScope() !== scope ||
      !sellerOrderAccess().create ||
      !sellerOrderAccess().intake
    ) {
      return;
    }
    let input;
    try {
      input = completeManualDraft(draft, automaticCode.current);
    } catch {
      setError(t('payment_breakdown_error'));
      return;
    }
    running.current = true;
    onBusyChange(true);
    controller.current = new AbortController();
    setError(null);
    const payload = JSON.stringify(input);
    if (operation.current?.payload !== payload) {
      operation.current = { payload, key: `manual.${createUuid()}` };
    }
    try {
      const accepted = await ordersApi.create(
        input,
        operation.current.key,
        controller.current.signal,
      );
      if (orderScope() === scope && sellerOrderAccess().create) {
        resetDraft();
        onAccepted(accepted.orderId, input.externalOrderCode);
      }
    } catch (failure) {
      if (orderScope() === scope && !controller.current?.signal.aborted) {
        setError(t(orderErrorKey(failure)));
      }
    } finally {
      running.current = false;
      if (orderScope() === scope) onBusyChange(false);
    }
  });
  const invalid = (field: keyof ManualDraft) =>
    form.formState.errors[field]
      ? t(
          field === 'recipientPhone'
            ? 'phone_error'
            : ['codAmount', 'customerShippingFee', 'declaredValue'].includes(field)
              ? 'money_error'
              : 'invalid_field',
        )
      : undefined;
  return (
    <Modal isOpen={isOpen} title={t('create')} width="900px" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Alert>{t('manual_hint')}</Alert>
        {form.formState.isDirty && (
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('draft_kept_hint')}</p>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        <fieldset disabled={form.formState.isSubmitting} className="space-y-5">
          <Select
            label={t('entryMode')}
            {...form.register('entryMode', {
              onChange: (event: { target: { value: string } }) => {
                // Hidden fields from the other entry mode must not block submission.
                if (event.target.value === 'DIRECT') {
                  form.setValue('codAmount', '');
                  form.setValue('customerShippingFee', '0');
                  form.setValue('shippingFeePayer', 'SENDER');
                  for (const field of [
                    'discountAmount',
                    'goodsPaidAmount',
                    'shippingChargeAmount',
                    'shippingPaidAmount',
                  ] as const) {
                    if (
                      !/^(0|[1-9]\d{0,11})$/.test(form.getValues(`paymentBreakdown.${field}`) ?? '')
                    ) {
                      form.setValue(`paymentBreakdown.${field}`, '0');
                    }
                  }
                  draft.items.forEach((item, index) => {
                    if (!/^(|0|[1-9]\d{0,11})$/.test(item.unitPrice)) {
                      form.setValue(`items.${index}.unitPrice`, '');
                    }
                  });
                } else if (!/^(|0|[1-9]\d{0,11})$/.test(form.getValues('collectionAmount') ?? '')) {
                  form.setValue('collectionAmount', '');
                }
                form.clearErrors();
              },
            })}
            options={[
              { value: 'DIRECT', label: t('directEntry') },
              { value: 'CALCULATED', label: t('calculatedEntry') },
            ]}
          />
          <section className="space-y-4">
            <h3 className="text-lg font-semibold">{t('recipient_section')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('fields.recipientName')}
                {...form.register('recipientName')}
                error={invalid('recipientName')}
                required
                autoComplete="name"
              />
              <Input
                label={t('fields.recipientPhone')}
                {...form.register('recipientPhone')}
                error={invalid('recipientPhone')}
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0901234567"
              />
              <Select
                label={t('fields.toProvinceCode')}
                {...form.register('toProvinceCode', {
                  onChange: () => form.setValue('toWardCode', ''),
                })}
                options={addresses.locations
                  .filter((l) => l.type === 'PROVINCE')
                  .map((l) => ({ value: l.code, label: l.name }))}
                required
                disabled={addresses.loading || addresses.error}
                error={invalid('toProvinceCode')}
              />
              <Select
                label={t('fields.toWardCode')}
                {...form.register('toWardCode')}
                options={addresses.locations
                  .filter((l) => l.type === 'WARD' && l.parentCode === province)
                  .map((l) => ({ value: l.code, label: l.name }))}
                required
                disabled={!province || addresses.loading || addresses.error}
                helperText={!province ? t('select_province_first') : undefined}
                error={invalid('toWardCode')}
              />
              <Input
                label={t('fields.recipientAddress')}
                {...form.register('recipientAddress')}
                required
                autoComplete="street-address"
                helperText={t('street_hint')}
                error={invalid('recipientAddress')}
              />
            </div>
            {(addresses.error || (!addresses.loading && !addresses.locations.length)) && (
              <Alert variant="error">
                {t(addresses.error ? 'address_load_error' : 'address_error')}
                <Button type="button" variant="ghost" onClick={addresses.retry}>
                  {t('retry')}
                </Button>
              </Alert>
            )}
          </section>
          <section className="space-y-4">
            <h3 className="text-lg font-semibold">{t('items_section')}</h3>
            <Input
              label={t('search_products')}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search_products_hint')}
              helperText={t('search_products_help')}
            />
            {searching && <p role="status">{t('searching_products')}</p>}
            {search.trim() && (
              <Button type="button" variant="ghost" onClick={() => setSearch('')}>
                {t('clear_product_search')}
              </Button>
            )}
            {products.error && (
              <Alert variant="error">
                {t('products_error')}
                <Button type="button" variant="ghost" onClick={() => void products.refetch()}>
                  {t('retry')}
                </Button>
              </Alert>
            )}
            {!searching && !products.error && !products.products.length && (
              <Alert>{t(search ? 'no_product_matches' : 'no_products')}</Alert>
            )}
            {search.trim() && !searching && !products.error && products.products.length > 0 && (
              <div className="space-y-2" aria-label={t('product_search_results')}>
                <p role="status">
                  {t('product_search_count', { count: products.products.length })}
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {products.products.map((product) => (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--sc-border-default)] p-3"
                    >
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-[var(--sc-text-secondary)]">{product.sku}</p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={t(
                          selectedIds.includes(product.id)
                            ? 'product_already_added_name'
                            : 'add_product_name',
                          { name: product.name },
                        )}
                        disabled={
                          selectedIds.includes(product.id) ||
                          (draft.items.length >= 100 &&
                            !draft.items.some((item) => !item.productId))
                        }
                        onClick={() => addProduct(product.id)}
                      >
                        {t(
                          selectedIds.includes(product.id)
                            ? 'product_already_added'
                            : 'add_product',
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
                {products.hasNextPage && (
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={products.isLoadingMore}
                    onClick={() => void products.loadMore()}
                  >
                    {t('more_products')}
                  </Button>
                )}
              </div>
            )}
            {lines.fields.map((field, index) => (
              <div
                key={field.id}
                className={`grid gap-3 ${direct ? 'sm:grid-cols-[2fr_1fr_auto]' : 'sm:grid-cols-[2fr_1fr_1fr_auto]'}`}
              >
                <Select
                  label={t('product')}
                  {...form.register(`items.${index}.productId`, {
                    onChange: (event: { target: { value: string } }) => {
                      if (event.target.value !== selectedIds[index]) {
                        form.setValue(`items.${index}.unitPrice`, '', { shouldDirty: true });
                        form.clearErrors(`items.${index}.unitPrice`);
                      }
                    },
                  })}
                  options={options.filter(
                    (option) =>
                      option.value === draft.items[index]?.productId ||
                      !selectedIds.includes(option.value),
                  )}
                  required
                  error={
                    form.formState.errors.items?.[index]?.productId
                      ? t('choose_product')
                      : undefined
                  }
                />
                <Input
                  label={t('quantity')}
                  type="number"
                  min={1}
                  max={1000000}
                  {...form.register(`items.${index}.qty`, { valueAsNumber: true })}
                  required
                  error={
                    form.formState.errors.items?.[index]?.qty ? t('quantity_error') : undefined
                  }
                />
                {!direct && (
                  <Input
                    label={t('unit_price')}
                    inputMode="numeric"
                    {...form.register(`items.${index}.unitPrice`, {
                      setValueAs: normalizeOrderMoneyInput,
                    })}
                    placeholder={t('price_placeholder')}
                    helperText={
                      /^(0|[1-9]\d{0,11})$/.test(draft.items[index]?.unitPrice) &&
                      Number.isInteger(draft.items[index]?.qty) &&
                      draft.items[index]?.qty > 0
                        ? `${t('line_total')}: ${(BigInt(draft.items[index].qty) * BigInt(draft.items[index].unitPrice)).toLocaleString('vi-VN')} ₫`
                        : t('price_hint')
                    }
                    required
                    error={
                      form.formState.errors.items?.[index]?.unitPrice ? t('money_error') : undefined
                    }
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t('remove_product_line', { number: index + 1 })}
                  onClick={() => lines.remove(index)}
                  disabled={lines.fields.length <= 1}
                >
                  {t('remove')}
                </Button>
              </div>
            ))}
            {itemGroupError && (
              <p role="alert" className="text-[var(--sc-error)]">
                {t('items_error')}
              </p>
            )}
            {products.hasNextPage && !search.trim() && (
              <Button
                type="button"
                variant="secondary"
                isLoading={products.isLoadingMore}
                onClick={() => void products.loadMore()}
              >
                {t('more_products')}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={lines.fields.length >= 100}
              onClick={() => lines.append({ productId: '', qty: 1, unitPrice: '' })}
            >
              {t('add_item')}
            </Button>
          </section>
          {direct && (
            <section className="space-y-4">
              <Input
                label={t('collectionAmount')}
                inputMode="numeric"
                required
                {...form.register('collectionAmount', { setValueAs: normalizeOrderMoneyInput })}
                error={form.formState.errors.collectionAmount ? t('collectionRequired') : undefined}
                helperText={t('collectionHint')}
              />
              <Input
                label={t('deliveryNote')}
                {...form.register('deliveryNote')}
                maxLength={500}
                error={form.formState.errors.deliveryNote ? t('invalid_field') : undefined}
              />
              <Alert>{t('freightSeparateHint')}</Alert>
            </section>
          )}
          {!direct && (
            <section className="space-y-4">
              <h3 className="text-lg font-semibold">{t('payment_section')}</h3>
              <Input
                label={t('deliveryNote')}
                {...form.register('deliveryNote')}
                maxLength={500}
                error={form.formState.errors.deliveryNote ? t('invalid_field') : undefined}
              />
              <p>
                {t('goods_total')}:{' '}
                {goodsTotal === null
                  ? t('enter_valid_prices')
                  : `${BigInt(goodsTotal).toLocaleString('vi-VN')} ₫`}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label={t('payment_method')}
                  value={paymentMode}
                  onChange={(event) => {
                    const mode = event.target.value as 'COD' | 'PAID' | 'PARTIAL';
                    form.setValue('goodsPaymentMode', mode);
                    form.setValue('paymentBreakdown.goodsPaidAmount', '0');
                  }}
                  options={[
                    { value: 'COD', label: t('payment_cod') },
                    { value: 'PAID', label: t('payment_paid') },
                    { value: 'PARTIAL', label: t('payment_partial') },
                  ]}
                />
                {paymentMode === 'PARTIAL' && (
                  <Input
                    label={t('goods_paid')}
                    {...form.register('paymentBreakdown.goodsPaidAmount', {
                      setValueAs: normalizeOrderMoneyInput,
                    })}
                    inputMode="numeric"
                    helperText={t('goods_paid_hint')}
                    error={
                      paymentErrors.goodsPaidAmount ||
                      (form.formState.errors.paymentBreakdown?.goodsPaidAmount
                        ? t('money_error')
                        : undefined)
                    }
                  />
                )}
                <Input
                  label={t('discount')}
                  inputMode="numeric"
                  {...form.register('paymentBreakdown.discountAmount', {
                    setValueAs: normalizeOrderMoneyInput,
                  })}
                  helperText={t('discount_hint')}
                  error={
                    paymentErrors.discountAmount ||
                    (form.formState.errors.paymentBreakdown?.discountAmount
                      ? t('money_error')
                      : undefined)
                  }
                />
                <>
                  <Input
                    label={t('shipping_charge')}
                    inputMode="numeric"
                    {...form.register('paymentBreakdown.shippingChargeAmount', {
                      setValueAs: normalizeOrderMoneyInput,
                    })}
                    helperText={t('shipping_charge_hint')}
                    error={
                      paymentErrors.shippingChargeAmount ||
                      (form.formState.errors.paymentBreakdown?.shippingChargeAmount
                        ? t('money_error')
                        : undefined)
                    }
                  />
                  <Input
                    label={t('shipping_paid')}
                    inputMode="numeric"
                    {...form.register('paymentBreakdown.shippingPaidAmount', {
                      setValueAs: normalizeOrderMoneyInput,
                    })}
                    helperText={t('shipping_paid_hint')}
                    error={
                      paymentErrors.shippingPaidAmount ||
                      (form.formState.errors.paymentBreakdown?.shippingPaidAmount
                        ? t('money_error')
                        : undefined)
                    }
                  />
                </>
              </div>
              {paymentError && <Alert variant="error">{t('payment_breakdown_error')}</Alert>}
              {paymentSummary && goodsTotal !== null ? (
                <div aria-live="polite">
                  <OrderPaymentSummary
                    payment={{
                      ...paymentSummary,
                      totalAmount: goodsTotal,
                      shippingFeePayer: payer,
                    }}
                  />
                </div>
              ) : (
                <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
                  {t(paymentError ? 'check_payment_amounts' : 'enter_valid_prices')}
                </p>
              )}
            </section>
          )}
          <details className="space-y-4 rounded-lg border border-[var(--sc-border-default)] p-4">
            <summary className="cursor-pointer">{t('optional_section')}</summary>
            <Input
              label={t('fields.externalOrderCode')}
              {...form.register('externalOrderCode')}
              helperText={t('automatic_code_hint')}
              error={invalid('externalOrderCode')}
            />
            <Input
              label={t('fields.declaredValue')}
              {...form.register('declaredValue', { setValueAs: normalizeOrderMoneyInput })}
              inputMode="numeric"
              helperText={t(direct ? 'declaredCatalogHint' : 'automatic_value_hint')}
              error={invalid('declaredValue')}
            />
          </details>
          {confirmDiscard && (
            <Alert variant="warning">
              <p>{t(operation.current ? 'discard_sent_draft_hint' : 'discard_draft_hint')}</p>
              <div className="mt-3 flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setConfirmDiscard(false)}>
                  {t('keep_draft')}
                </Button>
                <Button type="button" variant="danger" onClick={resetDraft}>
                  {t('discard_draft')}
                </Button>
              </div>
            </Alert>
          )}
          <div className="flex justify-end gap-3">
            {form.formState.isDirty && !confirmDiscard && (
              <Button type="button" variant="ghost" onClick={() => setConfirmDiscard(true)}>
                {t('discard_draft')}
              </Button>
            )}
            <Button
              type="submit"
              isLoading={form.formState.isSubmitting}
              disabled={
                !canIntake ||
                paymentError ||
                products.isLoading ||
                addresses.loading ||
                addresses.error ||
                !addresses.locations.length
              }
            >
              {t('submit')}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
