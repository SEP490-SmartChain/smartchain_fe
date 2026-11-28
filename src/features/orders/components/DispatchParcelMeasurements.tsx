import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input } from '@/components/Common';

import { ordersApi, type SellerOrderDetail } from '../api/ordersApi';
import { orderScope } from '../lib/orderScope';
import { type OrderLookupItem } from '../seller-freight/shared/schema';

interface DispatchParcelMeasurementsProps {
  scope: string;
  order: { id: string; externalOrderCode: string };
  initialAssumptions?: OrderLookupItem['assumptions'];
  onCancel: () => void;
  onSave: (item: OrderLookupItem) => void;
}

const dimension = z.string().regex(/^(?:[1-9][0-9]{0,2}|1000)$/);
const schema = z.object({
  parcels: z
    .array(
      z.object({
        weightG: z.string().regex(/^(?:[1-9][0-9]{0,5}|1000000)$/),
        lengthCm: dimension,
        widthCm: dimension,
        heightCm: dimension,
      }),
    )
    .min(1),
});
const measurements = [
  ['weightG', 1_000_000],
  ['lengthCm', 1_000],
  ['widthCm', 1_000],
  ['heightCm', 1_000],
] as const;

export function DispatchParcelMeasurements({
  scope,
  order,
  initialAssumptions,
  onCancel,
  onSave,
}: DispatchParcelMeasurementsProps) {
  const t = useTranslations('OrderReview');
  const [detail, setDetail] = useState<SellerOrderDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const { reset } = form;
  useEffect(() => {
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && orderScope() === scope;
    void ordersApi.detail(order.id, true, controller.signal).then(
      (next) => {
        if (!isCurrent()) return;
        setDetail(next);
        const visibleParcels = next.fulfillmentOrders.filter(
          ({ status, parcels }) =>
            status !== 'CANCELLED' &&
            !parcels.some(({ actualWeightG }) => (actualWeightG ?? 0) > 0),
        );
        if (visibleParcels.length > 0 && initialAssumptions?.length) {
          const byParcelId = new Map(
            initialAssumptions.map((item) => [item.fulfillmentOrderId, item.parcel]),
          );
          reset({
            parcels: visibleParcels.map((parcel) => {
              const saved = byParcelId.get(parcel.id);
              return {
                weightG: saved ? String(saved.weightG) : '',
                lengthCm: saved ? String(saved.lengthCm) : '',
                widthCm: saved ? String(saved.widthCm) : '',
                heightCm: saved ? String(saved.heightCm) : '',
              };
            }),
          });
        }
      },
      () => {
        if (isCurrent()) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [order.id, scope, attempt, initialAssumptions, reset]);

  const parcels =
    detail?.fulfillmentOrders.filter(
      ({ status, parcels }) =>
        status !== 'CANCELLED' && !parcels.some(({ actualWeightG }) => (actualWeightG ?? 0) > 0),
    ) ?? [];
  return (
    <div className="space-y-4">
      <div className="border-b border-[var(--sc-border-default)] pb-3">
        <h3 className="m-0 text-base font-semibold leading-6 text-[var(--sc-text-primary)]">
          {t('dimensionsTitle', { code: order.externalOrderCode })}
        </h3>
      </div>
      {failed && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('loadFailed')}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              {t('refresh')}
            </Button>
          </div>
        </Alert>
      )}
      {!detail && !failed && (
        <p role="status" className="m-0 text-sm text-[var(--sc-text-secondary)]">
          {t('loading')}
        </p>
      )}
      {detail && parcels.length === 0 && <Alert variant="warning">{t('unavailable')}</Alert>}
      {parcels.length > 0 ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit(({ parcels: submitted }) => {
            if (orderScope() !== scope) return;
            const assumptions = parcels.map((parcel, index) => {
              const values = submitted[index];
              return {
                fulfillmentOrderId: parcel.id,
                parcel: {
                  weightG: Number(values.weightG),
                  lengthCm: Number(values.lengthCm),
                  widthCm: Number(values.widthCm),
                  heightCm: Number(values.heightCm),
                  itemCount: parcel.items.reduce((count, item) => count + item.qty, 0),
                },
              };
            });
            onSave({ orderId: order.id, assumptions });
          })}
        >
          {parcels.map((parcel, index) => (
            <fieldset
              key={parcel.id}
              className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)] p-4"
            >
              <legend className="mb-3 text-sm font-semibold text-[var(--sc-text-primary)]">
                {t('parcel', { number: parcel.sequenceNo })}
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {measurements.map(([field, max]) => (
                  <Input
                    key={field}
                    label={t(field)}
                    inputMode="numeric"
                    {...form.register(`parcels.${index}.${field}`)}
                    error={
                      form.formState.errors.parcels?.[index]?.[field]
                        ? t('dimensionError', { max })
                        : undefined
                    }
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--sc-border-default)] pt-3.5">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('back')}
            </Button>
            <Button type="submit">{t('useDimensions')}</Button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end border-t border-[var(--sc-border-default)] pt-3.5">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('back')}
          </Button>
        </div>
      )}
    </div>
  );
}
