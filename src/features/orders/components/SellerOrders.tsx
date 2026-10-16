import { useEffect, useRef, useState } from 'react';

import { Download, Plus, RefreshCw, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import {
  Alert,
  Badge,
  Button,
  Card,
  Dropzone,
  Input,
  PageHeader,
  Select,
  UnderConstruction,
} from '@/components/Common';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import { GoogleSheetConnection } from './GoogleSheetConnection';
import { ManualOrderForm } from './ManualOrderForm';
import { OrderDetail } from './OrderDetail';
import {
  ORDER_STATUSES,
  ordersApi,
  orderCollectionTotal,
  type ImportResult,
  type OrderFilters,
  type SellerOrder,
  type SellerOrderDetail,
} from '../api/ordersApi';
import { useOrders } from '../hooks/useOrders';
import { importRowFeedback, orderErrorKey, orderReasonKey } from '../lib/orderFeedback';
import { formatOrderDate, formatOrderMoney } from '../lib/orderPresentation';
import { orderScope, sellerOrderAccess } from '../lib/orderScope';

export function SellerOrders() {
  const scope = useAuthStore(orderScope);
  const access = sellerOrderAccess();
  if (!access.read) return <UnderConstruction />;
  return <SellerOrdersSession key={scope} scope={scope} owner={access.create} />;
}

function SellerOrdersSession({ scope, owner }: { scope: string; owner: boolean }) {
  const canIntake = useAuthStore((state) => state.user?.serviceStatus === 'ACTIVE');
  const t = useTranslations('Orders');
  const locale = useLocale();
  const [draftFilters, setDraftFilters] = useState<OrderFilters>({
    status: '',
    channel: '',
    from: '',
    to: '',
  });
  const [filters, setFilters] = useState(draftFilters);
  const orders = useOrders(scope, filters, owner);
  const [modal, setModal] = useState<'manual' | 'import' | 'detail' | 'sheet' | null>(null);
  const [detail, setDetail] = useState<SellerOrderDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [accepted, setAccepted] = useState<{ id: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    const pending = controllers.current;
    const abort = () => pending.forEach((controller) => controller.abort());
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope) abort();
    });
    return () => {
      unsubscribe();
      abort();
    };
  }, [scope]);

  async function execute(action: (signal: AbortSignal) => Promise<void>, write = false) {
    if (
      running.current ||
      orderScope() !== scope ||
      !(write ? sellerOrderAccess().create && sellerOrderAccess().intake : sellerOrderAccess().read)
    ) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      await action(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted && orderScope() === scope) setError(t(orderErrorKey(failure)));
    } finally {
      controllers.current.delete(controller);
      running.current = false;
      if (orderScope() === scope) setBusy(false);
    }
  }
  function openDetail(id: string) {
    setDetail(null);
    setDetailId(id);
    setModal('detail');
    void execute(async (signal) => {
      const response = await ordersApi.detail(id, owner, signal);
      if (orderScope() === scope && !signal.aborted) setDetail(response);
    });
  }
  function importOrders(preview = false) {
    if (!files[0] || !files[0].name.toLowerCase().endsWith('.xlsx')) {
      setError(t('invalid_file'));
      return;
    }
    void execute(async (signal) => {
      const response = await ordersApi.import(files[0], signal, preview);
      if (orderScope() === scope && !signal.aborted) {
        setResult(response);
        if (!preview) await orders.reload();
      }
    }, true);
  }
  function downloadTemplate(sheet = false) {
    void execute(async (signal) => {
      const template = await ordersApi.template(signal, sheet);
      if (orderScope() !== scope || signal.aborted) return;
      const bytes = Uint8Array.from(atob(template.contentBase64), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = template.fileName;
      link.click();
      URL.revokeObjectURL(url);
    }, true);
  }
  const columns: ColumnDef<SellerOrder>[] = [
    {
      key: 'externalOrderCode',
      label: t('order_code'),
      render: (order) => (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => openDetail(order.id)}>
          {order.externalOrderCode}
        </Button>
      ),
    },
    {
      key: 'sourceChannel',
      label: t('fields.sourceChannel'),
      render: (order) =>
        order.sourceChannel === 'manual' ? t('manual_channel') : order.sourceChannel,
    },
    {
      key: 'status',
      label: t('status'),
      render: (order) => (
        <div>
          <Badge
            status={
              ['FAILED', 'CANCELLED'].includes(order.status)
                ? 'error'
                : ['ON_HOLD', 'BACKORDER', 'MANUAL_REVIEW'].includes(order.status)
                  ? 'warning'
                  : 'default'
            }
            label={t(`statuses.${order.status}`)}
          />
          {order.holdReason && (
            <p className="mt-1 text-xs">{t(orderReasonKey(order.holdReason))}</p>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: t('created_at'),
      render: (order) => formatOrderDate(order.createdAt, locale),
    },
    ...(owner
      ? [
          {
            key: 'codAmount',
            label: t('collectionShort'),
            render: (order: SellerOrder) =>
              order.codAmount === undefined
                ? '—'
                : formatOrderMoney(
                    orderCollectionTotal({
                      codAmount: order.codAmount,
                      customerShippingFee: order.customerShippingFee ?? '0',
                      shippingFeePayer: order.shippingFeePayer ?? 'SENDER',
                    }),
                  ),
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isLoading={orders.loading}
              onClick={() => void orders.reload()}
            >
              <RefreshCw size={16} />
              {t('refresh')}
            </Button>
            {owner && (
              <>
                <Button
                  variant="secondary"
                  disabled={!canIntake}
                  onClick={() => {
                    setError(null);
                    setModal('sheet');
                  }}
                >
                  {t('sheetConnect')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setModal('import');
                  }}
                >
                  <Upload size={16} />
                  {t('import')}
                </Button>
                <Button
                  disabled={!canIntake}
                  onClick={() => {
                    setError(null);
                    setModal('manual');
                  }}
                >
                  <Plus size={16} />
                  {t('create')}
                </Button>
              </>
            )}
          </div>
        }
      />
      {accepted && (
        <Alert variant="success" onClose={() => setAccepted(null)}>
          {t('accepted_hint')}
          <p>{accepted.code}</p>
          <Button variant="ghost" onClick={() => openDetail(accepted.id)}>
            {t('view_order')}
          </Button>
        </Alert>
      )}
      {orders.error !== null && (
        <Alert variant="error">
          {t('response_error')}
          <Button variant="ghost" onClick={() => void orders.reload()}>
            {t('retry')}
          </Button>
        </Alert>
      )}
      <Card padding="none" className="@container overflow-hidden">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ ...draftFilters });
          }}
          className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5 @[68rem]:grid-cols-[repeat(5,minmax(0,1fr))_max-content] @[68rem]:gap-3"
        >
          <Input
            label={t('order_code')}
            placeholder={t('search_code')}
            maxLength={100}
            value={draftFilters.q ?? ''}
            onChange={(event) => setDraftFilters({ ...draftFilters, q: event.target.value })}
          />
          <Select
            label={t('status')}
            value={draftFilters.status}
            isPlaceholderDisabled={false}
            placeholder={t('all_statuses')}
            options={ORDER_STATUSES.map((status) => ({
              value: status,
              label: t(`statuses.${status}`),
            }))}
            onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value })}
          />
          <Input
            label={t('fields.sourceChannel')}
            value={draftFilters.channel}
            maxLength={100}
            onChange={(event) => setDraftFilters({ ...draftFilters, channel: event.target.value })}
          />
          <Input
            label={t('from')}
            type="date"
            value={draftFilters.from}
            max={draftFilters.to || undefined}
            onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })}
          />
          <Input
            label={t('to')}
            type="date"
            value={draftFilters.to}
            min={draftFilters.from || undefined}
            onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
          />
          <div className="col-span-full flex flex-wrap items-end gap-2 @[68rem]:col-span-1 @[68rem]:flex-nowrap">
            <Button type="submit" className="self-end" disabled={orders.loading}>
              {t('filter')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const empty = { status: '', channel: '', from: '', to: '' };
                setDraftFilters(empty);
                setFilters(empty);
              }}
            >
              {t('reset_filters')}
            </Button>
          </div>
        </form>
        <DataTable
          ariaLabel={t('title')}
          columns={columns}
          data={orders.items}
          getRowKey={(order) => order.id}
          isLoading={orders.loading && !orders.items.length}
          emptyMessage={t('empty')}
        />
        {orders.hasNext && (
          <div className="flex justify-center p-4">
            <Button
              variant="secondary"
              isLoading={orders.loading}
              onClick={() => void orders.loadMore()}
            >
              {t('more')}
            </Button>
          </div>
        )}
      </Card>
      {owner && (
        <Modal
          isOpen={modal === 'sheet'}
          title={t('sheetConnect')}
          width="640px"
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          {modal === 'sheet' && (
            <GoogleSheetConnection scope={scope} onTemplate={() => downloadTemplate(true)} />
          )}
          {busy && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error">{error}</Alert>}
        </Modal>
      )}
      {/* Keep the form mounted across dialog closes; scope changes remount this session. */}
      {owner && (
        <ManualOrderForm
          scope={scope}
          isOpen={modal === 'manual'}
          onClose={() => {
            if (!busy) setModal(null);
          }}
          onBusyChange={setBusy}
          onAccepted={(id, code) => {
            setAccepted({ id, code });
            setModal(null);
            void orders.reload();
          }}
        />
      )}
      <Modal
        isOpen={modal === 'import'}
        title={t('import')}
        width="800px"
        onClose={() => {
          if (!busy) setModal(null);
        }}
      >
        <div className="space-y-4">
          <Alert>{t('import_hint')}</Alert>
          <div className="space-y-2 text-sm">
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t('import_step_1')}</li>
              <li>{t('import_step_2')}</li>
              <li>{t('import_step_3')}</li>
            </ol>
            <a
              href="/catalog/skus"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--sc-primary)] underline"
            >
              {t('view_skus')}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" isLoading={busy} onClick={() => downloadTemplate()}>
              <Download size={16} />
              {t('template')}
            </Button>
          </div>
          <Dropzone
            files={files}
            onFilesChange={(next) => {
              setFiles(next);
              setResult(null);
              setError(null);
            }}
            accept=".xlsx"
            multiple={false}
            maxSizeMb={1}
            disabled={busy}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isLoading={busy}
              disabled={!files.length}
              onClick={() => importOrders(true)}
            >
              {t('preview_import')}
            </Button>
            {result?.ready !== undefined && result.ready > 0 && (
              <Button isLoading={busy} onClick={() => importOrders()}>
                {t('confirm_import', { count: result.ready })}
              </Button>
            )}
          </div>
          {result && (
            <>
              <Alert variant={result.rejected ? 'warning' : 'success'}>
                {result.ready === undefined
                  ? t('import_summary', {
                      accepted: result.items.filter(
                        (row) => row.status === 'ACCEPTED' && !row.existing,
                      ).length,
                      rejected: result.rejected,
                    })
                  : t('preview_summary', { ready: result.ready, rejected: result.rejected })}
                {result.items.some((row) => row.existing) && (
                  <>
                    {' '}
                    ·{' '}
                    {t('existing_summary', {
                      count: result.items.filter((row) => row.existing).length,
                    })}
                  </>
                )}
              </Alert>
              {result.ready !== undefined && <p className="text-sm">{t('preview_hint')}</p>}
              <DataTable
                ariaLabel={t('import_results')}
                data={result.items}
                getRowKey={(row) => row.row}
                columns={[
                  {
                    key: 'row',
                    label: t('row'),
                    render: (row) => row.excelRows?.join(', ') ?? row.row,
                  },
                  {
                    key: 'externalOrderCode',
                    label: t('order_code'),
                    render: (row) => row.externalOrderCode ?? t('automatic_code'),
                  },
                  {
                    key: 'status',
                    label: t('status'),
                    render: (row) =>
                      row.existing
                        ? t('existing_order')
                        : row.status === 'ACCEPTED'
                          ? t('accepted')
                          : row.status === 'READY'
                            ? t('ready')
                            : t('rejected'),
                  },
                  {
                    key: 'reference',
                    label: t('reference'),
                    render: (row) =>
                      row.orderId ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (row.orderId) openDetail(row.orderId);
                          }}
                        >
                          {t('view_order')}
                        </Button>
                      ) : row.status === 'READY' ? (
                        t('ready_hint')
                      ) : (
                        importRowFeedback(row, (key, values) =>
                          t.has(key) ? t(key, values) : t('items'),
                        )
                      ),
                  },
                ]}
              />
            </>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={modal === 'detail'}
        title={t('detail')}
        width="850px"
        onClose={() => {
          if (!busy) setModal(null);
        }}
      >
        {busy && <p role="status">{t('loading')}</p>}
        {error && (
          <Alert variant="error">
            {error}
            <Button
              variant="ghost"
              onClick={() => {
                if (detailId) openDetail(detailId);
              }}
            >
              {t('retry')}
            </Button>
          </Alert>
        )}
        {detail && <OrderDetail order={detail} />}
      </Modal>
    </div>
  );
}
