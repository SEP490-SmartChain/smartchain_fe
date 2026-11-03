import { useEffect, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';

import { ruleApi } from '../api/ruleApi';

import type { RuleRecord, RuleVersion } from '../types/rule.types';

export function RuleHistory({
  rule,
  onClose,
  onRollback,
}: {
  rule: RuleRecord;
  onClose: () => void;
  onRollback: (version: number) => void;
}) {
  const t = useTranslations('Rules'),
    locale = useLocale();
  const [items, setItems] = useState<RuleVersion[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    void ruleApi
      .history(rule.id, cursor, controller.signal)
      .then((page) => {
        if (active) {
          setItems(page.items);
          setNext(page.pagination.hasNext ? page.pagination.nextCursor : null);
        }
      })
      .catch((failure) => {
        if (active) {
          setItems([]);
          setNext(null);
          setError(failure instanceof ApiError ? failure.message : t('loadError'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [rule.id, cursor, retry, t]);
  return (
    <Modal isOpen onClose={onClose} title={t('historyTitle', { name: rule.name })} width="880px">
      <div className="space-y-4">
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('historyNotice')}</p>
        {loading ? (
          <p role="status">{t('loading')}</p>
        ) : error ? (
          <Alert variant="error">
            {error}
            <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
              {t('retry')}
            </Button>
          </Alert>
        ) : !items.length ? (
          <p>{t('emptyHistory')}</p>
        ) : (
          items.map((item) => (
            <article
              key={item.version}
              className="space-y-2 rounded-xl border border-[var(--sc-border-default)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  {t('version', { version: item.version })} · {t(`operations.${item.operation}`)}
                </strong>
                <Button variant="outline" size="sm" onClick={() => onRollback(item.version)}>
                  {t('restoreVersion', { version: item.version })}
                </Button>
              </div>
              <p className="text-sm">{item.reason}</p>
              <p className="break-all text-xs text-[var(--sc-text-secondary)]">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(item.createdAt))}{' '}
                · {t('actor', { id: item.createdBy })}
              </p>
              <details>
                <summary className="cursor-pointer text-sm">{t('definition')}</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(item.definition, null, 2)}
                </pre>
              </details>
            </article>
          ))
        )}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            disabled={loading || !cursor}
            onClick={() => setCursor(undefined)}
          >
            {t('firstPage')}
          </Button>
          <Button
            variant="outline"
            disabled={loading || !next}
            onClick={() => setCursor(next ?? undefined)}
          >
            {t('nextPage')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
