import { useEffect, useRef, useState } from 'react';

import { Camera, CheckCircle2, Key, Save, Shield, ShieldCheck, Trash2, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Avatar, Button, Card, Input, Select } from '@/components/Common';
import { usePasswordResetRequest } from '@/features/auth';
import { staffAccountApi } from '@/features/tenants/api/staffAccountApi';
import { useAccess } from '@/hooks/useAccess';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import type { OrcaRole } from '@/lib/accessPolicy';
import { cn } from '@/lib/utils';
import { uploadApi, UploadStorageConnectionError } from '@/services/uploadApi';
import { useAuthStore, useLocaleStore } from '@/stores';

interface SettingsSectionHeaderProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

interface ProfileSettingsProps {
  children?: React.ReactNode;
}

function SettingsSectionHeader({ title, description, icon }: SettingsSectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-4 py-2 sm:px-6 sm:py-2.5">
      {icon && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)] sm:h-8 sm:w-8">
          {icon}
        </div>
      )}
      <div>
        <h2 className="m-0 text-sm font-semibold leading-5 text-[var(--sc-text-primary)] sm:text-base sm:leading-6">
          {title}
        </h2>
        <p className="mb-0 mt-0.5 text-xs text-[var(--sc-text-secondary)] sm:text-sm">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function ProfileSettings({ children }: ProfileSettingsProps) {
  const t = useTranslations('Settings');
  const user = useAuthStore((state) => state.user);
  const email = user?.email || '';
  const displayName = user?.fullName?.trim() || email;
  const persistedPhotoSrc = useAvatarUrl(user?.avatarUrl);
  const { roles } = useAccess();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const { requestReset } = usePasswordResetRequest();

  const roleConfig: Record<
    OrcaRole,
    { label: string; icon: typeof ShieldCheck; colorClass: string }
  > = {
    ORCA_ADMIN: {
      label: t('roleOrcaAdmin'),
      icon: Shield,
      colorClass:
        'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:border-purple-400/30 dark:bg-purple-400/15 dark:text-purple-300',
    },
    OPS_DISPATCHER: {
      label: t('roleOpsDispatcher'),
      icon: ShieldCheck,
      colorClass:
        'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-300',
    },
    WAREHOUSE_MANAGER: {
      label: t('roleWarehouseManager'),
      icon: ShieldCheck,
      colorClass:
        'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300',
    },
    WAREHOUSE_STAFF: {
      label: t('roleWarehouseStaff'),
      icon: ShieldCheck,
      colorClass:
        'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-300',
    },
    ORCA_ACCOUNTANT: {
      label: t('roleOrcaAccountant'),
      icon: ShieldCheck,
      colorClass:
        'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300',
    },
    SELLER_OWNER: {
      label: t('roleSellerOwner'),
      icon: ShieldCheck,
      colorClass:
        'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300',
    },
    SELLER_STAFF: {
      label: t('roleSellerStaff'),
      icon: ShieldCheck,
      colorClass:
        'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-300',
    },
  };

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoSrc, setPhotoSrc] = useState<string | undefined>(persistedPhotoSrc);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  const [isRequestingPasswordReset, setIsRequestingPasswordReset] = useState(false);

  // Form input state
  const [fullNameInput, setFullNameInput] = useState(user?.fullName || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync state when the signed-in account changes.
  useEffect(() => {
    setFullNameInput(user?.fullName || '');
    setPhoneInput(user?.phone || '');
    if (!photoChanged) {
      setPhotoSrc(persistedPhotoSrc);
    }
  }, [user, photoChanged, persistedPhotoSrc]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Kích thước ảnh tối đa là 5MB');
      return;
    }

    setSelectedPhotoFile(file);
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        setPhotoSrc(reader.result);
        setPhotoChanged(true);
      }
    });
    reader.readAsDataURL(file);
  };

  const savePhoto = async () => {
    if (!selectedPhotoFile || isUploadingPhoto || isRemovingPhoto) return;
    const revision = useAuthStore.getState().revision;
    setIsUploadingPhoto(true);

    try {
      const presigned = await uploadApi.presign({
        purpose: 'AVATAR',
        fileName: selectedPhotoFile.name,
        contentType: selectedPhotoFile.type,
        fileSizeBytes: selectedPhotoFile.size,
      });

      await uploadApi.uploadDirect(presigned.uploadUrl, selectedPhotoFile, presigned.headers);
      const { downloadUrl } = await uploadApi.avatarDownloadUrl(presigned.objectKey);

      if (useAuthStore.getState().revision !== revision) return;
      const updatedUser = await staffAccountApi.updateProfile('me', {
        avatarUrl: presigned.objectKey,
      });
      const current = useAuthStore.getState();
      if (current.revision !== revision || !current.user) return;
      current.setUser({
        ...current.user,
        avatarUrl: updatedUser.avatarUrl ?? presigned.objectKey,
      });

      setPhotoSrc(downloadUrl);
      setPhotoChanged(false);
      setSelectedPhotoFile(null);
      toast.success(t('photoSaved'));
    } catch (err: unknown) {
      const message =
        err instanceof UploadStorageConnectionError
          ? t('uploadStorageFailed')
          : err instanceof Error
            ? err.message
            : t('photoSaveFailed');
      toast.error(message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removePhoto = async () => {
    if (!photoSrc || isRemovingPhoto) return;

    setIsRemovingPhoto(true);
    try {
      if (user?.avatarUrl) {
        const updatedUser = await staffAccountApi.updateProfile('me', { avatarUrl: null });
        useAuthStore.getState().setUser({
          ...user,
          avatarUrl: updatedUser.avatarUrl ?? null,
        });
      }

      setPhotoSrc(undefined);
      setSelectedPhotoFile(null);
      setPhotoChanged(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
      toast.success(t('photoRemoved'));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('photoRemoveFailed'));
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    if (!email || isRequestingPasswordReset) return;

    setIsRequestingPasswordReset(true);
    try {
      if (await requestReset(email)) {
        toast.success(t('passwordResetSent', { email }));
      }
    } finally {
      setIsRequestingPasswordReset(false);
    }
  };

  const isProfileChanged =
    fullNameInput.trim() !== (user?.fullName || '').trim() ||
    phoneInput.trim() !== (user?.phone || '').trim();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedFullName = fullNameInput.trim();
    if (trimmedFullName.length < 2) {
      toast.error('Họ và tên phải có tối thiểu 2 ký tự');
      return;
    }

    const trimmedPhone = phoneInput.trim();
    if (trimmedPhone && !/^0[0-9]{9}$/.test(trimmedPhone)) {
      toast.error('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0 (VD: 0901234567)');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updatedUser = await staffAccountApi.updateProfile('me', {
        fullName: trimmedFullName,
        phone: trimmedPhone || null,
      });

      if (user) {
        useAuthStore.getState().setUser({
          ...user,
          fullName: updatedUser.fullName || user.fullName,
          phone: updatedUser.phone ?? null,
        });
      }

      toast.success('Cập nhật thông tin cá nhân thành công');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cập nhật thông tin thất bại';
      toast.error(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="space-y-2 sm:space-y-2.5">
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
            <div className="group relative shrink-0">
              <Avatar
                src={photoSrc}
                alt={displayName || email}
                fallback={fullNameInput.trim() || displayName || email}
                size="xl"
                className="h-18 w-18 rounded-2xl border-2 border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-sm sm:h-20 sm:w-20"
              />
              <button
                type="button"
                aria-label={t('changePhoto')}
                title={t('changePhoto')}
                disabled={isUploadingPhoto || isRemovingPhoto}
                onClick={() => photoInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-2 border-[var(--sc-bg-surface)] bg-[var(--sc-primary)] text-white shadow-sm transition-transform hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-7 sm:w-7"
              >
                <Camera size={13} aria-hidden="true" />
              </button>
              {photoSrc && (
                <button
                  type="button"
                  aria-label={t('removePhoto')}
                  title={t('removePhoto')}
                  disabled={isUploadingPhoto || isRemovingPhoto}
                  onClick={() => void removePhoto()}
                  className="absolute -right-1 -top-1 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--sc-bg-surface)] bg-[var(--sc-error)] text-white opacity-100 shadow-sm transition-opacity hover:bg-[var(--sc-error-dark)] group-focus-within:opacity-100 disabled:cursor-not-allowed sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handlePhotoChange}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="m-0 max-w-full break-words text-lg font-bold leading-6 text-[var(--sc-text-primary)] sm:text-xl sm:leading-7">
                  {displayName}
                </h1>
                {/* Hiển thị TOÀN BỘ role ORCA hiệu lực (contract §8); phiên
                    thiếu actorScope/role lạ ⇒ không badge, không nhãn legacy. */}
                {roles.map((roleCode) => {
                  const config = roleConfig[roleCode];
                  const RoleIcon = config.icon;
                  return (
                    <span
                      key={roleCode}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-xs transition-colors',
                        config.colorClass,
                      )}
                    >
                      <RoleIcon size={12} className="shrink-0" aria-hidden="true" />
                      <span>{config.label}</span>
                    </span>
                  );
                })}
              </div>
              <p className="m-0 break-words text-sm leading-5 text-[var(--sc-text-secondary)]">
                {email}
              </p>
            </div>
          </div>

          {photoChanged && (
            <Button
              type="button"
              size="sm"
              variant="primary"
              isLoading={isUploadingPhoto}
              onClick={savePhoto}
              className="self-start sm:self-center"
            >
              <Save size={14} className="mr-1.5" />
              {t('savePhoto')}
            </Button>
          )}
        </div>
      </Card>

      {/* Main Profile Details Form */}
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <SettingsSectionHeader
          title={t('details')}
          description={t('detailsDescription')}
          icon={<User size={16} />}
        />

        <form onSubmit={handleSaveProfile} className="p-3.5 sm:p-4 sm:px-6">
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3.5">
            <Input
              label={t('fullName')}
              value={fullNameInput}
              placeholder="Nguyễn Văn A"
              onChange={(e) => setFullNameInput(e.target.value)}
              helperText={t('fullNameHint')}
            />

            <Input
              label={t('phone')}
              value={phoneInput}
              placeholder="0901234567"
              onChange={(e) => setPhoneInput(e.target.value)}
              helperText={t('phoneHint')}
            />
          </div>

          <div className="mt-2.5 sm:mt-3">
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              {t('emailAddress')}
            </label>
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <input
                  type="email"
                  disabled
                  value={email}
                  className="h-[42px] w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-3 py-2 text-sm leading-[18px] text-[var(--sc-text-secondary)] opacity-90 cursor-not-allowed outline-none shadow-[var(--sc-shadow-button)]"
                />
              </div>
              <span className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-lg border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] px-3 text-xs font-semibold text-[var(--sc-success-dark)]">
                <CheckCircle2 size={15} />
                {t('verified')}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end border-t border-[var(--sc-border-default)] pt-2.5 sm:mt-3.5 sm:pt-3">
            <Button
              type="submit"
              size="md"
              disabled={!isProfileChanged || isSavingProfile}
              isLoading={isSavingProfile}
              className="px-5"
            >
              <Save size={15} className="mr-1.5" />
              {t('saveProfile')}
            </Button>
          </div>
        </form>
      </Card>

      {children}

      {/* Security & Authentication */}
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <SettingsSectionHeader
          title={t('security')}
          description={t('securityDescription')}
          icon={<ShieldCheck size={16} />}
        />

        <div className="divide-y divide-[var(--sc-border-default)]">
          <div className="flex flex-col justify-between gap-2.5 p-2.5 sm:flex-row sm:items-center sm:px-6 sm:py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] sm:h-8 sm:w-8">
                <Key size={14} />
              </div>
              <div>
                <p className="m-0 text-sm font-medium text-[var(--sc-text-primary)]">
                  {t('changePassword')}
                </p>
                <p className="m-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('passwordDescription')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              isLoading={isRequestingPasswordReset}
              disabled={!email || isRequestingPasswordReset}
              onClick={() => void handlePasswordResetRequest()}
            >
              {t('sendPasswordReset')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Display preferences */}
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <SettingsSectionHeader title={t('preferences')} description={t('preferencesDescription')} />

        <div className="p-2.5 sm:p-4 sm:px-6">
          <Select
            label={t('language')}
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            options={[
              { value: 'vi', label: t('languageVietnamese') },
              { value: 'en', label: t('languageEnglish') },
            ]}
            helperText={t('preferredLanguageHint')}
          />
        </div>
      </Card>
    </div>
  );
}
