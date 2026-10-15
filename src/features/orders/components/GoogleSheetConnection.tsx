import { useEffect, useRef, useState } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import { Alert, Badge, Button } from '@/components/Common';
import { useAuthStore } from '@/stores/authStore';

import { ordersApi, type SheetConnection } from '../api/ordersApi';
import { orderErrorKey } from '../lib/orderFeedback';
import { formatOrderDate } from '../lib/orderPresentation';
import { orderScope, sellerOrderAccess } from '../lib/orderScope';

export function GoogleSheetConnection({
  scope,
  onTemplate,
}: {
  scope: string;
  onTemplate: () => void;
}) {
  const t = useTranslations('Orders');
  const locale = useLocale();
  const [connection, setConnection] = useState<SheetConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const createRequest = useRef<AbortController | null>(null);
  const ownerEmail = useAuthStore((state) => state.user?.email ?? '');
  useEffect(() => {
    const controller = new AbortController();
    setConnection(null);
    setError(null);
    setCreating(false);
    const unsubscribe = useAuthStore.subscribe(() => {
      if (orderScope() !== scope || !sellerOrderAccess().create) {
        controller.abort();
        createRequest.current?.abort();
      }
    });
    if (orderScope() === scope && sellerOrderAccess().create) {
      void ordersApi
        .sheetConnection(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted && orderScope() === scope) setConnection(value);
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted && orderScope() === scope) {
            setError(t(orderErrorKey(failure)));
          }
        });
    }
    return () => {
      unsubscribe();
      controller.abort();
      createRequest.current?.abort();
    };
  }, [scope, revision, t]);
  async function handleCreate() {
    if (
      creating ||
      (createRequest.current && !createRequest.current.signal.aborted) ||
      orderScope() !== scope ||
      !sellerOrderAccess().create
    ) {
      return;
    }
    const controller = new AbortController();
    createRequest.current = controller;
    setCreating(true);
    setError(null);
    try {
      const value = await ordersApi.createSheet(controller.signal);
      if (!controller.signal.aborted && orderScope() === scope) setConnection(value);
    } catch (failure) {
      if (!controller.signal.aborted && orderScope() === scope) {
        setError(t(orderErrorKey(failure)));
        try {
          const value = await ordersApi.sheetConnection(controller.signal);
          if (!controller.signal.aborted && orderScope() === scope) setConnection(value);
        } catch {
          // Preserve the original setup error if its status cannot be refreshed.
        }
      }
    } finally {
      if (createRequest.current === controller) createRequest.current = null;
      if (!controller.signal.aborted && orderScope() === scope) setCreating(false);
    }
  }
  return (
    <div className="space-y-4">
      {!connection && !error && <p role="status">{t('loading')}</p>}
      {error && <Alert variant="error">{error}</Alert>}
      {connection?.status === 'CONFIGURED' && (
        <>
          <Badge status="info" label={t('sheetConfigured')} />
          <p className="font-medium">{connection.name}</p>
          <a
            href={connection.spreadsheetUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg bg-[var(--sc-primary)] px-4 py-3 font-medium hover:bg-[var(--sc-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="text-white">{t('sheetOpen')}</span>
          </a>
          <p>{t('sheetSendInstructions')}</p>
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('sheetRuntimeHint')}</p>
          <p className="text-sm">
            {t('sheetLastOrder')}:{' '}
            {connection.lastOrderReceivedAt
              ? formatOrderDate(connection.lastOrderReceivedAt, locale)
              : t('sheetNoOrders')}
          </p>
        </>
      )}
      {connection?.status === 'NOT_CONFIGURED' && (
        <>
          <Alert variant="info">
            {t(connection.setupAvailable ? 'sheetCreateHint' : 'sheetPlatformUnavailable')}
          </Alert>
          {connection.setupAvailable && (
            <>
              <p>{t('sheetCreateConsent', { email: ownerEmail })}</p>
              {connection.setupState === 'PREPARING' && <p role="status">{t('sheetPreparing')}</p>}
              {connection.setupState === 'FAILED' && (
                <Alert variant="warning">{t('sheetSetupRetryHint')}</Alert>
              )}
              <Button
                isLoading={creating}
                disabled={connection.setupState === 'PREPARING'}
                onClick={() => void handleCreate()}
              >
                {t(connection.setupState === 'FAILED' ? 'sheetRetrySetup' : 'sheetCreate')}
              </Button>
              {creating && <p role="status">{t('sheetPreparing')}</p>}
            </>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => setRevision((value) => value + 1)}
          disabled={creating || (!connection && !error)}
        >
          {t('sheetRefresh')}
        </Button>
        <Button variant="ghost" onClick={onTemplate}>
          {t('sheet_template')}
        </Button>
      </div>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('sheetTemplateOnly')}</p>
    </div>
  );
}
