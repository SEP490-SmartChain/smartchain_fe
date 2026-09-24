import { useEffect, useRef, useState } from 'react';

import { Building2, CheckCircle2, Copy, ImagePlus, Save, Trash2, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button, Input } from '@/components/Common';
import { uploadApi } from '@/services/uploadApi';

import { workspaceSettingsApi, type WorkspaceSettings } from '../api/workspaceSettingsApi';
import { SettingsMatrixCard } from './SettingsMatrixCard';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function WorkspaceGeneralSettings() {
  const t = useTranslations('Settings');
  const fileInput = useRef<HTMLInputElement>(null);

  const [saved, setSaved] = useState<WorkspaceSettings | null>(null);
  const [name, setName] = useState('');
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    let active = true;
    workspaceSettingsApi
      .get()
      .then(async (settings) => {
        if (!active) return;
        setSaved(settings);
        setName(settings.name);
        setLogoKey(settings.logoKey);
        if (settings.logoKey) {
          try {
            const signed = await uploadApi.workspaceLogoUrl(settings.logoKey);
            if (active) {
              setLogoUrl(signed.downloadUrl);
              setSavedLogoUrl(signed.downloadUrl);
            }
          } catch {
            // Signed URL error fallback
          }
        }
      })
      .catch(() => {
        if (active) toast.error(t('workspaceLoadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const selectLogo = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES) {
      toast.error(t('workspaceLogoInvalid'));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageError(false);
    setLogoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const discard = () => {
    if (!saved) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setName(saved.name);
    setLogoKey(saved.logoKey);
    setLogoUrl(savedLogoUrl);
    setLogoFile(null);
    setPreviewUrl(null);
    setImageError(false);
    setNameError('');
  };

  const removeLogo = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setLogoFile(null);
    setPreviewUrl(null);
    setLogoUrl(null);
    setLogoKey(null);
    setImageError(false);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 150) {
      setNameError(t('workspaceNameInvalid'));
      return;
    }

    setNameError('');
    setSaving(true);
    try {
      let nextLogoKey = logoKey;
      let nextLogoUrl = logoUrl;
      if (logoFile) {
        const presigned = await uploadApi.presignWorkspaceLogo(logoFile);
        await uploadApi.uploadDirect(presigned.uploadUrl, logoFile, presigned.headers);
        nextLogoKey = presigned.objectKey;
        const signed = await uploadApi.workspaceLogoUrl(nextLogoKey);
        nextLogoUrl = signed.downloadUrl;
      }

      const updated = await workspaceSettingsApi.update({
        name: trimmedName,
        logoKey: nextLogoKey,
      });
      setSaved(updated);
      setName(updated.name);
      setLogoKey(updated.logoKey);
      setLogoUrl(nextLogoUrl);
      setSavedLogoUrl(nextLogoUrl);
      setLogoFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setImageError(false);
      toast.success(t('workspaceSaved'));
    } catch {
      toast.error(t('workspaceSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const displayedLogo = previewUrl ?? logoUrl;
  const isDirty =
    saved !== null &&
    (name.trim() !== saved.name || logoFile !== null || logoKey !== (saved.logoKey ?? null));

  const copyTenantId = async () => {
    if (!saved?.tenantId) return;
    try {
      await navigator.clipboard.writeText(saved.tenantId);
      toast.success(t('workspaceIdCopied'));
    } catch {
      toast.error(t('workspaceIdCopyFailed'));
    }
  };

  if (loading) {
    return (
      <SettingsMatrixCard title={t('generalTitle')} description={t('generalDescription')}>
        <div className="space-y-6 p-5 sm:p-7">
          <div className="h-20 w-full animate-pulse rounded-xl bg-[var(--sc-bg-secondary)]" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-[var(--sc-bg-secondary)]" />
        </div>
      </SettingsMatrixCard>
    );
  }

  return (
    <div className="space-y-7">
      <SettingsMatrixCard title={t('generalTitle')} description={t('generalDescription')}>
        {/* Row 1: Logo Workspace */}
        <div className="flex min-h-[146px] flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
          <div className="flex items-center gap-5">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] shadow-[var(--sc-shadow-section)] transition-colors duration-150 sm:h-24 sm:w-24">
              {displayedLogo && !imageError ? (
                <img
                  src={displayedLogo}
                  alt={t('workspaceLogoAlt')}
                  className="h-full w-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
                  <Building2 size={36} strokeWidth={1.75} />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="m-0 text-sm font-semibold text-[var(--sc-text-primary)]">
                {t('workspaceLogo')}
              </p>
              <p className="m-0 text-xs text-[var(--sc-text-secondary)]">
                {t('workspaceLogoHint')}
              </p>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => selectLogo(event.target.files?.[0])}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || saving}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus size={15} />
              {t('changeWorkspaceLogo')}
            </Button>

            {(displayedLogo || logoKey) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={removeLogo}
                className="text-[var(--sc-error)] hover:bg-[var(--sc-error-bg)] hover:text-[var(--sc-error-dark)]"
              >
                <Trash2 size={15} />
                {t('removeWorkspaceLogo')}
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Tên Workspace */}
        <div className="border-t border-[var(--sc-border-default)] p-5 sm:px-7 sm:py-6">
          <Input
            label={t('workspaceName')}
            value={name}
            minLength={3}
            maxLength={150}
            required
            disabled={loading || saving}
            error={nameError}
            helperText={t('workspaceNameHint')}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError('');
            }}
          />

          {saved?.tenantId && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--sc-text-secondary)]">
                  {t('workspaceId')}:
                </span>
                <code className="rounded border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--sc-primary)]">
                  {saved.tenantId}
                </code>
              </div>
              <button
                type="button"
                onClick={() => void copyTenantId()}
                className="inline-flex items-center gap-1 font-medium text-[var(--sc-primary)] hover:underline"
              >
                <Copy size={13} />
                {t('copyWorkspaceId')}
              </button>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]/40 p-4 sm:px-7">
          <div>
            {isDirty ? (
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--sc-warning-dark)]">
                <span className="h-2 w-2 rounded-full bg-[var(--sc-warning)] animate-pulse" />
                {t('unsavedChanges')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--sc-text-tertiary)]">
                <CheckCircle2 size={15} className="text-[var(--sc-accent)]" />
                {t('workspaceSynced')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!isDirty || loading || saving}
              onClick={discard}
            >
              <Undo2 size={16} />
              {t('discard')}
            </Button>
            <Button
              type="button"
              size="sm"
              isLoading={saving}
              disabled={!isDirty || loading}
              onClick={save}
            >
              <Save size={16} />
              {t('saveWorkspaceProfile')}
            </Button>
          </div>
        </div>
      </SettingsMatrixCard>
    </div>
  );
}
