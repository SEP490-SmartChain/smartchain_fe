import { useEffect, useRef, useState } from 'react';

import { Camera, Mail, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button, Checkbox, Input, Radio } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

export interface AddStaffAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DraftAccountStatus = 'ACTIVE' | 'PENDING' | 'REPORTED' | 'BLOCKED';

const ROLE_OPTIONS = [
  'Super Admin',
  'Admin',
  'Billing Admin',
  'Product Designer',
  'Developer',
  'Tester',
  'Project Manager',
  'Scrum Master',
  'Auditor',
  'Guest',
  'Marketing',
] as const;

export function AddStaffAccountModal({ isOpen, onClose }: AddStaffAccountModalProps) {
  const t = useTranslations('StaffAccounts');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<DraftAccountStatus>('PENDING');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      setPhotoPreview(null);
      setStatus('PENDING');
      setSelectedRoles(new Set());
    }
  }, [isOpen]);

  const toggleRole = (role: string) => {
    setSelectedRoles((current) => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setPhotoPreview(reader.result);
    });
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast.info(t('createUnavailable'));
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('addNewUser')} width="720px">
      <form className="-m-5 sm:-m-6" noValidate onSubmit={handleSubmit}>
        <div className="p-5 sm:p-6">
          <p className="mb-6 mt-0 text-sm leading-5 text-[var(--sc-text-secondary)]">
            {t('addUserDescription')}
          </p>

          <h4 className="mb-4 mt-0 text-base font-medium text-[var(--sc-text-primary)]">
            {t('personalDetail')}
          </h4>

          <div className="mb-6">
            <button
              type="button"
              aria-label={t('uploadPhoto')}
              className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-[var(--sc-primary-light)] bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary)] outline-none transition-[border-color,background-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[var(--sc-primary)] hover:bg-[var(--sc-primary-lighter)] focus-visible:shadow-[var(--sc-shadow-focus)] active:translate-y-0"
              onClick={() => photoInputRef.current?.click()}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt={t('profilePhoto')}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Camera aria-hidden="true" size={30} strokeWidth={1.7} />
              )}
              {photoPreview && (
                <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--sc-bg-surface)] bg-[var(--sc-primary)] text-white shadow-[var(--sc-shadow-button)]">
                  <Camera aria-hidden="true" size={13} />
                </span>
              )}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t('uploadPhoto')}
              onChange={handlePhotoChange}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="firstName"
              label={t('firstName')}
              placeholder={t('firstNamePlaceholder')}
              required
            />
            <Input
              name="lastName"
              label={t('lastName')}
              placeholder={t('lastNamePlaceholder')}
              required
            />
            <Input
              name="username"
              label={t('username')}
              placeholder={t('usernamePlaceholder')}
              required
            />
            <Input
              name="email"
              type="email"
              label={t('workEmail')}
              placeholder={t('emailPlaceholder')}
              leftIcon={<Mail aria-hidden="true" size={16} />}
              required
            />
            <Input
              name="contactNumber"
              type="tel"
              label={t('contactNumber')}
              placeholder={t('contactNumberPlaceholder')}
              leftIcon={<Phone aria-hidden="true" size={16} />}
              required
            />
            <Input name="joiningDate" type="date" label={t('joiningDate')} required />

            <div className="sm:col-span-2">
              <label
                htmlFor="staff-address"
                className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
              >
                {t('address')}
                <span className="ml-1 text-[var(--sc-error)]">*</span>
              </label>
              <textarea
                id="staff-address"
                name="address"
                rows={4}
                required
                placeholder={t('addressPlaceholder')}
                className="w-full resize-y rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2.5 text-sm text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[var(--sc-text-tertiary)] hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]"
              />
            </div>
          </div>

          <fieldset className="mt-5 border-0 p-0">
            <legend className="mb-3 text-sm font-medium text-[var(--sc-text-primary)]">
              {t('status')}
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {(
                [
                  ['ACTIVE', t('active')],
                  ['PENDING', t('pending')],
                  ['REPORTED', t('reported')],
                  ['BLOCKED', t('blocked')],
                ] as const
              ).map(([value, label]) => (
                <Radio
                  key={value}
                  name="status"
                  value={value}
                  label={label}
                  checked={status === value}
                  onChange={() => setStatus(value)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5 border-0 p-0">
            <legend className="mb-3 text-sm font-medium text-[var(--sc-text-primary)]">
              {t('rolesOptional')}
            </legend>
            <div className="grid gap-x-5 gap-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4 sm:grid-cols-2">
              {ROLE_OPTIONS.map((role) => (
                <Checkbox
                  key={role}
                  name="roles"
                  value={role}
                  label={role}
                  checked={selectedRoles.has(role)}
                  onChange={() => toggleRole(role)}
                />
              ))}
            </div>
          </fieldset>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] px-5 py-4 sm:px-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit">{t('createUser')}</Button>
        </div>
      </form>
    </Modal>
  );
}
