import { useEffect, useRef, useState } from 'react';

import {
  Camera,
  CheckCircle2,
  ExternalLink,
  Key,
  LogOut,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import googleLogo from '@/assets/images/settings/google.svg';
import profileAvatar from '@/assets/images/settings/profile-avatar.png';
import { Avatar, Button, Card, Input, Select } from '@/components/Common';
import { staffAccountApi } from '@/features/tenants/api/staffAccountApi';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { cn } from '@/lib/utils';
import { uploadApi } from '@/services/uploadApi';
import { useAuthStore } from '@/stores';

interface SettingsSectionHeaderProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
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

export default function ProfileSettings() {
  const t = useTranslations('Settings');
  const user = useAuthStore((state) => state.user);
  const email = user?.email || 'admin@smartchain.vn';
  const roleCode = user?.roles[0] || 'TENANT_ADMIN';
  const displayName = user?.fullName?.trim() || 'SmartChain Admin';
  const persistedPhotoSrc = useAvatarUrl(user?.avatarUrl);

  const roleConfig: Record<
    string,
    { label: string; icon: typeof ShieldCheck; colorClass: string }
  > = {
    TENANT_ADMIN: {
      label: t('roleTenantAdmin'),
      icon: ShieldCheck,
      colorClass:
        'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300',
    },
    SUPER_ADMIN: {
      label: t('roleSuperAdmin'),
      icon: Shield,
      colorClass:
        'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:border-purple-400/30 dark:bg-purple-400/15 dark:text-purple-300',
    },
    DISPATCHER: {
      label: t('roleDispatcher'),
      icon: ShieldCheck,
      colorClass:
        'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-300',
    },
    ACCOUNTANT: {
      label: t('roleAccountant'),
      icon: ShieldCheck,
      colorClass:
        'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300',
    },
  };

  const currentRole = roleConfig[roleCode] || {
    label: roleCode,
    icon: ShieldCheck,
    colorClass:
      'border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]',
  };
  const RoleIcon = currentRole.icon;

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoSrc, setPhotoSrc] = useState(profileAvatar);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Form input state
  const [fullNameInput, setFullNameInput] = useState(user?.fullName || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync state when user prop updates
  useEffect(() => {
    if (user) {
      setFullNameInput(user.fullName || '');
      setPhoneInput(user.phone || '');
      if (!photoChanged) {
        setPhotoSrc(persistedPhotoSrc || profileAvatar);
      }
    }
  }, [user, photoChanged, persistedPhotoSrc]);

  const notifyAction = (action: string) => toast.success(t('actionReady', { action }));

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
    if (!selectedPhotoFile) return;
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

      await staffAccountApi.updateProfile('me', { avatarUrl: presigned.objectKey });
      if (user) {
        useAuthStore.getState().setUser({ ...user, avatarUrl: presigned.objectKey });
      }

      setPhotoSrc(downloadUrl);
      setPhotoChanged(false);
      setSelectedPhotoFile(null);
      toast.success(t('photoSaved'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tải ảnh lên thất bại';
      toast.error(message);
    } finally {
      setIsUploadingPhoto(false);
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
      {/* SaaSable Banner Card */}
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <div className="h-16 w-full bg-gradient-to-r from-[var(--sc-primary-darker)] via-[var(--sc-primary)] to-[var(--sc-accent)] sm:h-20" />

        <div className="relative px-4 pb-3 pt-0 sm:px-6 sm:pb-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <div className="relative -mt-8 inline-block sm:-mt-10">
                <Avatar
                  src={photoSrc}
                  alt={fullNameInput || 'User'}
                  fallback={fullNameInput || 'User'}
                  size="xl"
                  className="h-18 w-18 rounded-2xl border-4 border-[var(--sc-bg-surface)] bg-[var(--sc-bg-surface)] shadow-md sm:h-20 sm:w-20"
                />
                <button
                  type="button"
                  aria-label={t('changePhoto')}
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-2 border-[var(--sc-bg-surface)] bg-[var(--sc-primary)] text-white shadow-sm transition-transform hover:scale-110 active:scale-95 sm:h-7 sm:w-7"
                >
                  <Camera size={13} aria-hidden="true" />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="m-0 text-base font-bold leading-5 text-[var(--sc-text-primary)] sm:text-lg sm:leading-6">
                    {fullNameInput || displayName}
                  </h1>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-xs transition-colors',
                      currentRole.colorClass,
                    )}
                  >
                    <RoleIcon size={12} className="shrink-0" aria-hidden="true" />
                    <span>{currentRole.label}</span>
                  </span>
                </div>
                <p className="m-0 text-xs text-[var(--sc-text-secondary)]">{email}</p>
              </div>
            </div>

            {photoChanged && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                isLoading={isUploadingPhoto}
                onClick={savePhoto}
                className="self-start sm:self-auto"
              >
                <Save size={14} className="mr-1.5" />
                {t('savePhoto')}
              </Button>
            )}
          </div>
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
              onClick={() => notifyAction(t('changePassword'))}
            >
              {t('changePassword')}
            </Button>
          </div>

          <div className="flex flex-col justify-between gap-2.5 p-2.5 sm:flex-row sm:items-center sm:px-6 sm:py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)] sm:h-8 sm:w-8">
                <LogOut size={14} />
              </div>
              <div>
                <p className="m-0 text-sm font-medium text-[var(--sc-text-primary)]">
                  {t('logout')}
                </p>
                <p className="m-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('logoutDescription')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => notifyAction(t('logout'))}
            >
              {t('logout')}
            </Button>
          </div>

          <div className="flex flex-col justify-between gap-2.5 bg-[var(--sc-error-bg)]/25 p-2.5 sm:flex-row sm:items-center sm:px-6 sm:py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-error-bg)] text-[var(--sc-error)] sm:h-8 sm:w-8">
                <Trash2 size={14} />
              </div>
              <div>
                <p className="m-0 text-sm font-medium text-[var(--sc-error-dark)]">
                  {t('deleteAccount')}
                </p>
                <p className="m-0 mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                  {t('deleteAccountDescription')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => notifyAction(t('deleteAccount'))}
            >
              {t('deleteAccount')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Connected Accounts */}
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <SettingsSectionHeader
          title={t('loginService')}
          description={t('loginServiceDescription')}
        />

        <div className="flex flex-col gap-2.5 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)]">
              <img src={googleLogo} alt="Google" className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div>
              <p className="m-0 text-sm font-medium text-[var(--sc-text-primary)]">
                {t('googleLogin')}
              </p>
              <p className="mb-0 mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--sc-text-secondary)]">
                {t('connectedTo')}
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1 font-semibold text-[var(--sc-primary)] hover:underline"
                >
                  {email}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-end text-[var(--sc-primary)] hover:bg-[var(--sc-primary-alpha-08)] sm:self-auto"
            onClick={() => notifyAction(t('disconnect'))}
          >
            {t('disconnect')}
          </Button>
        </div>
      </Card>

      {/* Preferences (Language & Timezone) */}
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <SettingsSectionHeader title={t('preferences')} description={t('preferencesDescription')} />

        <div className="grid gap-2.5 p-2.5 sm:grid-cols-2 sm:gap-3.5 sm:p-4 sm:px-6">
          <Select
            label={t('language')}
            defaultValue="vi"
            options={[
              { value: 'vi', label: 'Tiếng Việt' },
              { value: 'en', label: 'English' },
            ]}
            helperText={t('preferredLanguageHint')}
          />

          <Select
            label={t('timezone')}
            defaultValue="asia-ho-chi-minh"
            options={[
              { value: 'asia-ho-chi-minh', label: '(GMT+07:00) Ho Chi Minh City' },
              { value: 'asia-bangkok', label: '(GMT+07:00) Bangkok' },
              { value: 'asia-singapore', label: '(GMT+08:00) Singapore' },
            ]}
            helperText={t('timezoneHint')}
          />
        </div>
      </Card>
    </div>
  );
}
