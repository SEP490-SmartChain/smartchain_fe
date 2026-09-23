import React, { useEffect, useState } from 'react';

import { Eye, EyeOff, Key, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import type {
  CarrierCredential,
  CarrierSummary,
  CreateCarrierCredentialInput,
  UpdateCarrierCredentialInput,
} from '../types/carrierCredential.types';

interface CarrierCredentialModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly editingCredential?: CarrierCredential | null;
  readonly availableCarriers: readonly CarrierSummary[];
  readonly onCreate: (payload: CreateCarrierCredentialInput) => Promise<CarrierCredential>;
  readonly onUpdate: (
    id: string,
    payload: UpdateCarrierCredentialInput,
  ) => Promise<CarrierCredential>;
}

export function CarrierCredentialModal({
  isOpen,
  onClose,
  editingCredential,
  availableCarriers,
  onCreate,
  onUpdate,
}: CarrierCredentialModalProps) {
  const t = useTranslations('CarrierCredentials');
  const isEditing = Boolean(editingCredential);

  const [carrierId, setCarrierId] = useState('');
  const [name, setName] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [shopId, setShopId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Khởi tạo state khi mở modal
  useEffect(() => {
    if (editingCredential) {
      setCarrierId(editingCredential.carrierId);
      setName(editingCredential.name);
      setApiToken('');
      setShopId('');
    } else {
      const defaultCarrier = availableCarriers[0];
      setCarrierId(defaultCarrier?.id ?? '');
      setName(defaultCarrier ? t('form.defaultName', { carrier: defaultCarrier.name }) : '');
      setApiToken('');
      setShopId('');
    }
    setShowToken(false);
    setErrors({});
  }, [editingCredential, availableCarriers, isOpen, t]);

  const selectedCarrier = availableCarriers.find((c) => c.id === carrierId);
  const isGhn = selectedCarrier?.code === 'GHN' || editingCredential?.carrier.code === 'GHN';

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!isEditing && !carrierId) {
      nextErrors.carrierId = t('form.errors.carrierRequired');
    }

    if (!name.trim() || name.trim().length < 2) {
      nextErrors.name = t('form.errors.nameMinLength');
    }

    if (!isEditing) {
      if (!apiToken.trim() || apiToken.trim().length < 4) {
        nextErrors.apiToken = t('form.errors.tokenMinLength');
      }
    } else if (apiToken && apiToken.trim().length < 4) {
      nextErrors.apiToken = t('form.errors.newTokenMinLength');
    }

    if (isGhn && !isEditing && !shopId.trim()) {
      nextErrors.shopId = t('form.errors.shopIdRequired');
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      if (isEditing && editingCredential) {
        const updatePayload: UpdateCarrierCredentialInput = {
          name: name.trim(),
          ...(apiToken.trim()
            ? {
                credentials: {
                  apiToken: apiToken.trim(),
                  ...(shopId.trim() ? { shopId: shopId.trim() } : {}),
                },
              }
            : {}),
        };
        await onUpdate(editingCredential.id, updatePayload);
        toast.success(apiToken.trim() ? t('form.toast.updatedWithKey') : t('form.toast.updated'));
      } else {
        const createPayload: CreateCarrierCredentialInput = {
          carrierId,
          name: name.trim(),
          // Người dùng chỉ kết nối môi trường thực tế; SANDBOX được cấu hình trực tiếp trong DB khi test.
          environment: 'PRODUCTION',
          authType: 'API_TOKEN',
          credentials: {
            apiToken: apiToken.trim(),
            ...(shopId.trim() ? { shopId: shopId.trim() } : {}),
          },
        };
        await onCreate(createPayload);
        toast.success(t('form.toast.created'));
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('form.toast.saveError');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const carrierOptions = availableCarriers.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.code})`,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing
          ? t('form.editTitle', { carrier: editingCredential?.carrier.name ?? '' })
          : t('form.createTitle')
      }
      width="540px"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
        {/* Chọn Hãng */}
        <div>
          <Select
            label={t('form.carrier')}
            value={carrierId}
            onChange={(e) => {
              setCarrierId(e.target.value);
              const found = availableCarriers.find((c) => c.id === e.target.value);
              if (found) {
                setName(t('form.defaultName', { carrier: found.name }));
              }
            }}
            options={carrierOptions}
            disabled={isEditing}
            error={errors.carrierId}
            required={!isEditing}
          />
        </div>

        {/* Tên cấu hình */}
        <div className="space-y-1.5">
          <Input
            label={t('form.name')}
            placeholder={t('form.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            required
          />
          <p className="text-[11px] text-[var(--sc-text-secondary)]">{t('form.nameHint')}</p>
        </div>

        {/* Thông tin API Token */}
        <div className="space-y-2">
          {isEditing && (
            <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3.5 text-xs text-[var(--sc-text-secondary)]">
              <span className="font-semibold text-[var(--sc-text-primary)]">
                {t('form.currentKey')}{' '}
              </span>
              <code className="rounded bg-[var(--sc-bg-surface)] px-1.5 py-0.5 font-mono text-[var(--sc-primary)] border border-[var(--sc-border-default)]">
                {editingCredential?.maskedPreview}
              </code>
              <p className="mt-1">{t('form.keepTokenHint')}</p>
            </div>
          )}

          <Input
            label={isEditing ? t('form.newToken') : t('form.token')}
            type={showToken ? 'text' : 'password'}
            placeholder={isEditing ? t('form.newTokenPlaceholder') : t('form.tokenPlaceholder')}
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            error={errors.apiToken}
            required={!isEditing}
            leftIcon={<Key size={16} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="cursor-pointer p-1 text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]"
                aria-label={showToken ? t('form.hideToken') : t('form.showToken')}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        </div>

        {/* Shop ID nếu là GHN */}
        {isGhn && (
          <div className="space-y-1.5">
            <Input
              label={t('form.shopId')}
              placeholder={t('form.shopIdPlaceholder')}
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              error={errors.shopId}
              required={!isEditing}
            />
            <p className="text-[11px] text-[var(--sc-text-secondary)]">{t('form.shopIdHint')}</p>
          </div>
        )}

        {/* Cảnh báo khi sửa key */}
        {isEditing && apiToken.trim() && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--sc-warning-border,#fde68a)] bg-[var(--sc-warning-bg,#fef3c7)] p-3.5 text-xs text-[var(--sc-warning-text,#92400e)]">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {t.rich('form.securityNote', { strong: (chunks) => <strong>{chunks}</strong> })}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('form.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t('form.saving')
              : isEditing
                ? t('form.saveChanges')
                : t('form.saveConnection')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
