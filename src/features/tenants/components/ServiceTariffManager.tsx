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
              {
                key: 'code',
                label: t('code'),
                render: (row) => (
                  <div className="font-semibold text-[var(--sc-text-primary)]">{row.code}</div>
                ),
              },
              {
                key: 'versionNo',
                label: t('version'),
                render: (row) => (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] border border-[var(--sc-border-default)]">
                    v{row.versionNo}
                  </span>
                ),
              },
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
                  <div className="text-xs space-y-1 whitespace-nowrap">
                    <div className="text-[var(--sc-text-secondary)]">
                      <span className="font-medium text-[var(--sc-text-primary)]">Từ: </span>
                      {new Date(row.effectiveFrom).toLocaleDateString(locale, {
                        timeZone: 'Asia/Ho_Chi_Minh',
                      })}
                    </div>
                    <div className="text-[var(--sc-text-secondary)]">
                      <span className="font-medium text-[var(--sc-text-primary)]">Đến: </span>
                      {row.effectiveTo ? (
                        new Date(row.effectiveTo).toLocaleDateString(locale, {
                          timeZone: 'Asia/Ho_Chi_Minh',
                        })
                      ) : (
                        <span className="text-[var(--sc-text-tertiary)] italic">
                          {t('openEnded')}
                        </span>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'lines',
                label: t('rates'),
                render: (row) => (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 py-1 min-w-[340px] max-w-[500px]">
                    {row.lines.map((line) => (
                      <div
                        key={`${line.feeType}:${line.lowerBound}`}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[var(--sc-bg-secondary)] border border-[var(--sc-border-default)] text-xs transition-colors hover:border-[var(--sc-border-strong)]"
                      >
                        <span
                          className="font-medium text-[var(--sc-text-primary)] truncate"
                          title={t(`fee_${line.feeType}`)}
                        >
                          {t(`fee_${line.feeType}`)}
                        </span>
                        <span className="font-semibold text-[var(--sc-primary)] whitespace-nowrap">
                          {BigInt(line.unitPriceVnd).toLocaleString(locale)} đ
                          <span className="text-[10px] text-[var(--sc-text-tertiary)] font-normal ml-0.5">
                            /{line.unit}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: 'actions',
                label: t('actions'),
                render: (row) => (
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {row.status === 'DRAFT' ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                          {t('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCommand({ row, mode: 'publish' })}
                        >
                          {t('publish')}
                        </Button>
                      </>
                    ) : row.status === 'PUBLISHED' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCommand({ row, mode: 'close' })}
                      >
                        {t('close')}
                      </Button>
                    ) : null}
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
