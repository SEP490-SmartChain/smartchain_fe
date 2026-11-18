import { useEffect, useState } from 'react';

import { ArrowRight, Inbox, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { useAuthStore } from '@/stores/authStore';

import { commercialApi } from '../api/commercialApi';

export function CustomInquiryInbox({ onSelect }: { onSelect: (id: string) => void }) {
  const t = useTranslations('AdminTenants');
  const revision = useAuthStore((state) => state.revision);
  const [cursor, setCursor] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof commercialApi.pendingInquirySellers>>>();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    setHasError(false);
    setResult(undefined);
    void commercialApi.pendingInquirySellers(cursor, abort.signal).then(
      (page) => {
        if (!abort.signal.aborted) setResult(page);
      },
      () => {
        if (!abort.signal.aborted) setHasError(true);
      },
    );
    return () => abort.abort();
  }, [cursor, refresh, revision]);

  return (
    <Card className="space-y-3" padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 !text-base !font-semibold">
          <Inbox size={18} aria-hidden="true" className="text-[var(--sc-primary)]" />
          {t('customInbox')}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('refreshInbox')}
          title={t('refreshInbox')}
          onClick={() => {
            setCursor(undefined);
            setRefresh((value) => value + 1);
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </Button>
      </div>
      {hasError && <Alert variant="error">{t('inboxError')}</Alert>}
      {!result && !hasError && <p role="status">{t('inboxLoading')}</p>}
      {result?.sellers.length === 0 && <p>{t('inboxEmpty')}</p>}
      {!!result?.sellers.length && (
        <ul className="divide-y divide-[var(--sc-border-default)] border-t border-[var(--sc-border-default)]">
          {result.sellers.map((seller) => (
            <li key={seller.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{seller.name}</span>
                <Badge
                  status="warning"
                  label={t(seller.stage === 'DRAFT' ? 'inboxDraft' : 'inboxRequested')}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => onSelect(seller.id)}>
                {t('openCustomContract')}
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {result?.nextCursor && (
        <Button variant="ghost" size="sm" onClick={() => setCursor(result.nextCursor ?? undefined)}>
          {t('nextInboxPage')}
        </Button>
      )}
    </Card>
  );
}
