import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Warehouse } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, CardContent, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ReceiptCountForm } from './ReceiptCountForm';
import styles from './ReceiptWorkspace.module.css';
import { receivingApi, type AsnArrival } from '../api/receivingApi';
import { asnCodeFromScan, asnScanSchema } from '../schemas/asnScanSchema';

import type { WarehouseAsn } from '../api/warehouseAsnSchema';
import type { AsnStatus } from '../types/asn.types';
import type { InboundWarehouseScope } from '../types/inboundWarehouse.types';

const statuses: AsnStatus[] = [
  'SUBMITTED',
  'ARRIVED',
  'RECEIVING',
  'DISCREPANCY',
  'READY_FOR_PUTAWAY',
  'COMPLETED',
  'CANCELLED',
];
type Principal = ReturnType<typeof useAuthStore.getState>['user'];
interface Scoped<T> {
  owner: Principal;
  warehouse: string;
  data: T;
}

interface ReceivingWorkspaceProps extends InboundWarehouseScope {
  initialStatus?: AsnStatus | '';
}

export function ReceivingWorkspace({
  warehouse,
  onNavigationLockChange,
  initialStatus = '',
}: ReceivingWorkspaceProps) {
  const t = useTranslations('Receiving');
  const asnT = useTranslations('Asns');
  const locale = useLocale();
  const user = useAuthStore((state) => state.user);
  const { can } = useAccess();
  const activeWarehouse = warehouse.id;
  const [status, setStatus] = useState<AsnStatus | ''>(initialStatus);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<Scoped<{ items: WarehouseAsn[]; cursor: string | null }> | null>(
    null,
  );
  const [selected, setSelected] = useState<Scoped<WarehouseAsn> | null>(null);
  const [countSelection, setCountSelection] = useState<Scoped<WarehouseAsn> | null>(null);
  const [arrival, setArrival] = useState<Scoped<AsnArrival> | null>(null);
  const [error, setError] = useState<Scoped<string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workLocked, setWorkLocked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ code: string }>({
    resolver: zodResolver(asnScanSchema),
    defaultValues: { code: '' },
  });
  const isCurrent = <T,>(value: Scoped<T> | null) =>
    value?.owner === user && value.warehouse === activeWarehouse;
  const items = isCurrent(page) ? (page?.data.items ?? []) : [];
  const cursor = isCurrent(page) ? page?.data.cursor : null;
  const command = isCurrent(selected) ? selected?.data : null;
  const countedAsn = isCurrent(countSelection) ? countSelection?.data : null;

  useEffect(() => {
    const refreshOnFocus = () => {
      if (!busy && !workLocked && !command && !countedAsn) setRefresh((value) => value + 1);
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [busy, workLocked, command, countedAsn]);

  useEffect(() => {
    setSearch('');
    setStatus(initialStatus);
    reset();
  }, [user, activeWarehouse, reset, initialStatus]);

  useEffect(() => {
    onNavigationLockChange(busy || workLocked || Boolean(command));
    return () => onNavigationLockChange(false);
  }, [busy, workLocked, command, onNavigationLockChange]);

  useEffect(() => {
    const controller = new AbortController();
    const request = ++generation.current;
    setPage(null);
    setError(null);
    setSelected(null);
    if (!activeWarehouse) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void receivingApi
      .list(activeWarehouse, search, status || undefined, undefined, controller.signal)
      .then((result) => {
        if (request === generation.current && user === useAuthStore.getState().user) {
          setPage({
            owner: user,
            warehouse: activeWarehouse,
            data: {
              items: result.items,
              cursor: result.pagination.hasNext ? result.pagination.nextCursor : null,
            },
          });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && request === generation.current) {
          setError({
            owner: user,
            warehouse: activeWarehouse,
            data: reason instanceof ApiError ? reason.message : t('loadError'),
          });
        }
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current = request + 1;
    };
  }, [activeWarehouse, user, search, status, refresh, t]);

  async function more() {
    if (!cursor || loading) return;
    const request = generation.current;
    setLoading(true);
    try {
      const result = await receivingApi.list(activeWarehouse, search, status || undefined, cursor);
      if (request === generation.current && user === useAuthStore.getState().user) {
        setPage({
          owner: user,
          warehouse: activeWarehouse,
          data: {
            items: [...items, ...result.items],
            cursor: result.pagination.hasNext ? result.pagination.nextCursor : null,
          },
        });
      }
    } catch (reason) {
      if (request === generation.current) {
        setError({
          owner: user,
          warehouse: activeWarehouse,
          data: reason instanceof ApiError ? reason.message : t('loadError'),
        });
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  async function checkIn() {
    if (!command || busy) return;
    const request = generation.current;
    setBusy(true);
    setError(null);
    try {
      const result = await receivingApi.checkIn(activeWarehouse, command.id, command.version);
      if (request !== generation.current || user !== useAuthStore.getState().user) return;
      setArrival({ owner: user, warehouse: activeWarehouse, data: result });
      setCountSelection({
        owner: user,
        warehouse: activeWarehouse,
        data: {
          ...command,
          status: 'ARRIVED',
          version: result.version,
          arrivedAt: result.arrivedAt,
          receiptIds: [result.receiptId],
        },
      });
      setSelected(null);
      setRefresh((value) => value + 1);
    } catch (reason) {
      if (request === generation.current) {
        setError({
          owner: user,
          warehouse: activeWarehouse,
          data: reason instanceof ApiError ? reason.message : t('checkInError'),
        });
      }
    } finally {
      setBusy(false);
    }
  }
  if (countedAsn) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-[var(--sc-bg-primary)]">
        <header className="border-b border-[var(--sc-border-default)] px-4 py-5 sm:px-6">
          <div className={styles.page}>
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 -ml-3"
              disabled={workLocked}
              onClick={() => setCountSelection(null)}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('backToList')}
            </Button>
            <h2 className="text-xl font-semibold">{t('title')}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--sc-text-secondary)]">
              <p className="min-w-0 break-all font-medium">{countedAsn.asnCode}</p>
              <p className="flex items-center gap-2">
                <Warehouse size={16} aria-hidden="true" />
                {warehouse.name}
              </p>
            </div>
          </div>
        </header>
        <div className="overflow-auto p-4 sm:p-6">
          <div className={styles.page}>
            <ReceiptCountForm
              onNavigationLockChange={setWorkLocked}
              key={`${activeWarehouse}:${countedAsn.id}`}
              warehouseId={activeWarehouse}
              asnId={countedAsn.id}
              canWrite={can('warehouse.asn.recordCount')}
              onReceiptChanged={() => setRefresh((v) => v + 1)}
              onSaved={() => setRefresh((v) => v + 1)}
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="space-y-5">
        {activeWarehouse && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <form
                className="grid grid-cols-2 gap-2 md:flex md:items-start"
                onSubmit={handleSubmit(({ code }) => setSearch(asnCodeFromScan(code)))}
              >
                <div className="col-span-2 min-w-0 md:flex-1">
                  <Input
                    aria-label={t('scan')}
                    placeholder={t('scanPlaceholder')}
                    {...register('code')}
                    error={errors.code ? t('scanInvalid') : undefined}
                    disabled={busy}
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" disabled={busy}>
                  {t('find')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setSearch('');
                    reset();
                  }}
                >
                  {t('clear')}
                </Button>
              </form>
              <Select
                aria-label={asnT('statusFilter')}
                value={status}
                placeholder={asnT('allStatuses')}
                isPlaceholderDisabled={false}
                options={statuses.map((value) => ({ value, label: asnT(`status.${value}`) }))}
                disabled={busy}
                onChange={(event) => setStatus(event.target.value as AsnStatus | '')}
              />
            </div>
            {isCurrent(arrival) && arrival && (
              <Alert variant="success" title={t('checkedIn')}>
                <p>
                  {arrival.data.asnCode} · {new Date(arrival.data.arrivedAt).toLocaleString(locale)}
                </p>
                <p>
                  {t('receipt')}: {arrival.data.receiptId}
                </p>
              </Alert>
            )}
            {isCurrent(error) && error && (
              <Alert variant="error" title={error.data}>
                <Button
                  variant="outline"
                  onClick={() => setRefresh((value) => value + 1)}
                  disabled={busy}
                >
                  {t('reload')}
                </Button>
              </Alert>
            )}
            {loading && <p role="status">{t('loading')}</p>}
            {!loading && !isCurrent(error) && !items.length && (
              <Card>
                <CardContent className="py-8 text-center">{t('empty')}</CardContent>
              </Card>
            )}
            {!!items.length && (
              <div className="overflow-auto rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)]">
                <table aria-label={t('title')} className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-[var(--sc-border-default)]">
                    <tr>
                      {['code', 'received', 'status', 'arrival', 'actions'].map((key) => (
                        <th key={key} className="px-4 py-3">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((asn) => (
                      <tr key={asn.id} className="border-b border-[var(--sc-border-default)]">
                        <td className="px-4 py-3">
                          <details>
                            <summary className="cursor-pointer font-medium">{asn.asnCode}</summary>
                            <ul className="mt-2 space-y-1">
                              {asn.lines.map((line) => (
                                <li key={line.id}>
                                  {line.sku} · {line.productName}
                                </li>
                              ))}
                            </ul>
                          </details>
                          {asn.status === 'SUBMITTED' && (
                            <p className="mt-1 max-w-xs text-xs text-[var(--sc-text-secondary)]">
                              {t('waitingArrivalHelp')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {asn.lines
                            .reduce((sum, line) => sum + line.receivedQty, 0)
                            .toLocaleString(locale)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            status={
                              asn.status === 'CANCELLED'
                                ? 'error'
                                : asn.reinspectionRequired
                                  ? 'warning'
                                  : 'info'
                            }
                            label={
                              asn.reinspectionRequired
                                ? t('progressReinspection')
                                : asnT(`status.${asn.status}`)
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          {asn.arrivedAt ? new Date(asn.arrivedAt).toLocaleString(locale) : '—'}
                          {asn.status === 'SUBMITTED' && (
                            <p className="text-xs">
                              {asn.expectedArrivalAt
                                ? t('expectedArrival', {
                                    date: new Date(asn.expectedArrivalAt).toLocaleString(locale),
                                  })
                                : t('noExpectedArrival')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {can('warehouse.asn.checkIn') && asn.status === 'SUBMITTED' && (
                            <Button
                              size="sm"
                              disabled={busy || loading}
                              onClick={() =>
                                setSelected({ owner: user, warehouse: activeWarehouse, data: asn })
                              }
                            >
                              {t('checkIn')}
                            </Button>
                          )}
                          {asn.receiptIds.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || loading}
                              onClick={() =>
                                setCountSelection({
                                  owner: user,
                                  warehouse: activeWarehouse,
                                  data: asn,
                                })
                              }
                            >
                              {t(
                                can('warehouse.asn.recordCount')
                                  ? asn.reinspectionRequired
                                    ? 'reinspectionAction'
                                    : 'countOpen'
                                  : 'countView',
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {cursor && (
              <Button variant="outline" disabled={loading || busy} onClick={() => void more()}>
                {t('more')}
              </Button>
            )}
          </>
        )}
      </div>
      <Modal
        isOpen={Boolean(command)}
        title={t('confirmTitle')}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        <div className="space-y-4">
          <p>{t('confirmDescription', { code: command?.asnCode ?? '' })}</p>
          <p className="text-sm text-[var(--sc-text-secondary)]">{warehouse.name}</p>
          {isCurrent(error) && error && <Alert variant="error" title={error.data} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
              {t('cancel')}
            </Button>
            {isCurrent(error) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  setRefresh((value) => value + 1);
                }}
              >
                {t('reload')}
              </Button>
            )}
            <Button isLoading={busy} onClick={() => void checkIn()}>
              {t('checkIn')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
