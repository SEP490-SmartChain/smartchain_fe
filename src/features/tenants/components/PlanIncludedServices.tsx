import { useLocale, useTranslations } from 'next-intl';

import type { PlanServiceLabels } from '../api/commercialApi';

export function planServiceLabel(option: PlanServiceLabels, locale: string): string {
  return locale.startsWith('vi') ? option.labelVi : option.labelEn;
}

export function PlanIncludedServices({
  labels,
  className,
  showEmpty = false,
}: {
  labels?: PlanServiceLabels[];
  className?: string;
  showEmpty?: boolean;
}) {
  const t = useTranslations('Commercial');
  const locale = useLocale();
  const names = [...new Set(labels?.map((label) => planServiceLabel(label, locale)))];
  if (!names.length && !showEmpty) return null;

  return (
    <section className={className}>
      <p className="m-0 text-xs font-medium text-[var(--sc-text-secondary)]">
        {t('includedServices')}
      </p>
      {names.length ? (
        <ul className="mb-0 mt-2 flex flex-wrap gap-1.5">
          {names.map((name) => (
            <li
              key={name}
              className="whitespace-pre-wrap break-words rounded bg-[var(--sc-bg-secondary)] px-2 py-0.5 text-xs text-[var(--sc-text-primary)]"
            >
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-0 mt-1 text-xs text-[var(--sc-text-tertiary)]">
          {t('noIncludedServices')}
        </p>
      )}
    </section>
  );
}
