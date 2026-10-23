import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Alert, Button, Card, Input, PageHeader } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';
import {
  operationsCancellationApi,
  type CancellationCandidate,
} from '../api/operationsCancellationApi';
import { OrderCancellationActions } from './OrderCancellationActions';
import { orderScope } from '../lib/orderScope';

const searchSchema = z.object({ search: z.string().trim().max(120) });
export function OperationsCancellationWorkspace() {
  const { can } = useAccess();
  const scope = useAuthStore(orderScope);
  return can('orders.cancellation.ops') ? <CancellationSession key={scope} /> : null;
}
function CancellationSession() {
  const t = useTranslations('OrderCancellation');
  const [query, setQuery] = useState({ search: '', cursor: undefined as string | undefined });
  const [page, setPage] = useState<{ items: CancellationCandidate[]; nextCursor: string | null }>({
    items: [],
    nextCursor: null,
  });
  const [selected, setSelected] = useState<CancellationCandidate | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  const form = useForm<z.infer<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: '' },
  });
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    setPage({ items: [], nextCursor: null });
    setSelected(null);
    void operationsCancellationApi
      .list(query.search, query.cursor, c.signal)
      .then((data) => {
        if (!c.signal.aborted) setPage(data);
      })
      .catch(() => {
        if (!c.signal.aborted) setError(t('opsLoadError'));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [query, reload, t]);
  return (
    <div className="space-y-5">
      <PageHeader title={t('opsTitle')} description={t('opsHint')} />
      <Card>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={form.handleSubmit((values) =>
            setQuery({ search: values.search, cursor: undefined }),
          )}
        >
          <Input
            label={t('orderCode')}
            {...form.register('search')}
            error={form.formState.errors.search ? t('invalidInput') : undefined}
          />
          <Button type="submit" disabled={loading}>
            {t('search')}
          </Button>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              setQuery((q) => ({ ...q, cursor: undefined }));
              setReload((n) => n + 1);
            }}
          >
            {t('reload')}
          </Button>
        </form>
      </Card>
      {error && <Alert variant="error">{error}</Alert>}
      <Card>
        <DataTable<CancellationCandidate>
          ariaLabel={t('opsTitle')}
          data={page.items}
          isLoading={loading}
          emptyMessage={t('opsEmpty')}
          getRowKey={(row) => row.id}
          columns={[
            { key: 'orderCode', label: t('orderCode') },
            { key: 'sellerName', label: t('seller') },
            {
              key: 'warehouses',
              label: t('warehouses'),
              render: (row) => row.warehouses.join(', '),
            },
            {
              key: 'action',
              label: t('actions'),
              render: (row) => (
                <Button variant="outline" onClick={() => setSelected(row)}>
                  {t('reviewOrder')}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      {page.nextCursor && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setQuery((q) => ({ ...q, cursor: page.nextCursor ?? undefined }))}
        >
          {t('nextPage')}
        </Button>
      )}
      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.orderCode ?? t('actions')}
      >
        {selected && (
          <div className="space-y-3">
            <p>
              {selected.sellerName} · {selected.warehouses.join(', ')}
            </p>
            <OrderCancellationActions
              key={`${selected.id}:${selected.version}`}
              order={selected}
              onChanged={() => setReload((n) => n + 1)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
