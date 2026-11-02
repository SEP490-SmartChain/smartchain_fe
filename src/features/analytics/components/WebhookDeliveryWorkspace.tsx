import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, Input, PageHeader, Select } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import {
  webhookFilters,
  webhookReportApi,
  webhookStatus,
  type WebhookFilters,
} from '../api/webhookReportApi';

export function WebhookDeliveryWorkspace() {
  const revision = useAuthStore((s) => s.revision);
  const { can } = useAccess();
  return can('webhooks.deliveries.view') ? <ScopedWebhookDeliveries key={revision} /> : null;
}
function ScopedWebhookDeliveries() {
  const t = useTranslations('WebhookReports');
  const locale = useLocale();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const [filters, setFilters] = useState<WebhookFilters>({ from: today, to: today, status: '' });
  const [cursor, setCursor] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    data: Awaited<ReturnType<typeof webhookReportApi.read>> | null;
    loading: boolean;
    error: boolean;
  }>({ data: null, loading: true, error: false });
  const form = useForm<WebhookFilters>({
    resolver: zodResolver(webhookFilters),
    defaultValues: filters,
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: false });
    void webhookReportApi
      .read(filters, cursor, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ data: null, loading: false, error: true });
      });
    return () => controller.abort();
  }, [filters, cursor, refresh]);
  const number = new Intl.NumberFormat(locale);
  return (
    <section className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="outline"
            disabled={state.loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            {t('refresh')}
          </Button>
        }
      />
      <Card>
        <form
          className="grid items-end gap-3 p-4 sm:grid-cols-4"
          onSubmit={form.handleSubmit((values) => {
            setCursor(undefined);
            setFilters(values);
          })}
        >
          <Input type="date" label={t('from')} {...form.register('from')} />
          <Input type="date" label={t('to')} {...form.register('to')} />
          <Select
            label={t('status')}
            placeholder={t('all')}
            isPlaceholderDisabled={false}
            {...form.register('status')}
            options={[...webhookStatus.options.map((s) => ({ value: s, label: t(s) }))]}
          />
          <Button type="submit" disabled={state.loading}>
            {t('apply')}
          </Button>
          {Object.keys(form.formState.errors).length > 0 && (
            <p role="alert" className="sm:col-span-4">
              {t('invalidRange')}
            </p>
          )}
        </form>
      </Card>
      {state.error && (
        <Alert variant="error">
          {t('loadError')}{' '}
          <Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>
            {t('refresh')}
          </Button>
        </Alert>
      )}
      {state.data && (
        <div className="grid gap-3 sm:grid-cols-4">
          {webhookStatus.options.map((status) => (
            <Card key={status} className="p-4">
              <p>{t(status)}</p>
              <strong className="text-2xl tabular-nums">
                {number.format(BigInt(state.data?.summary.counts[status] ?? '0'))}
              </strong>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <DataTable
          ariaLabel={t('title')}
          data={state.data?.items ?? []}
          isLoading={state.loading}
          getRowKey={(r) => r.id}
          emptyMessage={state.error ? t('loadError') : t('empty')}
          columns={[
            {
              key: 'id',
              label: t('delivery'),
              render: (r) => <span className="break-all">{r.id}</span>,
            },
            {
              key: 'status',
              label: t('status'),
              render: (r) => (
                <Badge
                  status={
                    r.status === 'DELIVERED' ? 'success' : r.status === 'PENDING' ? 'info' : 'error'
                  }
                  label={t(r.status)}
                />
              ),
            },
            { key: 'attempts', label: t('attempts') },
            { key: 'responseCode', label: t('http'), render: (r) => r.responseCode ?? '—' },
            {
              key: 'createdAt',
              label: t('created'),
              render: (r) => new Date(r.createdAt).toLocaleString(locale),
            },
            {
              key: 'nextAttemptAt',
              label: t('nextAttempt'),
              render: (r) =>
                r.nextAttemptAt ? new Date(r.nextAttemptAt).toLocaleString(locale) : '—',
            },
          ]}
        />
      </Card>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={state.loading || !cursor}
          onClick={() => setCursor(undefined)}
        >
          {t('first')}
        </Button>
        <Button
          variant="outline"
          disabled={state.loading || !state.data?.pagination.hasNext}
          onClick={() => setCursor(state.data?.pagination.nextCursor ?? undefined)}
        >
          {t('next')}
        </Button>
      </div>
    </section>
  );
}
