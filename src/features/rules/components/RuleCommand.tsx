import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ruleApi } from '../api/ruleApi';
import { priorityEntries } from '../lib/rulePriority';
import { reasonSchema } from '../schemas/ruleSchema';

import type { RuleRecord } from '../types/rule.types';

export type Command =
  | {
      operation: 'publish' | 'disable' | 'delete' | 'rollback';
      rule: RuleRecord;
      targetVersion?: number;
    }
  | { operation: 'reorder'; items: RuleRecord[] };
export function RuleCommand({
  command,
  onClose,
  onSaved,
}: {
  command: Command;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Rules');
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({
    resolver: zodResolver(reasonSchema(t('invalid'))),
    defaultValues: { reason: '' },
  });
  const submit = handleSubmit(async (values) => {
    const identity = useAuthStore.getState().user;
    setError(null);
    try {
      if (command.operation === 'reorder') {
        await ruleApi.reorder(priorityEntries(command.items), values.reason);
      } else {
        await ruleApi.command(
          command.rule,
          command.operation,
          values.reason,
          command.targetVersion,
        );
      }
      if (identity === useAuthStore.getState().user) onSaved();
    } catch (failure) {
      if (identity === useAuthStore.getState().user) {
        setError(failure instanceof ApiError ? failure.message : t('saveError'));
      }
    }
  });
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title={t(`commands.${command.operation}`)}
      width="580px"
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-[var(--sc-text-secondary)]">
          {command.operation === 'reorder'
            ? t('reorderNotice')
            : t(`commandHints.${command.operation}`, {
                name: command.rule.name,
                version:
                  command.operation === 'rollback'
                    ? (command.targetVersion ?? 0)
                    : command.rule.version,
              })}
        </p>
        {error && (
          <Alert variant="error">
            {error}
            <p className="mt-2">{t('commandErrorHint')}</p>
          </Alert>
        )}
        <Input
          aria-required
          label={t('reason')}
          {...register('reason')}
          error={errors.reason?.message}
          disabled={isSubmitting}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            variant={command.operation === 'delete' ? 'danger' : 'primary'}
            isLoading={isSubmitting}
          >
            {t('confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
