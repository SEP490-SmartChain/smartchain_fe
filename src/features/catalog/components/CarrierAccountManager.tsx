import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Badge, Button, Card, Select } from '@/components/Common';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import { useAuthStore } from '@/stores/authStore';

import { CarrierAccountModal } from './CarrierAccountModal';
import { carrierAccountApi, type CarrierAccount } from '../api/carrierAccountApi';
import { carrierCatalogApi } from '../api/carrierCatalogApi';

import type { CarrierSummary } from '../types/carrierCatalog.types';

export function CarrierAccountManager() {
  const user = useAuthStore((state) => state.user);
  if (!user || user.actorScope !== 'PLATFORM' || !user.roles.includes('ORCA_ADMIN')) return null;
  return <AccountManager key={user.userId} />;
}

function AccountManager() {
  const t = useTranslations('CarrierAccounts');
  const [warehouses, setWarehouses] = useState<{ id: string; code: string; name: string }[]>([]);
  const [carriers, setCarriers] = useState<CarrierSummary[]>([]);
  const [rows, setRows] = useState<CarrierAccount[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [optionsError, setOptionsError] = useState(false);
  const [editing, setEditing] = useState<CarrierAccount | null | undefined>();
  const [revoking, setRevoking] = useState<CarrierAccount | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setOptionsError(false);
    async function loadOptions() {
      const warehouses = await carrierAccountApi.warehouses(abort.signal);
      const carriers: CarrierSummary[] = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await carrierCatalogApi.list({ isActive: true, limit: 50, cursor });
        carriers.push(...page.items.filter((row) => ['GHN', 'GHTK'].includes(row.code)));
        cursor = page.pagination.hasNext ? (page.pagination.nextCursor ?? undefined) : undefined;
        if (cursor && seen.has(cursor)) throw new Error('Invalid carrier pagination');
        if (cursor) seen.add(cursor);
      } while (cursor && !cancelled);
      if (!cancelled) {
        setWarehouses(warehouses);
        setCarriers(carriers);
      }
    }
    void loadOptions().catch(() => {
      if (!cancelled) setOptionsError(true);
    });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [revision]);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(false);
    void carrierAccountApi
      .list({ warehouseId, carrierId, cursor }, abort.signal)
      .then((page) => {
        if (!cancelled) {
          setRows(page.items);
          setNextCursor(page.nextCursor);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setRows([]);
          setNextCursor(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [warehouseId, carrierId, cursor, revision]);

  const refresh = () => {
    setCursor(undefined);
    setRevision((value) => value + 1);
  };
  const test = async (row: CarrierAccount) => {
    setBusy(row.id);
    try {
      const result = await carrierAccountApi.test(row.id);
      if (result.status === 'CONNECTED') toast.success(t('testPassed'));
      else toast.error(t('testFailed'));
      refresh();
    } catch {
      toast.error(t('testFailed'));
    } finally {
      setBusy(null);
    }
  };
  const revoke = async () => {
    if (!revoking) return;
    setBusy(revoking.id);
    try {
      await carrierAccountApi.revoke(revoking.id);
      setRevoking(null);
      refresh();
    } catch {
      toast.error(t('operationFailed'));
    } finally {
      setBusy(null);
    }
  };
  const columns: ColumnDef<CarrierAccount>[] = [
    {
      key: 'warehouseId',
      label: t('warehouse'),
      render: (row) =>
        warehouses.find((warehouse) => warehouse.id === row.warehouseId)?.code ?? row.warehouseId,
    },
    { key: 'carrierId', label: t('carrier'), render: (row) => row.orcaCarrier.name },
    { key: 'maskedPreview', label: t('token') },
    {
      key: 'status',
      label: t('status'),
      render: (row) => (
        <Badge
          status={
            row.status === 'CONNECTED' ? 'success' : row.status === 'FAILED' ? 'error' : 'default'
          }
          label={t(row.status)}
        />
      ),
    },
    {
      key: 'actions',
      label: t('actions'),
      render: (row) =>
        row.status !== 'REVOKED' && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setEditing(row)}
            >
              {t('edit')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void test(row)}
            >
              {t('test')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setRevoking(row)}
            >
              {t('revoke')}
            </Button>
          </div>
        ),
    },
  ];
  return (
    <Card className="mt-6 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{t('title')}</h2>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading || busy !== null}>
            {t('refresh')}
          </Button>
          <Button
            onClick={() => setEditing(null)}
            disabled={optionsError || !warehouses.length || !carriers.length}
          >
            {t('create')}
          </Button>
        </div>
      </div>
      {(error || optionsError) && (
        <Alert variant="error" title={t('loadFailed')}>
          {t('retryHint')}
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label={t('warehouse')}
          value={warehouseId}
          options={[
            { value: '', label: t('all') },
            ...warehouses.map((row) => ({ value: row.id, label: row.code })),
          ]}
          onChange={(event) => {
            setWarehouseId(event.target.value);
            setCursor(undefined);
          }}
        />
        <Select
          label={t('carrier')}
          value={carrierId}
          options={[
            { value: '', label: t('all') },
            ...carriers.map((row) => ({ value: row.id, label: row.name })),
          ]}
          onChange={(event) => {
            setCarrierId(event.target.value);
            setCursor(undefined);
          }}
        />
      </div>
      <DataTable data={rows} columns={columns} isLoading={loading} emptyMessage={t('empty')} />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={!cursor || loading}
          onClick={() => setCursor(undefined)}
        >
          {t('firstPage')}
        </Button>
        <Button
          variant="outline"
          disabled={!nextCursor || loading}
          onClick={() => setCursor(nextCursor ?? undefined)}
        >
          {t('nextPage')}
        </Button>
      </div>
      {editing !== undefined && (
        <CarrierAccountModal
          key={editing?.id ?? 'new'}
          account={editing}
          carriers={carriers}
          warehouses={warehouses}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            refresh();
          }}
        />
      )}
      {revoking && (
        <Modal
          isOpen
          title={t('revoke')}
          onClose={() => {
            if (!busy) setRevoking(null);
          }}
        >
          <p>{t('revokeConfirm')}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" disabled={busy !== null} onClick={() => setRevoking(null)}>
              {t('cancel')}
            </Button>
            <Button isLoading={busy !== null} onClick={() => void revoke()}>
              {t('revoke')}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
