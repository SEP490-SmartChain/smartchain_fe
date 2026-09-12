import { Construction } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function UnderConstruction() {
  const t = useTranslations('Common');
  return (
    <section className="sc-surface flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
        <Construction size={25} strokeWidth={1.7} />
      </span>
      <h2 className="m-0 text-lg font-medium text-[var(--sc-text-primary)]">
        {t('under_construction')}
      </h2>
      <p className="mb-0 mt-2 max-w-md text-sm leading-6 text-[var(--sc-text-secondary)]">
        {t('under_construction_description')}
      </p>
    </section>
  );
}
