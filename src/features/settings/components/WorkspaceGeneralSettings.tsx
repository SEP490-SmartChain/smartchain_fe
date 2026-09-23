import { useEffect, useRef, useState } from 'react';

import { Building2, ImagePlus, Save, Trash2, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button, Card, CardHeader, Input } from '@/components/Common';
import { uploadApi } from '@/services/uploadApi';

import { workspaceSettingsApi, type WorkspaceSettings } from '../api/workspaceSettingsApi';

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
          const signed = await uploadApi.workspaceLogoUrl(settings.logoKey);
          if (active) {
            setLogoUrl(signed.downloadUrl);
            setSavedLogoUrl(signed.downloadUrl);
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
    setNameError('');
  };

  const removeLogo = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setLogoFile(null);
    setPreviewUrl(null);
    setLogoUrl(null);
    setLogoKey(null);
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
      toast.success(t('workspaceSaved'));
    } catch {
      toast.error(t('workspaceSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const displayedLogo = previewUrl ?? logoUrl;

  return (
    <Card>
      <CardHeader title={t('generalTitle')} description={t('generalDescription')} />
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--sc-text-primary)]">
            {t('workspaceLogo')}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)]">
              {displayedLogo ? (
                <img
                  src={displayedLogo}
                  alt={t('workspaceLogoAlt')}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 size={34} className="text-[var(--sc-text-tertiary)]" />
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => selectLogo(event.target.files?.[0])}
              />
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
              {displayedLogo && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={removeLogo}
                >
                  <Trash2 size={15} />
                  {t('removeWorkspaceLogo')}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--sc-text-secondary)]">{t('workspaceLogoHint')}</p>
        </div>

        <Input
          label={t('workspaceName')}
          value={name}
          minLength={3}
          maxLength={150}
          required
          disabled={loading || saving}
          error={nameError}
          helperText={t('workspaceNameHint')}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="mt-8 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-6">
        <Button type="button" variant="outline" disabled={loading || saving} onClick={discard}>
          <Undo2 size={16} />
          {t('discard')}
        </Button>
        <Button type="button" isLoading={saving} disabled={loading} onClick={save}>
          <Save size={16} />
          {t('saveWorkspaceProfile')}
        </Button>
      </div>
    </Card>
  );
}
