import { Link } from 'react-router-dom';

import { House, RouteOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function NotFoundPage() {
  const t = useTranslations('Error');

  return (
    <main className="min-h-screen bg-[var(--sc-bg-secondary)] p-3 sm:p-5 lg:p-7">
      <section
        className="relative mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1440px] items-center justify-center overflow-hidden rounded-[2rem] border border-[var(--sc-border-default)] px-5 py-24 shadow-[var(--sc-shadow-section)] sm:min-h-[calc(100vh-2.5rem)] sm:rounded-[2.5rem] sm:px-10 lg:min-h-[calc(100vh-3.5rem)]"
        style={{
          background:
            'radial-gradient(circle at 18% 18%, var(--sc-primary-alpha-20), transparent 31%), radial-gradient(circle at 84% 76%, var(--sc-accent-alpha-20), transparent 28%), var(--sc-bg-surface)',
        }}
      >
        <Link
          to="/dashboard"
          aria-label="SmartChain"
          className="absolute left-6 top-6 z-10 flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[var(--sc-text-primary)] transition-colors hover:bg-[var(--sc-primary-alpha-08)] sm:left-9 sm:top-8"
        >
          <span className="grid h-9 w-9 grid-cols-2 gap-[3px] rounded-[10px] bg-[var(--sc-primary)] p-2 shadow-[0_6px_14px_rgb(15_118_110/20%)]">
            <span className="rounded-[2px] bg-white" />
            <span className="rounded-[2px] bg-white/70" />
            <span className="rounded-[2px] bg-white/70" />
            <span className="rounded-[2px] bg-white" />
          </span>
          <span className="text-lg font-semibold">SmartChain</span>
        </Link>

        <div className="relative z-[1] flex w-full max-w-2xl flex-col items-center text-center">
          <div className="relative mb-3 flex w-full items-center justify-center py-6 sm:py-9">
            <svg
              aria-hidden="true"
              viewBox="0 0 680 250"
              className="absolute inset-0 h-full w-full overflow-visible opacity-80"
            >
              <path
                d="M42 177C124 85 202 211 283 126C356 50 431 182 521 93C559 55 603 51 646 71"
                fill="none"
                stroke="var(--sc-border-strong)"
                strokeWidth="2"
                strokeDasharray="7 11"
                strokeLinecap="round"
              />
              <circle cx="43" cy="177" r="7" fill="var(--sc-primary)" />
              <circle cx="646" cy="71" r="7" fill="var(--sc-accent)" />
            </svg>

            <span className="select-none text-[clamp(7rem,24vw,13rem)] font-semibold leading-none tracking-[-0.09em] text-[var(--sc-primary)] drop-shadow-[0_16px_30px_var(--sc-primary-alpha-20)]">
              404
            </span>

            <span className="absolute bottom-[18%] right-[8%] flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] text-[var(--sc-primary-dark)] shadow-[var(--sc-shadow-popover)] sm:right-[13%] sm:h-16 sm:w-16">
              <RouteOff size={28} aria-hidden="true" />
            </span>
          </div>

          <h1 className="m-0 text-2xl font-medium leading-8 text-[var(--sc-text-primary)] sm:text-3xl">
            {t('not_found_heading')}
          </h1>
          <p className="mb-0 mt-3 max-w-lg text-sm leading-6 text-[var(--sc-text-secondary)] sm:text-base">
            {t('not_found_message')}
          </p>
          <Link
            to="/dashboard"
            className="mt-7 inline-flex h-[42px] items-center justify-center gap-2 rounded-lg border border-[var(--sc-primary)] bg-[var(--sc-primary)] px-4 text-sm font-medium text-white shadow-[var(--sc-shadow-button)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[var(--sc-primary-hover)] hover:bg-[var(--sc-primary-hover)] hover:shadow-[0_6px_14px_rgb(15_118_110/20%)] active:translate-y-0 active:scale-[0.98]"
          >
            <House size={16} aria-hidden="true" />
            {t('back_to_home')}
          </Link>
        </div>
      </section>
    </main>
  );
}
