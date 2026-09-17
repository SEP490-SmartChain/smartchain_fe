import { useState } from 'react';

import {
  AlertCircle,
  Code2,
  Info,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button, Card, CardHeader } from '@/components/Common';

import { useWebhooks } from '../hooks/useWebhooks';
import type {
  CreateWebhookPayload,
  UpdateWebhookPayload,
  WebhookEndpoint,
} from '../types/webhook.types';
import { WebhookCard } from './WebhookCard';
import { WebhookFormModal } from './WebhookFormModal';
import { WebhookSecretRevealModal } from './WebhookSecretRevealModal';

export function WebhookManager() {
  const t = useTranslations('Webhooks');
  const {
    webhooks,
    isLoading,
    error,
    testingId,
    togglingId,
    deletingId,
    testResults,
    refetch,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    toggleStatus,
    testPing,
  } = useWebhooks();

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookEndpoint | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [showInfoStrip, setShowInfoStrip] = useState(false);

  // Secret Reveal Modal state
  const [revealedSecret, setRevealedSecret] = useState<{
    secret: string;
    url: string;
  } | null>(null);

  const handleOpenCreate = () => {
    setEditingWebhook(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (webhook: WebhookEndpoint) => {
    setEditingWebhook(webhook);
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (data: {
    url: string;
    eventTypes: string[];
    secret?: string;
    isActive?: boolean;
  }) => {
    setIsSubmittingForm(true);
    try {
      if (editingWebhook) {
        const payload: UpdateWebhookPayload = {
          url: data.url,
          eventTypes: data.eventTypes,
          isActive: data.isActive,
        };
        if (data.secret) payload.secret = data.secret;

        const updated = await updateWebhook(editingWebhook.id, payload);
        toast.success(t('updateSuccess'));
        setIsFormModalOpen(false);

        // If a new secret was returned upon update
        if (updated.secret) {
          setRevealedSecret({ secret: updated.secret, url: updated.url });
        }
      } else {
        const payload: CreateWebhookPayload = {
          url: data.url,
          eventTypes: data.eventTypes,
          isActive: data.isActive ?? true,
        };
        if (data.secret) payload.secret = data.secret;

        const created = await createWebhook(payload);
        toast.success(t('createSuccess'));
        setIsFormModalOpen(false);

        // If server returned secret (auto-generated or raw secret)
        if (created.secret) {
          setRevealedSecret({ secret: created.secret, url: created.url });
        }
      }
    } catch {
      // apiClient already surfaces error via toast if not silent
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleDelete = async (id: string): Promise<boolean> => {
    const success = await deleteWebhook(id);
    if (success) {
      toast.success(t('deleteSuccess'));
    }
    return success;
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean): Promise<boolean> => {
    const success = await toggleStatus(id, currentStatus);
    if (success) {
      toast.success(currentStatus ? t('deactivatedToast') : t('activatedToast'));
    }
    return success;
  };

  const handleTestPing = async (id: string) => {
    const result = await testPing(id);
    if (result.success) {
      toast.success(
        t('testPingSuccessToast', {
          status: result.statusCode ?? 200,
          latency: result.responseTimeMs ?? 0,
        }),
      );
    } else {
      toast.error(
        t('testPingFailedToast', {
          reason: result.error || result.message || 'Error',
        }),
      );
    }
    return result;
  };

  return (
    <div className="space-y-6">
      {/* Top Card Header */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="m-0 text-lg font-medium text-[var(--sc-text-primary)]">
                  {t('managerTitle')}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2.5 py-0.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                  <Radio size={12} className="text-[var(--sc-success)]" />
                  {webhooks.length} {t('endpointsCount')}
                </span>
              </div>
              <p className="mb-0 mt-1.5 text-sm leading-5 text-[var(--sc-text-secondary)]">
                {t('managerDescription')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowInfoStrip((prev) => !prev)}
                className="gap-1.5 text-xs text-[var(--sc-text-secondary)]"
              >
                <Info size={14} className="text-[var(--sc-primary)]" />
                {showInfoStrip ? t('hideGuide') : t('showGuide')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isLoading}
                className="gap-1.5"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                {t('refresh')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleOpenCreate}
                className="gap-1.5"
              >
                <Plus size={16} />
                {t('addWebhook')}
              </Button>
            </div>
          </div>
        </div>

        {/* Informational Guidance Strip (Collapsible) */}
        {showInfoStrip && (
          <div className="border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4 sm:px-6">
            <div className="grid gap-3 text-xs text-[var(--sc-text-secondary)] md:grid-cols-3">
              <div className="flex items-start gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--sc-primary)]" />
                <div>
                  <span className="font-semibold text-[var(--sc-text-primary)]">
                    {t('infoSecurityTitle')}:
                  </span>{' '}
                  {t('infoSecurityDesc')}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Code2 size={16} className="mt-0.5 shrink-0 text-[var(--sc-primary)]" />
                <div>
                  <span className="font-semibold text-[var(--sc-text-primary)]">
                    {t('infoSignatureTitle')}:
                  </span>{' '}
                  {t('infoSignatureDesc')}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0 text-[var(--sc-primary)]" />
                <div>
                  <span className="font-semibold text-[var(--sc-text-primary)]">
                    {t('infoRetryTitle')}:
                  </span>{' '}
                  {t('infoRetryDesc')}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Webhooks Content Area */}
      {isLoading && webhooks.length === 0 ? (
        <Card className="flex min-h-[220px] flex-col items-center justify-center py-12 text-center">
          <Loader2 size={32} className="animate-spin text-[var(--sc-primary)]" />
          <p className="mb-0 mt-3 text-sm text-[var(--sc-text-secondary)]">
            {t('loadingWebhooks')}
          </p>
        </Card>
      ) : error ? (
        <Card className="border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] py-8 text-center">
          <AlertCircle size={32} className="mx-auto text-[var(--sc-error)]" />
          <h3 className="mb-1 mt-3 text-base font-medium text-[var(--sc-error-dark)]">
            {t('loadErrorTitle')}
          </h3>
          <p className="mb-4 text-xs text-[var(--sc-error-dark)] opacity-90">{error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </Card>
      ) : webhooks.length === 0 ? (
        /* Empty State */
        <Card className="border-dashed py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
            <Radio size={28} />
          </div>
          <h3 className="mb-1.5 mt-4 text-base font-semibold text-[var(--sc-text-primary)]">
            {t('emptyTitle')}
          </h3>
          <p className="mx-auto mb-6 max-w-md text-sm leading-5 text-[var(--sc-text-secondary)]">
            {t('emptyDescription')}
          </p>
          <Button type="button" onClick={handleOpenCreate} className="gap-1.5">
            <Plus size={16} />
            {t('createFirstWebhook')}
          </Button>
        </Card>
      ) : (
        /* Webhooks List */
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
              onToggleStatus={handleToggleStatus}
              onTestPing={handleTestPing}
              isTesting={testingId === webhook.id}
              isToggling={togglingId === webhook.id}
              isDeleting={deletingId === webhook.id}
              testResult={testResults[webhook.id]}
            />
          ))}
        </div>
      )}

      {/* Form Modal (Create / Edit) */}
      <WebhookFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        initialData={editingWebhook}
        isSubmitting={isSubmittingForm}
      />

      {/* Secret Reveal Modal (1-time copy) */}
      {revealedSecret && (
        <WebhookSecretRevealModal
          isOpen={Boolean(revealedSecret)}
          onClose={() => setRevealedSecret(null)}
          secret={revealedSecret.secret}
          endpointUrl={revealedSecret.url}
        />
      )}
    </div>
  );
}
