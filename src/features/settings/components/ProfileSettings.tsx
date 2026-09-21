import { useEffect, useRef, useState } from 'react';

import {
  Camera,
  CheckCircle2,
  ExternalLink,
  Key,
  LogOut,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import googleLogo from '@/assets/images/settings/google.svg';
import profileAvatar from '@/assets/images/settings/profile-avatar.png';
import { Avatar, Badge, Button, Card, Input, Select } from '@/components/Common';
import { staffAccountApi } from '@/features/tenants/api/staffAccountApi';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { uploadApi } from '@/services/uploadApi';
import { useAuthStore } from '@/stores';

interface SettingsSectionHeaderProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

function SettingsSectionHeader({ title, description, icon }: SettingsSectionHeaderProps) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 sm:p-6">
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)]">
          {icon}
        </div>
      )}
      <div>
        <h2 className="m-0 text-base font-semibold leading-6 text-[var(--sc-text-primary)]">
          {title}
        </h2>
        <p className="mb-0 mt-0.5 text-sm leading-5 text-[var(--sc-text-secondary)]">
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
    <div className="space-y-6">
      {/* SaaSable Banner Card */}
      <Card
        padding="none"
        className="overflow-hidden border border-[var(--sc-border-default)] shadow-[var(--sc-shadow-section)]"
      >
        <div className="h-28 w-full bg-gradient-to-r from-[var(--sc-primary-darker)] via-[var(--sc-primary)] to-[var(--sc-accent)]" />

        <div className="relative px-6 pb-6 pt-0 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="relative -mt-12 inline-block">
                <Avatar
                  src={photoSrc}
                  alt={fullNameInput || 'User'}
                  fallback={fullNameInput || 'User'}
                  size="xl"
                  className="h-24 w-24 rounded-2xl border-4 border-[var(--sc-bg-surface)] bg-[var(--sc-bg-surface)] shadow-md"
                />
                <button
                  type="button"
                  aria-label={t('changePhoto')}
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border-2 border-[var(--sc-bg-surface)] bg-[var(--sc-primary)] text-white shadow-sm transition-transform hover:scale-110 active:scale-95"
                >
                  <Camera size={15} aria-hidden="true" />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h1 className="m-0 text-xl font-bold leading-6 text-[var(--sc-text-primary)]">
                    {fullNameInput || displayName}
                  </h1>
                  <Badge status="success" label={roleCode} size="md" />
                </div>
                <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{email}</p>
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
                <Save size={15} className="mr-1.5" />
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
          icon={<User size={20} />}
        />

        <form onSubmit={handleSaveProfile} className="p-6 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <Input
                label="Họ và tên"
                value={fullNameInput}
                placeholder="Nguyễn Văn A"
                onChange={(e) => setFullNameInput(e.target.value)}
              />
              <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-tertiary)]">
                Tên hiển thị công khai trên toàn hệ thống SmartChain.
              </p>
            </div>

            <div>
              <Input
                label="Số điện thoại"
                value={phoneInput}
                placeholder="0901234567"
                onChange={(e) => setPhoneInput(e.target.value)}
              />
              <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-tertiary)]">
                Gồm 10 chữ số (bắt đầu bằng số 0) để nhận thông báo vận đơn.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium leading-5 text-[var(--sc-text-primary)]">
              {t('emailAddress')}
            </label>
            <div className="mt-1 flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="email"
                  disabled
                  value={email}
                  className="w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-3.5 py-2.5 text-sm text-[var(--sc-text-secondary)] opacity-80 cursor-not-allowed"
                />
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] px-3 py-2 text-xs font-semibold text-[var(--sc-success-dark)]">
                <CheckCircle2 size={16} />
                {t('verified')}
              </span>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end border-t border-[var(--sc-border-default)] pt-5">
            <Button
              type="submit"
              size="md"
              disabled={!isProfileChanged || isSavingProfile}
              isLoading={isSavingProfile}
              className="px-6"
            >
              <Save size={16} className="mr-2" />
              Lưu thông tin cá nhân
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
          title="Bảo mật & Quyền truy cập"
          description="Quản lý mật khẩu và phiên làm việc bảo mật"
          icon={<ShieldCheck size={20} />}
        />

        <div className="divide-y divide-[var(--sc-border-default)]">
          <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:px-7 sm:py-6">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                <Key size={16} />
              </div>
              <div>
                <p className="m-0 font-medium text-sm text-[var(--sc-text-primary)]">
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

          <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:px-7 sm:py-6">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                <LogOut size={16} />
              </div>
              <div>
                <p className="m-0 font-medium text-sm text-[var(--sc-text-primary)]">
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

          <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:px-7 sm:py-6 bg-[var(--sc-error-bg)]/30">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-error-bg)] text-[var(--sc-error)]">
                <Trash2 size={16} />
              </div>
              <div>
                <p className="m-0 font-medium text-sm text-[var(--sc-error-dark)]">
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

        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-alpha-08)]">
              <img src={googleLogo} alt="Google" className="h-7 w-7" />
            </span>
            <div>
              <p className="m-0 font-medium text-sm text-[var(--sc-text-primary)]">
                {t('googleLogin')}
              </p>
              <p className="mb-0 mt-1 flex flex-wrap items-center gap-1 text-xs text-[var(--sc-text-secondary)]">
                {t('connectedTo')}
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1 font-semibold text-[var(--sc-primary)] hover:underline"
                >
                  {email}
                  <ExternalLink size={12} aria-hidden="true" />
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
        <SettingsSectionHeader
          title="Tùy chọn hiển thị"
          description="Tùy chỉnh ngôn ngữ và múi giờ hiển thị dữ liệu"
        />

        <div className="grid gap-6 p-6 sm:grid-cols-2">
          <div>
            <Select
              label={t('language')}
              defaultValue="vi"
              options={[
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'English' },
              ]}
            />
            <p className="mb-0 mt-2 text-xs text-[var(--sc-text-tertiary)]">
              {t('preferredLanguageHint')}
            </p>
          </div>

          <div>
            <Select
              label={t('timezone')}
              defaultValue="asia-ho-chi-minh"
              options={[
                { value: 'asia-ho-chi-minh', label: '(GMT+07:00) Ho Chi Minh City' },
                { value: 'asia-bangkok', label: '(GMT+07:00) Bangkok' },
                { value: 'asia-singapore', label: '(GMT+08:00) Singapore' },
              ]}
            />
            <p className="mb-0 mt-2 text-xs text-[var(--sc-text-tertiary)]">{t('timezoneHint')}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
