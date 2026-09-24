import { useMemo, useState } from 'react';

import { Ban, Check, Copy, Plus, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import { SecretRevealModal } from '@/components/Common/SecretRevealModal/SecretRevealModal';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { buildPublicApiUrl } from '@/lib/publicApiUrl';

import { ApiKeyCreateModal } from './ApiKeyCreateModal';
import { ApiKeyRevokeModal } from './ApiKeyRevokeModal';
import { useApiKeys } from '../hooks/useApiKeys';

import type { ApiKey, ApiKeyStatus, CreatedApiKey } from '../types/apiKey.types';

const PAGE_SIZE = 10;
/** Đường dẫn endpoint tính từ base URL của API (đã gồm `/api`). */
const INGEST_PATH = '/v1/ingest/products';
const STATUS_BADGE: Record<ApiKeyStatus, 'success' | 'default' | 'warning'> = {
  ACTIVE: 'success',
  REVOKED: 'default',
  EXPIRED: 'warning',
};

export function ApiKeyManager() {
  const t = useTranslations('ApiKeys');
  const locale = useLocale();
  const { apiKeys, error, isLoading, hasNextPage, refetch, loadMore } = useApiKeys();
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [locale],
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale],
  );
  const ingestUrl = useMemo(() => buildPublicApiUrl(INGEST_PATH), []);
  const { isCopied: isEndpointCopied, copy } = useCopyToClipboard();

  const loadedPageCount = Math.max(1, Math.ceil(apiKeys.length / PAGE_SIZE));
  const totalPages = loadedPageCount + (hasNextPage ? 1 : 0);
  const visibleKeys = apiKeys.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const formatDate = (value: string | null, fallback: string) =>
    value === null ? fallback : dateFormatter.format(new Date(value));
  /** Ngày trước giờ để cột đọc thống nhất, không phụ thuộc thứ tự mặc định của locale. */
  const formatDateTime = (value: string | null, fallback: string) =>
    value === null
      ? fallback
      : `${dateFormatter.format(new Date(value))} ${timeFormatter.format(new Date(value))}`;

  const handlePageChange = async (page: number) => {
    if (page > loadedPageCount && hasNextPage) await loadMore();
    setCurrentPage(page);
  };

  const handleCopyEndpoint = async (endpoint: string) => {
    if (await copy(endpoint)) toast.success(t('endpointCopied'));
    else toast.error(t('copyFailed'));
  };

  const handleListChanged = () => {
    setCurrentPage(1);
    void refetch();
  };

  const handleCreated = (created: CreatedApiKey) => {
    setIsCreateOpen(false);
    setRevealed(created);
    handleListChanged();
  };

  const columns: ColumnDef<ApiKey>[] = [
    { key: 'name', label: t('columnName') },
    {
      key: 'keyPrefix',
      label: t('columnKey'),
      render: (row) => (
        <code className="whitespace-nowrap font-mono text-xs">{`sck_${row.keyPrefix}…`}</code>
      ),
    },
    {
      key: 'scopes',
      label: t('columnScopes'),
      render: (row) => row.scopes.map((scope) => t(`scope.${scope}`)).join(', '),
    },
    {
      key: 'status',
      label: t('columnStatus'),
      render: (row) => (
        <span className="whitespace-nowrap">
          <Badge status={STATUS_BADGE[row.status]} label={t(`status.${row.status}`)} size="md" />
        </span>
      ),
    },
    {
      key: 'expiresAt',
      label: t('columnExpiresAt'),
      render: (row) => (
        <span className="whitespace-nowrap">{formatDate(row.expiresAt, t('neverExpires'))}</span>
      ),
    },
    {
      key: 'lastUsedAt',
      label: t('columnLastUsed'),
      render: (row) => (
        <span className="whitespace-nowrap">{formatDateTime(row.lastUsedAt, t('neverUsed'))}</span>
      ),
    },
    {
      key: 'createdAt',
      label: t('columnCreatedAt'),
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.createdAt, '')}</span>,
    },
    {
      key: 'actions',
      label: <span className="sr-only">{t('columnActions')}</span>,
      render: (row) =>
        row.status === 'ACTIVE' ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t('revokeAction', { name: row.name })}
            onClick={() => setRevoking(row)}
            className="gap-1.5 text-[var(--sc-error)]"
          >
            <Ban size={16} aria-hidden="true" />
            {t('revoke')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="m-0 text-lg font-medium text-[var(--sc-text-primary)]">{t('title')}</h2>
            <p className="mb-0 mt-1.5 text-sm leading-5 text-[var(--sc-text-secondary)]">
              {t('description')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
              {t('refresh')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="gap-1.5"
            >
              <Plus size={16} aria-hidden="true" />
              {t('create')}
            </Button>
          </div>
        </div>

        <section
          aria-labelledby="api-key-connection-title"
          className="border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-5 sm:px-6"
        >
          <h3
            id="api-key-connection-title"
            className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]"
          >
            {t('guideTitle')}
          </h3>

          {ingestUrl ? (
            <div className="mt-3">
              <label
                htmlFor="api-key-endpoint"
                className="mb-1.5 block text-xs font-medium text-[var(--sc-text-secondary)]"
              >
                {t('guideEndpointLabel')}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex h-11 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] focus-within:border-[var(--sc-primary)]">
                  <span className="flex h-full shrink-0 items-center border-r border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-3 font-mono text-xs font-semibold text-[var(--sc-primary)]">
                    POST
                  </span>
                  <input
                    id="api-key-endpoint"
                    type="text"
                    readOnly
                    value={ingestUrl}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-xs text-[var(--sc-text-primary)] outline-none"
                  />
                </div>
                <Button
                  type="button"
                  variant={isEndpointCopied ? 'secondary' : 'outline'}
                  onClick={() => void handleCopyEndpoint(ingestUrl)}
                  className="h-11 shrink-0 gap-1.5 px-4 text-xs font-medium"
                >
                  {isEndpointCopied ? (
                    <Check size={16} className="text-[var(--sc-success)]" aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  {isEndpointCopied ? t('copied') : t('copy')}
                </Button>
              </div>
            </div>
          ) : (
            <Alert variant="info" className="mt-3">
              {t('guideEndpointUnconfigured')}
            </Alert>
          )}

          <p className="mb-0 mt-3 text-sm text-[var(--sc-text-secondary)]">
            {t.rich('guideAuth', {
              header: (chunks) => (
                <code className="rounded bg-[var(--sc-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--sc-text-primary)]">
                  {chunks}
                </code>
              ),
            })}
          </p>
        </section>
      </Card>

      {error ? (
        <Alert variant="error" title={t('loadError')}>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Alert>
      ) : (
        <section className="sc-surface overflow-hidden" aria-label={t('tableLabel')}>
          <DataTable
            ariaLabel={t('tableLabel')}
            columns={columns}
            data={visibleKeys}
            isLoading={isLoading}
            getRowKey={(row) => row.id}
            emptyMessage={
              <div className="space-y-3 py-6 text-center">
                <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{t('empty')}</p>
                <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
                  {t('create')}
                </Button>
              </div>
            }
            pagination={{
              currentPage: Math.min(currentPage, totalPages),
              totalPages,
              onPageChange: (page) => void handlePageChange(page),
            }}
          />
        </section>
      )}

      <ApiKeyCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />

      {revealed && (
        <SecretRevealModal
          isOpen
          onClose={() => setRevealed(null)}
          secret={revealed.rawKey}
          inputId="api-key-secret-input"
          labels={{
            title: t('revealTitle'),
            warningTitle: t('revealWarningTitle'),
            warningDescription: t('revealWarningDescription'),
            secretLabel: t('revealKeyLabel', { name: revealed.apiKey.name }),
            copy: t('copy'),
            copied: t('copied'),
            copySucceeded: t('copySucceeded'),
            copyFailed: t('copyFailed'),
            storageAdvice: t('revealStorageAdvice'),
            confirm: t('revealConfirm'),
          }}
        />
      )}

      <ApiKeyRevokeModal
        apiKey={revoking}
        onClose={() => setRevoking(null)}
        onChanged={handleListChanged}
      />
    </div>
  );
}
