import { useCallback, useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Badge, Button, Card, CardContent, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { AsnForm } from './AsnForm';
import { AsnLabels } from './AsnLabels';
import { asnApi } from '../api/asnApi';
import { cancelAsnSchema } from '../schemas/asnSchema';

import type { Asn, AsnStatus } from '../types/asn.types';

const statuses: AsnStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'ARRIVED',
  'RECEIVING',
  'DISCREPANCY',
  'READY_FOR_PUTAWAY',
  'COMPLETED',
  'CANCELLED',
];
function tone(status: AsnStatus): 'success' | 'warning' | 'error' | 'info' | 'default' {
  return status === 'COMPLETED' || status === 'READY_FOR_PUTAWAY'
    ? 'success'
    : status === 'CANCELLED'
      ? 'error'
      : status === 'DISCREPANCY'
        ? 'warning'
        : status === 'DRAFT'
          ? 'default'
          : 'info';
}
export function AsnWorkspace() {
  const t = useTranslations('Asns');
  const locale = useLocale();
  const { can } = useAccess();
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<Asn[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AsnStatus | ''>('');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<{ draft: Asn | null } | null>(null);
  const [selected, setSelected] = useState<Asn | null>(null);
  const [command, setCommand] = useState<{ asn: Asn; action: 'submit' | 'cancel' } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const generation = useRef(0);
  const canWrite = can('asns.view'); // UC-31–34: the seller page is available to Owner and Staff.
  useEffect(() => {
    const controller = new AbortController();
    const request = ++generation.current;
    setItems([]);
    setCursor(null);
    setFailed(false);
    setLoading(true);
    const timer = window.setTimeout(() => {
      void asnApi
        .list(search, status || undefined, undefined, controller.signal)
        .then((page) => {
          if (request !== generation.current || user !== useAuthStore.getState().user) return;
          setItems(page.items);
          setCursor(page.pagination.hasNext ? page.pagination.nextCursor : null);
        })
        .catch(() => {
          if (!controller.signal.aborted && request === generation.current) setFailed(true);
        })
        .finally(() => {
          if (request === generation.current) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      generation.current = request + 1;
    };
  }, [search, status, refresh, user]);
  async function more() {
    if (!cursor || loading) return;
    const request = generation.current;
    setLoading(true);
    try {
      const page = await asnApi.list(search, status || undefined, cursor);
      if (request !== generation.current || user !== useAuthStore.getState().user) return;
      setItems((previous) => [...previous, ...page.items]);
      setCursor(page.pagination.hasNext ? page.pagination.nextCursor : null);
    } catch (error) {
      if (request === generation.current) {
        toast.error(error instanceof ApiError ? error.message : t('loadError'));
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  async function open(asn: Asn) {
    const request = generation.current;
    setDetailLoading(true);
    try {
      const detail = await asnApi.get(asn.id);
      if (request === generation.current && user === useAuthStore.getState().user) {
        setSelected(detail);
      }
    } catch (error) {
      if (request === generation.current) {
        toast.error(error instanceof ApiError ? error.message : t('loadError'));
      }
    } finally {
      if (request === generation.current) setDetailLoading(false);
    }
  }
  const changed = useCallback(() => {
    setSelected(null);
    setRefresh((value) => value + 1);
  }, []);
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--sc-bg-primary)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--sc-border-default)] px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-[var(--sc-text-primary)]">{t('title')}</h1>
          <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        {canWrite && <Button onClick={() => setForm({ draft: null })}>{t('create')}</Button>}
      </header>
      <div className="space-y-5 overflow-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label={t('statusFilter')}
            placeholder={t('allStatuses')}
            isPlaceholderDisabled={false}
            value={status}
            options={statuses.map((value) => ({ value, label: t(`status.${value}`) }))}
            onChange={(event) => setStatus(event.target.value as AsnStatus | '')}
          />
        </div>
        {failed && (
          <Alert variant="error" title={t('loadError')}>
            <Button onClick={changed}>{t('retry')}</Button>
          </Alert>
        )}
        {!loading && !failed && !items.length && (
          <Card>
            <CardContent className="py-12 text-center">{t('empty')}</CardContent>
          </Card>
        )}
        <div className="overflow-auto rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)]">
          <table aria-label={t('title')} className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-[var(--sc-border-default)] text-[var(--sc-text-secondary)]">
              <tr>
                {['code', 'reference', 'quantity', 'statusLabel', 'updated', 'actions'].map(
                  (key) => (
                    <th key={key} className="px-4 py-3">
                      {t(key)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((asn) => (
                <tr key={asn.id} className="border-b border-[var(--sc-border-default)]">
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={detailLoading}
                      onClick={() => void open(asn)}
                    >
                      {asn.asnCode}
                    </Button>
                  </td>
                  <td className="px-4 py-3">{asn.externalReference || '—'}</td>
                  <td className="px-4 py-3">
                    {asn.lines
                      .reduce((sum, line) => sum + line.declaredQty, 0)
                      .toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={tone(asn.status)} label={t(`status.${asn.status}`)} />
                  </td>
                  <td className="px-4 py-3">{new Date(asn.updatedAt).toLocaleString(locale)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canWrite && asn.status === 'DRAFT' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setForm({ draft: asn })}
                          >
                            {t('editDraft')}
                          </Button>
                          <Button size="sm" onClick={() => setCommand({ asn, action: 'submit' })}>
                            {t('submit')}
                          </Button>
                        </>
                      )}
                      {canWrite &&
                        !asn.arrivedAt &&
                        (asn.status === 'DRAFT' || asn.status === 'SUBMITTED') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCommand({ asn, action: 'cancel' })}
                          >
                            {t('cancel')}
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p role="status">{t('loading')}</p>}
        {cursor && (
          <Button variant="outline" disabled={loading} onClick={() => void more()}>
            {t('loadMore')}
          </Button>
        )}
      </div>
      {form && <AsnForm draft={form.draft} onClose={() => setForm(null)} onSaved={changed} />}
      {command && (
        <AsnCommand
          key={`${command.asn.id}-${command.action}`}
          {...command}
          onClose={() => setCommand(null)}
          onChanged={changed}
        />
      )}
      {selected && (
        <Modal isOpen onClose={() => setSelected(null)} title={selected.asnCode} width="1000px">
          <div className="space-y-4">
            <Badge status={tone(selected.status)} label={t(`status.${selected.status}`)} />
            <p className="text-sm text-[var(--sc-text-secondary)]">{t('declaredHint')}</p>
            <p>
              {t('arrival')}:{' '}
              {selected.expectedArrivalAt
                ? new Date(selected.expectedArrivalAt).toLocaleString(locale)
                : '—'}
            </p>
            {selected.cancellationReason && (
              <p>
                {t('cancelReason')}: {selected.cancellationReason}
              </p>
            )}
            <div className="overflow-auto">
              <table aria-label={t('lines')} className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      'sku',
                      'quantity',
                      'lot',
                      'expiry',
                      'received',
                      'accepted',
                      'quarantined',
                      'rejected',
                    ].map((key) => (
                      <th key={key} className="p-2">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line) => (
                    <tr key={line.id} className="border-t border-[var(--sc-border-default)]">
                      <td className="p-2">{line.sku}</td>
                      <td className="p-2">{line.declaredQty}</td>
                      <td className="p-2">{line.declaredLotCode || '—'}</td>
                      <td className="p-2">{line.declaredExpiryOn?.slice(0, 10) || '—'}</td>
                      {(
                        ['receivedQty', 'acceptedQty', 'quarantinedQty', 'rejectedQty'] as const
                      ).map((field) => (
                        <td className="p-2" key={field}>
                          {line[field]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="font-medium">{t('labels')}</h3>
            {selected.cartonLabelRefs.length > 0 && selected.status !== 'CANCELLED' && (
              <AsnLabels asn={selected} />
            )}
            {selected.cartonLabelRefs.length ? (
              <ul className="space-y-2">
                {selected.cartonLabelRefs.map((label) => (
                  <li
                    className="break-all rounded-lg border border-[var(--sc-border-default)] p-3 font-mono text-sm"
                    key={label}
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('labelsPending')}</p>
            )}
            <h3 className="font-medium">{t('receipts')}</h3>
            <p className="break-all text-sm">{selected.receiptIds.join(', ') || t('noReceipts')}</p>
            <h3 className="font-medium">{t('discrepancies')}</h3>
            <p className="break-all text-sm">
              {selected.discrepancyIds.join(', ') || t('noDiscrepancies')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function AsnCommand({
  asn,
  action,
  onClose,
  onChanged,
}: {
  readonly asn: Asn;
  readonly action: 'submit' | 'cancel';
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const t = useTranslations('Asns');
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ reason: string }>({
    resolver: zodResolver(cancelAsnSchema),
    defaultValues: { reason: '' },
  });
  async function run(reason = '') {
    if (busy) return;
    const principal = useAuthStore.getState().user;
    setBusy(true);
    try {
      if (action === 'submit') await asnApi.submit(asn.id, asn.version);
      else await asnApi.cancel(asn.id, asn.version, reason);
      if (principal !== useAuthStore.getState().user) return;
      toast.success(t(action === 'submit' ? 'submitted' : 'cancelled'));
      onChanged();
      onClose();
    } catch (error) {
      if (principal === useAuthStore.getState().user) {
        toast.error(error instanceof ApiError ? error.message : t('saveError'));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t(action)}
      width="540px"
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (action === 'submit') void run();
          else void handleSubmit((values) => run(values.reason))(event);
        }}
      >
        <p className="break-all font-medium">{asn.asnCode}</p>
        <p className="text-sm">{t(action === 'submit' ? 'submitConfirm' : 'cancelConfirm')}</p>
        {action === 'cancel' && (
          <Input
            label={t('cancelReason')}
            {...register('reason')}
            error={errors.reason ? t('invalidReason') : undefined}
          />
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t('close')}
          </Button>
          <Button type="submit" isLoading={busy}>
            {t(action)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
