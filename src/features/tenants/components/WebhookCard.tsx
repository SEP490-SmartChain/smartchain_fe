import { useState } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  Globe,
  Key,
  Loader2,
  Send,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge, Button, Card, Switch } from '@/components/Common';

import {
  WEBHOOK_EVENT_TOPICS,
  type WebhookEndpoint,
  type WebhookTestResult,
} from '../types/webhook.types';

export interface WebhookCardProps {
  webhook: WebhookEndpoint;
  onEdit: (webhook: WebhookEndpoint) => void;
  onDelete: (id: string) => Promise<boolean>;
  onToggleStatus: (id: string, currentStatus: boolean) => Promise<boolean>;
  onTestPing: (id: string) => Promise<WebhookTestResult>;
  isTesting: boolean;
  isToggling: boolean;
  isDeleting: boolean;
  testResult?: WebhookTestResult;
}

export function WebhookCard({
  webhook,
  onEdit,
  onDelete,
  onToggleStatus,
  onTestPing,
  isTesting,
  isToggling,
  isDeleting,
  testResult,
}: WebhookCardProps) {
  const t = useTranslations('Webhooks');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getTopicLabel = (topicId: string) => {
    const found = WEBHOOK_EVENT_TOPICS.find((item) => item.id === topicId);
    return found ? t(found.nameKey as any) : topicId;
  };

  const handleDelete = async () => {
    const ok = await onDelete(webhook.id);
    if (!ok) {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <Card className="overflow-hidden transition-all duration-150 hover:border-[var(--sc-primary-light)]">
      <div className="space-y-4">
        {/* Header row: URL, Status, Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-primary)]">
              <Globe size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-sm font-semibold text-[var(--sc-text-primary)]">
                  {webhook.url}
                </span>
                <Badge
                  status={webhook.isActive ? 'success' : 'default'}
                  label={webhook.isActive ? t('statusActive') : t('statusInactive')}
                  variant="solid"
                />
              </div>
              <p className="mb-0 text-xs text-[var(--sc-text-tertiary)]">
                {t('createdAt')}: {new Date(webhook.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Controls: Active switch, Edit, Delete */}
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <Switch
              checked={webhook.isActive}
              disabled={isToggling}
              onChange={() => onToggleStatus(webhook.id, webhook.isActive)}
              label={webhook.isActive ? t('enabled') : t('disabled')}
            />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(webhook)}
              aria-label={t('edit')}
              className="text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]"
            >
              <Edit2 size={15} />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(true)}
              aria-label={t('delete')}
              className="text-[var(--sc-error)] hover:bg-[var(--sc-error-bg)] hover:text-[var(--sc-error-dark)]"
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>

        {/* Delete Confirmation Banner */}
        {showDeleteConfirm && (
          <div className="flex items-center justify-between rounded-xl border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] p-3 text-xs text-[var(--sc-error-dark)]">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-[var(--sc-error)]" />
              <span>{t('deleteConfirmPrompt')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-7 px-2 text-xs"
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isDeleting}
                onClick={handleDelete}
                className="h-7 bg-[var(--sc-error)] px-3 text-xs text-white hover:bg-[var(--sc-error-dark)]"
              >
                {isDeleting ? t('deleting') : t('confirmDelete')}
              </Button>
            </div>
          </div>
        )}

        {/* Middle row: Masked Secret & Signing Details */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-[var(--sc-text-secondary)]">
            <Key size={14} className="text-[var(--sc-primary)]" />
            <span className="font-medium">{t('secretKey')}:</span>
            <span className="font-mono text-[var(--sc-text-primary)]">
              {webhook.maskedSecret || (webhook.hasSecret ? 'whsec_••••••••••••' : t('noSecret'))}
            </span>
          </div>
          <div className="text-[var(--sc-text-tertiary)]">•</div>
          <div className="text-[var(--sc-text-secondary)]">
            <span>{t('signingAlgorithm')}: </span>
            <span className="font-mono font-medium text-[var(--sc-text-primary)]">HMAC-SHA256</span>
          </div>
        </div>

        {/* Event Topics Badges */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--sc-text-secondary)]">
              {t('subscribedTopics')} ({webhook.eventTypes.length}):
            </span>
            {webhook.eventTypes.length === WEBHOOK_EVENT_TOPICS.length && (
              <span className="text-[11px] font-medium text-[var(--sc-success)]">
                ✓ {t('allTopicsSubscribed')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {webhook.eventTypes.map((topicId) => (
              <span
                key={topicId}
                title={topicId}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-2.5 py-1 text-xs text-[var(--sc-text-primary)] transition-colors hover:border-[var(--sc-primary-light)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--sc-primary)]" />
                <span className="font-medium">{getTopicLabel(topicId)}</span>
                <span className="font-mono text-[10px] text-[var(--sc-text-tertiary)]">
                  {topicId}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Test Ping Action & Results */}
        <div className="flex flex-col gap-3 border-t border-[var(--sc-border-default)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isTesting}
              onClick={() => onTestPing(webhook.id)}
              className="gap-1.5 text-xs"
            >
              {isTesting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  {t('testingPing')}
                </>
              ) : (
                <>
                  <Send size={13} />
                  {t('sendTestPing')}
                </>
              )}
            </Button>
            <span className="text-xs text-[var(--sc-text-tertiary)]">
              {t('sendTestPingHint')}
            </span>
          </div>

          {/* Test Ping Status Badge / Result Message */}
          {testResult && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {testResult.success ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] px-2.5 py-1 text-xs text-[var(--sc-success-dark)]">
                  <CheckCircle2 size={14} className="text-[var(--sc-success)]" />
                  <span className="font-semibold">
                    {testResult.statusCode ? `HTTP ${testResult.statusCode} OK` : t('pingSuccess')}
                  </span>
                  {typeof testResult.responseTimeMs === 'number' && (
                    <span className="font-mono text-[11px] opacity-80">
                      ({testResult.responseTimeMs}ms)
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-lg border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] px-2.5 py-1 text-xs text-[var(--sc-error-dark)]">
                  <AlertCircle size={14} className="text-[var(--sc-error)]" />
                  <span className="font-semibold">
                    {testResult.statusCode
                      ? `HTTP ${testResult.statusCode} Failed`
                      : t('pingFailed')}
                  </span>
                  {typeof testResult.responseTimeMs === 'number' && (
                    <span className="font-mono text-[11px] opacity-80">
                      ({testResult.responseTimeMs}ms)
                    </span>
                  )}
                  {testResult.error && (
                    <span className="max-w-[180px] truncate text-[11px] opacity-90">
                      - {testResult.error}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
