import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Globe, Key, Package, ShieldCheck, Truck, Warehouse } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

import { Button, Checkbox, Input, Switch } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import {
  createWebhookFormSchema,
  type CreateWebhookFormData,
} from '../schemas/webhook.schemas';
import {
  WEBHOOK_EVENT_TOPICS,
  type WebhookEndpoint,
} from '../types/webhook.types';

export interface WebhookFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    url: string;
    eventTypes: string[];
    secret?: string;
    isActive?: boolean;
  }) => Promise<void>;
  initialData?: WebhookEndpoint | null;
  isSubmitting?: boolean;
}

const CATEGORIES = [
  { key: 'orders', nameKey: 'categoryOrders', icon: Package },
  { key: 'shipping', nameKey: 'categoryShipping', icon: Truck },
  { key: 'inventory_finance', nameKey: 'categoryInventoryFinance', icon: Warehouse },
] as const;

export function WebhookFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isSubmitting = false,
}: WebhookFormModalProps) {
  const t = useTranslations('Webhooks');
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateWebhookFormData>({
    resolver: zodResolver(createWebhookFormSchema),
    defaultValues: {
      url: '',
      secret: '',
      eventTypes: WEBHOOK_EVENT_TOPICS.map((topic) => topic.id),
      isActive: true,
    },
  });

  const selectedEventTypes = watch('eventTypes') || [];
  const isActive = watch('isActive');
  const [showAdvancedSecret, setShowAdvancedSecret] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          url: initialData.url,
          secret: '',
          eventTypes: initialData.eventTypes,
          isActive: initialData.isActive,
        });
        setShowAdvancedSecret(false);
      } else {
        reset({
          url: '',
          secret: '',
          eventTypes: WEBHOOK_EVENT_TOPICS.map((topic) => topic.id),
          isActive: true,
        });
        setShowAdvancedSecret(false);
      }
    }
  }, [isOpen, initialData, reset]);

  const toggleEventTopic = (topicId: string) => {
    const current = new Set(selectedEventTypes);
    if (current.has(topicId)) {
      current.delete(topicId);
    } else {
      current.add(topicId);
    }
    setValue('eventTypes', Array.from(current), { shouldValidate: true });
  };

  const handleSelectAllTopics = () => {
    if (selectedEventTypes.length === WEBHOOK_EVENT_TOPICS.length) {
      setValue('eventTypes', [], { shouldValidate: true });
    } else {
      setValue(
        'eventTypes',
        WEBHOOK_EVENT_TOPICS.map((topic) => topic.id),
        { shouldValidate: true },
      );
    }
  };

  const onFormSubmit = async (data: CreateWebhookFormData) => {
    const payload: {
      url: string;
      eventTypes: string[];
      secret?: string;
      isActive?: boolean;
    } = {
      url: data.url,
      eventTypes: data.eventTypes,
      isActive: data.isActive,
    };
    if (data.secret?.trim()) {
      payload.secret = data.secret.trim();
    }
    await onSubmit(payload);
  };

  const allTopicsSelected = selectedEventTypes.length === WEBHOOK_EVENT_TOPICS.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? t('editWebhookTitle') : t('createWebhookTitle')}
      width="760px"
    >
      <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-6">
        {/* Endpoint URL Input */}
        <div>
          <Input
            label={t('urlLabel')}
            placeholder="https://erp.yourcompany.com/api/v1/webhooks"
            leftIcon={<Globe size={16} />}
            required
            error={errors.url ? t(errors.url.message as any) : undefined}
            helperText={t('urlHelper')}
            {...register('url')}
          />
        </div>

        {/* Security Info Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3.5 text-xs">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--sc-success)]" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--sc-text-primary)]">
              {t('infoSignatureTitle')} &amp; {t('ssrfProtectionEnabled')}
            </p>
            <p className="mt-0.5 leading-relaxed text-[var(--sc-text-secondary)]">
              {t('infoSignatureDesc')} {t('ssrfProtectionDesc')}
            </p>
          </div>
        </div>

        {/* Event Topics Selection - Grouped by Domain Category */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <label className="block text-sm font-semibold text-[var(--sc-text-primary)]">
                {t('eventTopicsLabel')}
                <span className="ml-1 text-[var(--sc-error)]">*</span>
              </label>
              <p className="mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                {t('eventTopicsHelper')}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSelectAllTopics}
              className="text-xs text-[var(--sc-primary)]"
            >
              {allTopicsSelected ? t('deselectAll') : t('selectAll')}
            </Button>
          </div>

          {errors.eventTypes && (
            <p className="mb-3 text-xs font-medium text-[var(--sc-error-dark)]">
              {t(errors.eventTypes.message as any)}
            </p>
          )}

          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const categoryTopics = WEBHOOK_EVENT_TOPICS.filter(
                (topic) => topic.category === cat.key,
              );
              if (categoryTopics.length === 0) return null;
              const CatIcon = cat.icon;

              return (
                <div key={cat.key} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                    <CatIcon size={14} className="text-[var(--sc-primary)]" />
                    <span>{t(cat.nameKey as any)}</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {categoryTopics.map((topic) => {
                      const isChecked = selectedEventTypes.includes(topic.id);
                      return (
                        <div
                          key={topic.id}
                          onClick={() => toggleEventTopic(topic.id)}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-all ${
                            isChecked
                              ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)]'
                              : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] hover:border-[var(--sc-primary-light)]'
                          }`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onChange={() => {}}
                            className="shrink-0"
                            tabIndex={-1}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold leading-tight text-[var(--sc-text-primary)]" title={t(topic.descKey as any)}>
                                {t(topic.nameKey as any)}
                              </span>
                              <span className="shrink-0 rounded bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--sc-text-tertiary)]">
                                {topic.id}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible IT Secret Key Configuration */}
        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--sc-text-primary)]">
                {isEditing ? t('rotateSecretKey') : t('signingSecret')}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--sc-text-secondary)]">
                {isEditing
                  ? t('rotateSecretKeyHelper')
                  : t('signingSecretAutoHelper')}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvancedSecret((prev) => !prev)}
              className="text-xs"
            >
              {showAdvancedSecret ? t('hideManualSecret') : t('showManualSecret')}
            </Button>
          </div>

          {showAdvancedSecret && (
            <div className="mt-3 border-t border-[var(--sc-border-default)] pt-3">
              <Input
                label={t('customSecretLabel')}
                placeholder="whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                leftIcon={<Key size={16} />}
                error={errors.secret ? t(errors.secret.message as any) : undefined}
                helperText={t('customSecretHelper')}
                {...register('secret')}
              />
            </div>
          )}
        </div>

        {/* Status Switch */}
        <div className="flex items-center justify-between border-t border-[var(--sc-border-default)] pt-4">
          <div>
            <span className="block text-sm font-semibold text-[var(--sc-text-primary)]">
              {t('activeStatusLabel')}
            </span>
            <span className="block text-xs text-[var(--sc-text-secondary)]">
              {t('activeStatusHelper')}
            </span>
          </div>
          <Switch
            checked={isActive}
            onChange={(e) => setValue('isActive', e.target.checked)}
          />
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t('saving')
              : isEditing
                ? t('saveChanges')
                : t('createWebhookBtn')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

