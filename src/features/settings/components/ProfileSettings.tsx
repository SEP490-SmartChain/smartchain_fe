import { useEffect, useRef, useState } from 'react';

import { Camera, CheckCircle2, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import googleLogo from '@/assets/images/settings/google.svg';
import profileAvatar from '@/assets/images/settings/profile-avatar.png';
import { Avatar, Button, Card, Input, Select } from '@/components/Common';
import { staffAccountApi } from '@/features/tenants/api/staffAccountApi';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { uploadApi } from '@/services/uploadApi';
import { useAuthStore } from '@/stores';

interface SettingsMatrixCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

interface ProfileActionRowProps {
  label: string;
  value: string;
  action: string;
  status?: React.ReactNode;
  tone?: 'default' | 'danger';
  onAction: () => void;
}

function SettingsMatrixCard({ title, description, children }: SettingsMatrixCardProps) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
        <header className="border-b border-[var(--sc-border-default)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <h2 className="m-0 text-base font-medium leading-5 text-[var(--sc-text-primary)]">
            {title}
          </h2>
          <p className="mb-0 mt-1 text-sm leading-5 text-[var(--sc-text-secondary)]">
            {description}
          </p>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </Card>
  );
}

function ProfileActionRow({
  label,
  value,
  action,
  status,
  tone = 'default',
  onAction,
}: ProfileActionRowProps) {
  return (
    <div className="flex min-h-[108px] flex-col justify-center gap-4 border-t border-[var(--sc-border-default)] p-5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
      <div className="min-w-0">
        <p className="m-0 text-sm leading-[18px] text-[var(--sc-text-secondary)]">{label}</p>
        <p className="mb-0 mt-1 text-base leading-5 text-[var(--sc-text-primary)]">{value}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4 self-end sm:self-auto">
        {status}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onAction}
          className={
            tone === 'danger'
              ? 'text-[var(--sc-error)] hover:bg-[var(--sc-error-bg)] hover:text-[var(--sc-error-dark)]'
              : 'text-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)]'
          }
        >
          {action}
        </Button>
      </div>
    </div>
  );
}

export default function ProfileSettings() {
  const t = useTranslations('Settings');
  const user = useAuthStore((state) => state.user);
  const email = user?.email || 'admin@smartchain.vn';
  const persistedPhotoSrc = useAvatarUrl(user?.avatarUrl);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoSrc, setPhotoSrc] = useState(profileAvatar);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Profile details state (fullName and phone)
  const [fullNameInput, setFullNameInput] = useState(user?.fullName || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync state when user profile changes
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
    <div className="space-y-7">
      <SettingsMatrixCard title={t('details')} description={t('detailsDescription')}>
        {/* Avatar Upload Area */}
        <div className="flex min-h-[146px] items-center justify-between gap-5 p-5 sm:px-7 sm:py-6">
          <div className="relative">
            <Avatar
              src={photoSrc}
              alt={fullNameInput || 'User'}
              fallback={fullNameInput || 'User'}
              size="xl"
              className="h-[84px] w-[84px] rounded-full border-4 border-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-section)]"
            />
            <button
              type="button"
              aria-label={t('changePhoto')}
              onClick={() => photoInputRef.current?.click()}
              className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--sc-bg-surface)] bg-[var(--sc-secondary-dark)] text-white shadow-[var(--sc-shadow-button)] transition-[background-color,transform] duration-150 hover:scale-105 hover:bg-[var(--sc-primary)] active:scale-95"
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!photoChanged || isUploadingPhoto}
            isLoading={isUploadingPhoto}
            onClick={savePhoto}
          >
            {t('savePhoto')}
          </Button>
        </div>

        {/* Form Thông tin cá nhân */}
        <form
          onSubmit={handleSaveProfile}
          className="border-t border-[var(--sc-border-default)] p-5 sm:px-7 sm:py-6"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Họ và tên"
              value={fullNameInput}
              placeholder="Nguyễn Văn A"
              onChange={(e) => setFullNameInput(e.target.value)}
            />
            <Input
              label="Số điện thoại"
              value={phoneInput}
              placeholder="0901234567"
              onChange={(e) => setPhoneInput(e.target.value)}
            />
          </div>
          <p className="mb-0 mt-2 text-xs leading-4 text-[var(--sc-text-secondary)]">
            Số điện thoại gồm 10 chữ số (bắt đầu bằng số 0) để nhận thông báo hoặc xác thực.
          </p>
          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              size="md"
              disabled={!isProfileChanged || isSavingProfile}
              isLoading={isSavingProfile}
            >
              Lưu thông tin cá nhân
            </Button>
          </div>
        </form>

        {/* Readonly Account rows */}
        <ProfileActionRow
          label={t('emailAddress')}
          value={email}
          action={t('update')}
          status={
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sc-success-dark)]">
              <CheckCircle2
                size={19}
                className="fill-[var(--sc-success-bg)] text-[var(--sc-success)]"
              />
              {t('verified')}
            </span>
          }
          onAction={() => notifyAction(t('update'))}
        />
        <ProfileActionRow
          label={t('changePassword')}
          value={t('passwordDescription')}
          action={t('changePassword')}
          onAction={() => notifyAction(t('changePassword'))}
        />
        <ProfileActionRow
          label={t('logout')}
          value={t('logoutDescription')}
          action={t('logout')}
          onAction={() => notifyAction(t('logout'))}
        />
        <ProfileActionRow
          label={t('deleteAccount')}
          value={t('deleteAccountDescription')}
          action={t('deleteAccount')}
          tone="danger"
          onAction={() => notifyAction(t('deleteAccount'))}
        />
      </SettingsMatrixCard>

      <SettingsMatrixCard title={t('loginService')} description={t('loginServiceDescription')}>
        <div className="flex min-h-[126px] flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-alpha-08)]">
              <img src={googleLogo} alt="Google" className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-sm leading-[18px] text-[var(--sc-text-secondary)]">
                {t('googleLogin')}
              </p>
              <p className="mb-0 mt-1 flex flex-wrap items-center gap-1 text-sm text-[var(--sc-text-primary)]">
                {t('connectedTo')}
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1 font-medium text-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)]"
                >
                  {email}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-end text-[var(--sc-primary)] sm:self-auto"
            onClick={() => notifyAction(t('disconnect'))}
          >
            {t('disconnect')}
          </Button>
        </div>
      </SettingsMatrixCard>

      <SettingsMatrixCard
        title={t('preferredLanguage')}
        description={t('preferredLanguageDescription')}
      >
        <div className="p-5 sm:px-7 sm:py-6">
          <Select
            label={t('language')}
            defaultValue="vi"
            options={[
              { value: 'vi', label: 'Tiếng Việt' },
              { value: 'en', label: 'English' },
            ]}
          />
          <p className="mb-0 mt-3 text-xs leading-4 text-[var(--sc-text-secondary)]">
            {t('preferredLanguageHint')}
          </p>
        </div>
      </SettingsMatrixCard>

      <SettingsMatrixCard title={t('timezoneTitle')} description={t('timezoneDescription')}>
        <div className="p-5 sm:px-7 sm:py-6">
          <Select
            label={t('timezone')}
            defaultValue="asia-ho-chi-minh"
            options={[
              { value: 'asia-ho-chi-minh', label: '(GMT+07:00) Ho Chi Minh City' },
              { value: 'asia-bangkok', label: '(GMT+07:00) Bangkok' },
              { value: 'asia-singapore', label: '(GMT+08:00) Singapore' },
            ]}
          />
          <p className="mb-0 mt-3 text-xs leading-4 text-[var(--sc-text-secondary)]">
            {t('timezoneHint')}
          </p>
        </div>
      </SettingsMatrixCard>
    </div>
  );
}
