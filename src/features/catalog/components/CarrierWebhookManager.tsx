import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, RefreshCw, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, Badge, Button, Card, Input, Switch } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { carrierWebhookApi, type CarrierWebhookSettings } from '../api/carrierWebhookApi';
import {
  carrierCallbackUrl,
  carrierWebhookSchema,
  webhookPublicOrigin,
} from '../schemas/carrierWebhookSchema';

export function CarrierWebhookManager() {
  const { can } = useAccess();
  const revision = useAuthStore((state) => state.revision);
  return can('carriers.credentials.manage') ? <WebhookWorkspace key={revision} /> : null;
}

function WebhookWorkspace() {
  const t = useTranslations('CarrierWebhooks');
  const [rows, setRows] = useState<CarrierWebhookSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(false);
    setRows([]);
    void carrierWebhookApi
      .list(abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setRows(data);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [revision]);
  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={16} />
          {t('refresh')}
        </Button>
      </div>
      {loading ? (
        <p role="status">{t('loading')}</p>
      ) : error ? (
        <Alert variant="error">{t('loadFailed')}</Alert>
      ) : !rows.length ? (
        <p>{t('empty')}</p>
      ) : (
        <div className="divide-y divide-[var(--sc-border-default)]">
          {rows.map((row) => (
            <WebhookEditor key={`${revision}:${row.carrierCode}`} initial={row} />
          ))}
        </div>
      )}
      <p className="text-xs text-[var(--sc-text-secondary)]">{t('unsupported')}</p>
    </Card>
  );
}

function WebhookEditor({ initial }: { initial: CarrierWebhookSettings }) {
  const t = useTranslations('CarrierWebhooks');
  const [current, setCurrent] = useState(initial);
  const [savedToken, setSavedToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [failure, setFailure] = useState<'saveFailed' | 'stale' | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    lifetime.current = abort;
    return () => abort.abort();
  }, []);
  const form = useForm({
    resolver: zodResolver(
      carrierWebhookSchema(current.hasToken, {
        invalidToken: t('invalidToken'),
        tokenRequired: t('tokenRequired'),
      }),
    ),
    defaultValues: {
      token: '',
      status: initial.enabled ? ('enabled' as const) : ('disabled' as const),
    },
  });
  const busy = form.formState.isSubmitting;
  const origin = webhookPublicOrigin();
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (!lifetime.current?.signal.aborted) toast.success(t('copied'));
    } catch {
      if (!lifetime.current?.signal.aborted) toast.error(t('copyFailed'));
    }
  };
  const save = form.handleSubmit(async (values) => {
    setFailure(null);
    const signal = lifetime.current?.signal;
    try {
      const result = await carrierWebhookApi.update(
        current.carrierCode,
        {
          publicBaseUrl: origin,
          enabled: values.status === 'enabled',
          expectedVersion: current.version,
          ...(values.token ? { token: values.token } : {}),
        },
        signal,
      );
      if (signal?.aborted) return;
      setCurrent(result);
      if (values.token) setSavedToken(values.token);
      form.reset({
        token: '',
        status: result.enabled ? 'enabled' : 'disabled',
      });
      toast.success(t('saved'));
    } catch (error) {
      if (!signal?.aborted) {
        setFailure(error instanceof ApiError && error.status === 409 ? 'stale' : 'saveFailed');
      }
    }
  });
  const callbackUrl = carrierCallbackUrl(origin, current.carrierCode, savedToken || undefined);
  const canCopyUrl = current.carrierCode !== 'GHTK' || Boolean(savedToken);
  return (
    <section
      aria-label={t(`name_${current.carrierCode}`)}
      className="space-y-4 py-6 first:pt-0 last:pb-0"
    >
      <form noValidate onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{t(`name_${current.carrierCode}`)}</h2>
            <Badge
              status={current.enabled && current.hasToken ? 'success' : 'default'}
              label={t(current.enabled && current.hasToken ? 'configured' : 'disabled')}
            />
          </div>
          <Switch
            label={t('enable')}
            checked={form.watch('status') === 'enabled'}
            onChange={(event) =>
              form.setValue('status', event.target.checked ? 'enabled' : 'disabled', {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            disabled={busy}
          />
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <Input
            label={t('token')}
            type="password"
            autoComplete="new-password"
            {...form.register('token')}
            error={form.formState.errors.token?.message}
            helperText={t(current.hasToken ? 'keepToken' : 'tokenRequired')}
            disabled={busy}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            // Offsets the input label so the button lines up with the field, not its hint.
            className="shrink-0 sm:mt-7"
            onClick={() => {
              try {
                const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
                  value.toString(16).padStart(2, '0'),
                ).join('');
                form.setValue('token', token, { shouldDirty: true, shouldValidate: true });
              } catch {
                toast.error(t('generateFailed'));
              }
            }}
          >
            {t('generateToken')}
          </Button>
        </div>
        {form.formState.dirtyFields.token && (
          <Alert variant="warning">{t('rotationWarning')}</Alert>
        )}
        {failure && <Alert variant="error">{t(failure)}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
            <ShieldCheck size={15} />
            {t(`source_${current.source}`)}
          </p>
          <Button type="submit" isLoading={busy} disabled={busy || !form.formState.isDirty}>
            {t('save')}
          </Button>
        </div>
      </form>
      <div className="space-y-3 rounded-xl bg-[var(--sc-bg-secondary)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--sc-text-secondary)]">
            {t('callbackUrl')}
          </span>
          <code className="min-w-0 flex-1 break-all text-sm">
            {carrierCallbackUrl(origin, current.carrierCode)}
            {current.carrierCode === 'GHTK' ? '?hash=••••••••' : ''}
          </code>
          <Button
            variant="outline"
            size="sm"
            disabled={!canCopyUrl || busy}
            onClick={() => {
              void copy(callbackUrl);
            }}
          >
            <Copy size={14} />
            {t('copyUrl')}
          </Button>
        </div>
        {current.carrierCode === 'GHTK' && !savedToken && current.hasToken && (
          <p className="text-xs text-[var(--sc-text-secondary)]">{t('existingGhtkToken')}</p>
        )}
        {savedToken && (
          <div className="space-y-3">
            <Alert variant="warning">{t('oneTimeSecret')}</Alert>
            <Input
              readOnly
              label={
                current.carrierCode === 'GHN'
                  ? 'X-Orca-Webhook-Token'
                  : current.carrierCode === 'GHTK'
                    ? 'hash'
                    : 'TOKEN'
              }
              value={savedToken}
              type={showToken ? 'text' : 'password'}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowToken((value) => !value)}>
                {t(showToken ? 'hideToken' : 'showToken')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void copy(savedToken)}>
                {t('copyToken')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
