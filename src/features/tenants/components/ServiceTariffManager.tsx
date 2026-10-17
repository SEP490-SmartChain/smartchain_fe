import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, PageHeader } from '@/components/Common';
import DataTable from '@/components/Common/DataTable/DataTable';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

import { ServiceTariffCommand } from './ServiceTariffCommand';
import { ServiceTariffEditor } from './ServiceTariffEditor';
import { serviceTariffApi } from '../api/serviceTariffApi';

import type { ServiceTariff } from '../schemas/serviceTariffSchema';

export function ServiceTariffManager() {
  const { can } = useAccess();
  const user = useAuthStore((state) => state.user);
  const revision = useAuthStore((state) => state.revision);
  if (!can('tariffs.manage') || !user) return null;
  return <Manager key={`${user.userId}:${revision}`} />;
}

function Manager() {
  const t = useTranslations('ServiceTariffs');
  const locale = useLocaleStore((state) => state.locale);
  const [rows, setRows] = useState<ServiceTariff[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [next, setNext] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ServiceTariff | null | undefined>();
  const [command, setCommand] = useState<{ row: ServiceTariff; mode: 'publish' | 'close' } | null>(
    null,
  );
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    setRows([]);
    setNext(null);
    void serviceTariffApi
      .list(cursor, abort.signal)
      .then((page) => {
        if (!abort.signal.aborted) {
          setRows(page.items);
          setNext(page.pagination.nextCursor);
        }
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) {
          setError(failure instanceof Error ? failure.message : t('loadError'));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [cursor, reload, t]);
  const saved = () => {
    setEditing(undefined);
    setCommand(null);
    setReload((value) => value + 1);
  };
  return (
    <section className="space-y-5">
      <Card className="space-y-4">
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => setReload((value) => value + 1)}
              >
                {t('reload')}
              </Button>
              <Button onClick={() => setEditing(null)}>{t('create')}</Button>
            </div>
          }
        />
        {error && <Alert variant="error">{error}</Alert>}
        {!error && (
          <DataTable
            data={rows}
            getRowKey={(row) => row.id}
            isLoading={loading}
            ariaLabel={t('title')}
            emptyMessage={t('empty')}
            columns={[
              { key: 'code', label: t('code') },
              { key: 'versionNo', label: t('version') },
              {
                key: 'status',
                label: t('status'),
                render: (row) => (
                  <Badge
                    status={row.status === 'PUBLISHED' ? 'success' : 'default'}
                    label={t(`status_${row.status}`)}
                  />
                ),
              },
              {
                key: 'effectiveFrom',
                label: t('effectiveWindow'),
                render: (row) => (
                  <span>
                    {new Date(row.effectiveFrom).toLocaleString(locale, {
                      timeZone: 'Asia/Ho_Chi_Minh',
                    })}
                    <br />
                    {row.effectiveTo
                      ? new Date(row.effectiveTo).toLocaleString(locale, {
                          timeZone: 'Asia/Ho_Chi_Minh',
                        })
                      : t('openEnded')}
                  </span>
                ),
              },
              {
                key: 'lines',
                label: t('rates'),
                render: (row) => (
                  <ul className="space-y-1">
                    {row.lines.map((line) => (
                      <li key={`${line.feeType}:${line.lowerBound}`}>
                        {t(`fee_${line.feeType}`)} ·{' '}
                        {BigInt(line.unitPriceVnd).toLocaleString(locale)} VND/{line.unit} ·{' '}
                        {line.lowerBound}–{line.upperBound ?? '∞'}
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                key: 'actions',
                label: t('actions'),
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    {row.status === 'DRAFT' ? (
                      <>
                        <Button variant="ghost" onClick={() => setEditing(row)}>
                          {t('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setCommand({ row, mode: 'publish' })}
                        >
                          {t('publish')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm">{t('immutable')}</span>
                        {row.status === 'PUBLISHED' && (
                          <Button
                            variant="ghost"
                            onClick={() => setCommand({ row, mode: 'close' })}
                          >
                            {t('close')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={!cursor || loading}
            onClick={() => setCursor(undefined)}
          >
            {t('firstPage')}
          </Button>
          <Button
            variant="secondary"
            disabled={!next || loading}
            onClick={() => setCursor(next ?? undefined)}
          >
            {t('nextPage')}
          </Button>
        </div>
      </Card>
      {editing !== undefined && (
        <ServiceTariffEditor row={editing} onClose={() => setEditing(undefined)} onSaved={saved} />
      )}
      {command && (
        <ServiceTariffCommand
          row={command.row}
          mode={command.mode}
          onClose={() => setCommand(null)}
          onSaved={saved}
        />
      )}
    </section>
  );
}
