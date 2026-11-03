import { useTranslations } from 'next-intl';

export function RequiredNote() {
  const t = useTranslations('Common');
  return (
    <p className="text-xs text-[var(--sc-text-secondary)]">
      <span aria-hidden="true" className="mr-1 text-[var(--sc-error)]">
        *
      </span>
      {t('requiredNote')}
    </p>
  );
}
