import { useEffect } from 'react';

import { Controller, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { Select } from '@/components/Common/Select/Select';

import { apiKeyApi } from '../api/apiKeyApi';
import {
  API_KEY_NAME_MAX_LENGTH,
  createApiKeySchema,
  type CreateApiKeySchemaValues,
} from '../schemas/apiKey.schemas';
import { API_KEY_EXPIRY_OPTIONS, API_KEY_SCOPES, type CreatedApiKey } from '../types/apiKey.types';

interface ApiKeyCreateModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Nhận key vừa tạo (kèm key đầy đủ) để hiển thị đúng một lần. */
  readonly onCreated: (created: CreatedApiKey) => void;
}

const DEFAULT_VALUES: CreateApiKeySchemaValues = {
  name: '',
  scopes: [...API_KEY_SCOPES],
  expiry: 'never',
};

export function ApiKeyCreateModal({ isOpen, onClose, onCreated }: ApiKeyCreateModalProps) {
  const t = useTranslations('ApiKeys');
  const tValidation = useTranslations('ApiKeys.validation');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateApiKeySchemaValues>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (isOpen) reset(DEFAULT_VALUES);
  }, [isOpen, reset]);

  const fieldError = (message: string | undefined) => (message ? tValidation(message) : undefined);

  const handleCreate = async (values: CreateApiKeySchemaValues) => {
    try {
      const created = await apiKeyApi.create(values);
      onCreated(created);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t('createError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('createTitle')} width="520px">
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(handleCreate)(event)}
        className="space-y-5 p-5 sm:p-6"
      >
        <Input
          label={t('fieldName')}
          placeholder={t('fieldNamePlaceholder')}
          required
          maxLength={API_KEY_NAME_MAX_LENGTH}
          error={fieldError(errors.name?.message)}
          {...register('name')}
        />

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-[var(--sc-text-primary)]">
            {t('fieldScopes')}
          </legend>
          <Controller
            control={control}
            name="scopes"
            render={({ field }) => (
              <>
                {API_KEY_SCOPES.map((scope) => (
                  <Checkbox
                    key={scope}
                    label={t(`scope.${scope}`)}
                    checked={field.value.includes(scope)}
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(
                        event.target.checked
                          ? [...field.value, scope]
                          : field.value.filter((selected) => selected !== scope),
                      )
                    }
                  />
                ))}
              </>
            )}
          />
          {errors.scopes?.message && (
            <p role="alert" className="text-xs text-[var(--sc-error)]">
              {fieldError(errors.scopes.message)}
            </p>
          )}
        </fieldset>

        <Select
          label={t('fieldExpiry')}
          options={API_KEY_EXPIRY_OPTIONS.map((option) => ({
            value: option,
            label: t(`expiry.${option}`),
          }))}
          {...register('expiry')}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('createSubmit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
