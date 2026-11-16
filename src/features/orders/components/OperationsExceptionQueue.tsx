import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFormatter, useTranslations } from 'next-intl';

import { Alert, Button, Card, Input, PageHeader, Select } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ExceptionAddressCorrection } from './ExceptionAddressCorrection';
import {
  exceptionCommandFormSchema,
  exceptionFiltersSchema,
  operationsExceptionApi,
  type ExceptionDetail,
  type ExceptionFilters,
  type ExceptionPage,
} from '../api/operationsExceptionApi';
import {
  beginExceptionCommand,
  completeExceptionCommand,
  pendingExceptionCommand,
} from '../lib/exceptionPending';
import { isRejectedOperation } from '../lib/fulfillmentRetry';
import { orderScope } from '../lib/orderScope';

import type { z } from 'zod';

export function OperationsExceptionQueue() {
  const { can } = useAccess();
  const scope = useAuthStore(orderScope);
  return can('exceptions.view') ? (
    <ExceptionSession key={scope} mutable={can('exceptions.manage')} />
  ) : null;
}
function ExceptionSession({ mutable }: { mutable: boolean }) {
  const t = useTranslations('OperationsExceptions');
  const format = useFormatter();
  const [query, setQuery] = useState<{ filters: ExceptionFilters; afterId?: string }>({
    filters: { status: 'OPEN', type: '', warehouseId: '' },
  });
  const [page, setPage] = useState<ExceptionPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0);
  const form = useForm<ExceptionFilters>({
    resolver: zodResolver(exceptionFiltersSchema),
    defaultValues: query.filters,
  });
  useEffect(() => {
    const controller = new AbortController();
    const requestScope = orderScope();
    setLoading(true);
    setError(false);
    setPage(null);
    setSelected(null);
    void operationsExceptionApi
      .list(query.filters, query.afterId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && orderScope() === requestScope) setPage(data);
      })
      .catch(() => {
        if (!controller.signal.aborted && orderScope() === requestScope) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && orderScope() === requestScope) setLoading(false);
      });
    return () => controller.abort();
  }, [query, reload]);
  const collectionStale = page?.collection.checkedAt
    ? Date.now() - Date.parse(page.collection.checkedAt) > 90000
    : true;
  const collectionState = collectionStale ? 'NOT_READY' : (page?.collection.status ?? 'NOT_READY');
  const date = (value: string) =>
    format.dateTime(new Date(value), {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />
      {!mutable && <Alert variant="info">{t('readOnly')}</Alert>}
      {page && collectionState !== 'AVAILABLE' && (
        <Alert variant="warning" role="status">
          {t(`collection.${collectionState}`)}
        </Alert>
      )}
      <Card className="space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={form.handleSubmit((filters) => setQuery({ filters }))}
        >
          <Select
            label={t('status')}
            placeholder={t('all')}
            isPlaceholderDisabled={false}
            options={['OPEN', 'ASSIGNED', 'RESOLVED'].map((value) => ({
              value,
              label: value ? t(`statuses.${value}`) : t('all'),
            }))}
            {...form.register('status')}
          />
          <Select
            label={t('type')}
            placeholder={t('all')}
            isPlaceholderDisabled={false}
            options={['ORDER', 'DISPATCH', 'PICK_WAVE', 'QUEUE', 'OTHER'].map((value) => ({
              value,
              label: value ? t(`types.${value}`) : t('all'),
            }))}
            {...form.register('type')}
          />
          <Select
            label={t('warehouse')}
            placeholder={t('allWarehouses')}
            isPlaceholderDisabled={false}
            options={[
              ...(page?.warehouses.map((row) => ({ value: row.id, label: row.name })) ?? []),
            ]}
            {...form.register('warehouseId')}
          />
          <Button type="submit" disabled={loading}>
            {t('filter')}
          </Button>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              setQuery((current) => ({ filters: current.filters }));
              setReload((value) => value + 1);
            }}
          >
            {t('refresh')}
          </Button>
        </form>
        {Object.keys(form.formState.errors).length > 0 && (
          <Alert variant="error">{t('invalidInput')}</Alert>
        )}
        {error ? (
          <Alert variant="error" role="alert">
            {t('loadError')}
          </Alert>
        ) : (
          <DataTable<ExceptionPage['items'][number]>
            ariaLabel={t('title')}
            data={page?.items ?? []}
            isLoading={loading}
            emptyMessage={t('empty')}
            getRowKey={(row) => row.id}
            columns={[
              { key: 'reference', label: t('reference') },
              {
                key: 'sellerName',
                label: t('seller'),
                render: (row) => row.sellerName ?? t('unattributed'),
              },
              {
                key: 'reasonCode',
                label: t('reason'),
                render: (row) => {
                  const key = `reasonCodes.${row.reasonCode.replaceAll('.', '_')}`;
                  return t.has(key) ? t(key) : t('reasonUnknown');
                },
              },
              { key: 'type', label: t('type'), render: (row) => t(`types.${row.type}`) },
              {
                key: 'warehouseId',
                label: t('warehouse'),
                render: (row) =>
                  page?.warehouses.find((item) => item.id === row.warehouseId)?.name ??
                  t('unattributed'),
              },
              { key: 'status', label: t('status'), render: (row) => t(`statuses.${row.status}`) },
              { key: 'updatedAt', label: t('updatedAt'), render: (row) => date(row.updatedAt) },
              {
                key: 'actions',
                label: t('actions'),
                render: (row) => (
                  <Button variant="outline" onClick={() => setSelected(row.id)}>
                    {t('investigate')}
                  </Button>
                ),
              },
            ]}
          />
        )}
        {page?.nextCursor && (
          <Button
            variant="outline"
            disabled={loading}
            onClick={() =>
              setQuery((current) => ({ ...current, afterId: page.nextCursor ?? undefined }))
            }
          >
            {t('next')}
          </Button>
        )}
      </Card>
      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={t('investigate')}
        width="760px"
      >
        {selected && (
          <ExceptionInvestigation
            key={selected}
            id={selected}
            mutable={mutable}
            onCompleted={() => setReload((value) => value + 1)}
          />
        )}
      </Modal>
    </div>
  );
}
function ExceptionInvestigation({
  id,
  mutable,
  onCompleted,
}: {
  id: string;
  mutable: boolean;
  onCompleted: () => void;
}) {
  const t = useTranslations('OperationsExceptions');
  const format = useFormatter();
  const [detail, setDetail] = useState<ExceptionDetail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  const alive = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const requestScope = orderScope();
    setDetail(null);
    void operationsExceptionApi
      .detail(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && orderScope() === requestScope) setDetail(data);
      })
      .catch(() => {
        if (!controller.signal.aborted && orderScope() === requestScope) setError('loadError');
      });
    return () => controller.abort();
  }, [id, reload]);
  const pending = pendingExceptionCommand(id);
  const form = useForm<z.infer<typeof exceptionCommandFormSchema>>({
    resolver: zodResolver(exceptionCommandFormSchema),
    defaultValues: {
      kind: pending?.kind ?? 'NOTE',
      note: pending?.note ?? '',
      assignedToPlatformUserId: pending?.assignedToPlatformUserId ?? '',
    },
  });
  const kind = form.watch('kind');
  async function submit(values: z.infer<typeof exceptionCommandFormSchema>) {
    if (!detail || busy || !mutable) return;
    const requestScope = orderScope();
    const command = beginExceptionCommand(id, {
      expectedVersion: detail.version,
      kind: values.kind,
      note: values.note,
      ...(values.kind === 'ASSIGN'
        ? { assignedToPlatformUserId: values.assignedToPlatformUserId || null }
        : {}),
    });
    setBusy(true);
    setError('');
    request.current = new AbortController();
    try {
      await operationsExceptionApi.command(id, command, request.current.signal);
      if (alive.current && orderScope() === requestScope) {
        completeExceptionCommand(id);
        onCompleted();
      }
    } catch (caught) {
      if (!alive.current || orderScope() !== requestScope) return;
      if (isRejectedOperation(caught)) {
        completeExceptionCommand(id);
        setError(
          caught instanceof ApiError && caught.code.endsWith('STALE_VERSION')
            ? 'stale'
            : 'rejected',
        );
        setReload((value) => value + 1);
      } else setError('uncertain');
    } finally {
      if (alive.current && orderScope() === requestScope) setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="error" role="alert">
          {t(error)}
        </Alert>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setError('');
          setReload((value) => value + 1);
        }}
      >
        {t('refresh')}
      </Button>
      {!detail ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt>{t('reference')}</dt>
              <dd className="break-words font-medium">{detail.reference}</dd>
            </div>
            <div>
              <dt>{t('seller')}</dt>
              <dd>{detail.sellerName ?? t('unattributed')}</dd>
            </div>
            <div>
              <dt>{t('reason')}</dt>
              <dd className="break-words font-medium">
                {t.has(`reasonCodes.${detail.reasonCode.replaceAll('.', '_')}`)
                  ? t(`reasonCodes.${detail.reasonCode.replaceAll('.', '_')}`)
                  : t('reasonUnknown')}
              </dd>
            </div>
            <div>
              <dt>{t('status')}</dt>
              <dd>{t(`statuses.${detail.status}`)}</dd>
            </div>
            <div>
              <dt>{t('assignee')}</dt>
              <dd>
                {detail.assignedToPlatformUserId
                  ? (detail.assignees.find((row) => row.id === detail.assignedToPlatformUserId)
                      ?.name ?? t('assigneeUnavailable'))
                  : t('unassigned')}
              </dd>
            </div>
            <div>
              <dt>{t('sourceStatus')}</dt>
              <dd>
                {detail.sourceStatus
                  ? t.has(`sourceStatuses.${detail.sourceStatus}`)
                    ? t(`sourceStatuses.${detail.sourceStatus}`)
                    : t('sourceStatusUnknown')
                  : t('sourceStatusUnknown')}
              </dd>
            </div>
          </dl>
          <Alert variant="info">{t('businessHint')}</Alert>
          {mutable &&
            !pending &&
            detail.canCorrect &&
            detail.status !== 'RESOLVED' &&
            ['FAILED', 'MANUAL_REVIEW'].includes(detail.sourceStatus ?? '') &&
            !correcting && (
              <Button variant="outline" onClick={() => setCorrecting(true)}>
                {t('correctAddress')}
              </Button>
            )}
          {mutable && (correcting || pending?.correction) && (
            <ExceptionAddressCorrection
              id={id}
              onCompleted={onCompleted}
              onCancel={() => setCorrecting(false)}
            />
          )}
          {mutable && !correcting && !pending?.correction && (
            <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
              <Select
                label={t('action')}
                disabled={busy || !!pending}
                options={['NOTE', 'ASSIGN', 'RETRY', 'RESOLVE'].map((value) => ({
                  value,
                  label: t(`kinds.${value}`),
                  disabled:
                    value === 'RETRY'
                      ? !detail.canRetry
                      : value === 'RESOLVE'
                        ? !detail.canResolve
                        : detail.status === 'RESOLVED' && value === 'ASSIGN',
                }))}
                {...form.register('kind')}
              />
              {kind === 'ASSIGN' && (
                <Select
                  label={t('assignee')}
                  placeholder={t('unassigned')}
                  isPlaceholderDisabled={false}
                  disabled={busy || !!pending}
                  options={[...detail.assignees.map((row) => ({ value: row.id, label: row.name }))]}
                  {...form.register('assignedToPlatformUserId')}
                />
              )}
              <Input
                label={t('note')}
                required
                maxLength={2000}
                readOnly={!!pending}
                disabled={busy}
                {...form.register('note')}
                error={form.formState.errors.note ? t('invalidNote') : undefined}
              />
              {pending && <Alert variant="warning">{t('pendingHint')}</Alert>}
              <Button
                type="submit"
                disabled={
                  busy ||
                  (!pending &&
                    ((kind === 'RETRY' && !detail.canRetry) ||
                      (kind === 'RESOLVE' && !detail.canResolve)))
                }
              >
                {busy ? t('saving') : pending ? t('checkPending') : t('submit')}
              </Button>
            </form>
          )}
          <section aria-label={t('history')} className="space-y-3">
            <h3 className="font-semibold">{t('history')}</h3>
            {detail.operations.length === 0 && <p>{t('noHistory')}</p>}
            {detail.operations.map((operation) => (
              <article
                key={operation.id}
                className="space-y-1 border-b border-[var(--sc-border-default)] py-3 text-sm"
              >
                <p className="font-medium">
                  {t(`kinds.${operation.kind}`)} ·{' '}
                  {format.dateTime(new Date(operation.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Asia/Ho_Chi_Minh',
                  })}
                </p>
                <p className="break-words whitespace-pre-wrap">{operation.note}</p>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
