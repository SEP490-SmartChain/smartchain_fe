import { useTranslations } from 'next-intl';

export default function AuthFooter() {
  const t = useTranslations('Auth');
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-[var(--sc-text-tertiary)]">
      <span className="hidden sm:inline">© {year} SmartChain</span>
      <span className="hidden h-4 w-px bg-[var(--sc-border-default)] sm:inline" />
      <a href="#privacy" className="transition-colors hover:text-[var(--sc-primary)]">
        {t('privacy_policy')}
      </a>
      <span className="h-4 w-px bg-[var(--sc-border-default)]" />
      <a href="#terms" className="transition-colors hover:text-[var(--sc-primary)]">
        {t('terms_conditions')}
      </a>
      <span className="mt-2 basis-full border-t border-[var(--sc-border-default)] pt-2 sm:hidden">
        © {year} SmartChain
      </span>
    </footer>
  );
}
