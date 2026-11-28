import { useEffect, useState, useSyncExternalStore } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert, Button, Input } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { useAuthStore } from '@/stores/authStore';

import { orderCancellationApi } from '../api/orderCancellationApi';
import { createCancellationSession } from '../lib/cancellationSession';
import { orderScope } from '../lib/orderScope';
import { cancellationReasonSchema } from '../schemas/orderCancellationSchema';

import type { SellerOrderDetail } from '../api/ordersApi';
import type { z } from 'zod';

type Props = {
  order: Pick<SellerOrderDetail, 'id' | 'status' | 'holdReason' | 'version'>;
  orderCode?: string;
  onChanged: () => void;
};
export function OrderCancellationActions(props: Props) {
  const { can } = useAccess();
  const scope = useAuthStore(orderScope);
  if (!can('orders.cancellation.manage') && !can('orders.cancellation.ops')) return null;
  return <CancellationActionsSession key={`${scope}:${props.order.id}`} {...props} scope={scope} />;
}
function CancellationActionsSession({
  order,
  orderCode,
  onChanged,
  scope,
}: Props & { scope: string }) {
  const t = useTranslations('OrderCancellation');
  const { can } = useAccess();
  const [session] = useState(() =>
    createCancellationSession({
      scope,
      orderId: order.id,
      api: orderCancellationApi,
      onCompleted: () => {
        if (order.status !== 'CANCELLED') onChanged();
      },
    }),
  );
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const reason = useForm<z.infer<typeof cancellationReasonSchema>>({
    resolver: zodResolver(cancellationReasonSchema),
    defaultValues: { reason: state.pending?.reason ?? '' },
  });
  useEffect(() => {
    void session.check();
    return () => session.stop();
  }, [session]);
  const cancellable = ![
    'DISPATCHED',
    'IN_TRANSIT',
    'PARTIALLY_DELIVERED',
    'COMPLETED_WITH_EXCEPTION',
    'DELIVERED',
    'RETURNED',
    'CANCELLED',
  ].includes(order.status);
  const cancelled = order.status === 'CANCELLED' || state.cancellation?.status === 'CANCELLED';
  const processing =
    !cancelled &&
    (['PENDING', 'EXCEPTION'].includes(state.cancellation?.status ?? '') ||
      order.holdReason === 'CANCEL_PENDING');
  const canStart =
    cancellable &&
    !processing &&
    state.checked &&
    state.cancellation?.status === 'NOT_REQUESTED' &&
    !state.pending;
  const idleCancelable =
    canStart && !state.review && !state.errorKey && !state.busy && !processing && !cancelled;
  if (idleCancelable) {
    return (
      <details className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-[var(--sc-error-dark)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
          {t('actions')}
        </summary>
        <div className="mt-3 border-t border-[var(--sc-border-default)] pt-3">
          <form
            className="space-y-3"
            onSubmit={reason.handleSubmit(
              (values) => {
                session.review(values.reason, order.version);
              },
              () => notifyInvalidForm(),
            )}
          >
            <Input
              label={t('cancelReason')}
              required
              {...reason.register('reason')}
              disabled={state.busy}
              error={reason.formState.errors.reason ? t('invalidInput') : undefined}
            />
            <Button type="submit" variant="softDanger" size="sm" disabled={state.busy}>
              {t('reviewCancellation')}
            </Button>
          </form>
        </div>
      </details>
    );
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-[var(--sc-border-default)] p-4"
      aria-label={t('actions')}
    >
      <h4 className="text-sm font-semibold text-[var(--sc-text-primary)]">{t('actions')}</h4>
      {!cancellable && !cancelled && <p className="text-sm">{t('unavailableAfterHandover')}</p>}
      {state.errorKey && !(cancelled && state.errorKey === 'statusError') && (
        <Alert variant="error" role="alert">
          {t(state.errorKey)}
        </Alert>
      )}
      {state.busy && <Alert role="status">{t('checkingOrSending')}</Alert>}
      {!state.checked && !state.busy && !state.pending && !processing && !cancelled && (
        <Alert>
          <p>{t('checkBeforeNew')}</p>
          <Button variant="outline" onClick={() => void session.check()}>
            {t('checkCancellation')}
          </Button>
        </Alert>
      )}
      {state.pending && !cancelled && !processing && (
        <Alert variant="warning">
          <p>{t('pendingRecovery')}</p>
          <p className="mt-2 break-words">{t('reviewReason', { reason: state.pending.reason })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={state.busy} onClick={() => void session.check()}>
              {t('checkCancellation')}
            </Button>
            <Button variant="ghost" disabled={state.busy} onClick={() => void session.retry()}>
              {t('retryCancellation')}
            </Button>
          </div>
        </Alert>
      )}
      {canStart && !state.review && (
        <form
          className="space-y-3"
          onSubmit={reason.handleSubmit(
            (values) => {
              session.review(values.reason, order.version);
            },
            () => notifyInvalidForm(),
          )}
        >
          <Input
            label={t('cancelReason')}
            required
            {...reason.register('reason')}
            disabled={state.busy}
            error={reason.formState.errors.reason ? t('invalidInput') : undefined}
          />
          <Button type="submit" variant="softDanger" size="sm" disabled={state.busy}>
            {t('reviewCancellation')}
          </Button>
        </form>
      )}
      {state.review && (
        <section
          className="space-y-3 rounded-xl border border-[var(--sc-warning-border)] p-4"
          aria-label={t('reviewTitle')}
        >
          <h5 className="text-sm font-semibold text-[var(--sc-warning-dark)]">
            {t('reviewTitle')}
          </h5>
          <p className="break-all">{t('reviewOrder', { code: orderCode ?? t('thisOrder') })}</p>
          <p>{t('reviewConsequences')}</p>
          <p className="break-words">{t('reviewReason', { reason: state.review.reason })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={state.busy}
              onClick={() => session.dismiss()}
            >
              {t('keepOrder')}
            </Button>
            <Button
              type="button"
              variant="danger"
              className="h-auto min-h-[42px] max-w-full whitespace-normal py-2"
              disabled={state.busy}
              onClick={() => void session.confirm()}
            >
              {t('confirmWholeOrder')}
            </Button>
          </div>
        </section>
      )}
      {(processing || cancelled) && (
        <Alert variant={cancelled ? 'success' : 'warning'} role="status">
          <p>
            {cancelled
              ? t('cancelled')
              : state.cancellation?.status === 'EXCEPTION'
                ? t('cancelException')
                : t('cancelPending')}
          </p>
          {!cancelled && (
            <>
              <p className="mt-2">
                {t(can('orders.cancellation.ops') ? 'opsPendingNext' : 'ownerPendingNext')}
              </p>
              <Button
                className="mt-3"
                variant="outline"
                disabled={state.busy}
                onClick={() => void session.check()}
              >
                {t('checkCancellation')}
              </Button>
            </>
          )}
        </Alert>
      )}
    </section>
  );
}
