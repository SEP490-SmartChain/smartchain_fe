import { Link } from 'react-router-dom';

import { ShieldX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAccess } from '@/hooks/useAccess';

/**
 * Trang `403 Không có quyền truy cập` (mục 4.7). Render trong app shell và giữ
 * phiên đăng nhập; nút chính dẫn về route mặc định của role hiện tại.
 */
export default function ForbiddenPage() {
  const t = useTranslations('Error');
  const { defaultPath } = useAccess();

  return (
    <section className="sc-page-enter flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] text-[var(--sc-primary-dark)] shadow-[var(--sc-shadow-popover)]">
        <ShieldX size={36} strokeWidth={1.4} aria-hidden="true" />
      </span>
      <p className="m-0 text-[clamp(4rem,14vw,8rem)] font-semibold leading-none tracking-[-0.07em] text-[var(--sc-primary)]">
        403
      </p>
      <h1 className="mb-0 mt-4 text-2xl font-medium leading-8 text-[var(--sc-text-primary)]">
        {t('forbidden_heading')}
      </h1>
      <p className="mb-0 mt-3 max-w-lg text-sm leading-6 text-[var(--sc-text-secondary)] sm:text-base">
        {t('forbidden_message')}
      </p>
      <Link
        to={defaultPath}
        className="mt-7 inline-flex h-[42px] items-center justify-center gap-2 rounded-lg border border-[var(--sc-primary)] bg-[var(--sc-primary)] px-4 text-sm font-medium text-white shadow-[var(--sc-shadow-button)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[var(--sc-primary-hover)] hover:bg-[var(--sc-primary-hover)] hover:shadow-[0_6px_14px_rgb(15_118_110/20%)] active:translate-y-0 active:scale-[0.98]"
      >
        {t('back_to_default')}
      </Link>
    </section>
  );
}
