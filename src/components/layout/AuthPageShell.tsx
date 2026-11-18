import type { ReactNode } from 'react';

import AuthBrandPanel from './AuthBrandPanel';
import AuthFooter from './AuthFooter';

interface AuthPageShellProps {
  heading: string;
  subheading: string;
  children: ReactNode;
}

export default function AuthPageShell({ heading, subheading, children }: AuthPageShellProps) {
  return (
    <div className="grid min-h-screen bg-[var(--sc-bg-primary)] min-[900px]:grid-cols-2 min-[1200px]:grid-cols-[7fr_5fr]">
      <section className="flex min-h-screen flex-col justify-between gap-6 px-6 py-8 sm:p-14">
        <div className="mx-auto flex w-full max-w-[458px] flex-1 flex-col justify-center py-6">
          <div className="mb-8 text-center sm:mb-12">
            <div className="mb-6 flex items-center justify-center gap-2.5 min-[900px]:hidden">
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                aria-hidden="true"
                className="h-10 w-10 shrink-0 rounded-[10px]"
              >
                <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="var(--sc-primary)" />
                <path
                  d="M10.2 25.5C10.2 17.2 16.1 10.4 25.1 8.8C23.4 12.6 23.7 16.1 26.1 18.5C28.1 20.4 29.6 22.7 29.6 25.5H22.8C22.8 22.7 20.6 20.6 17.8 20.6C15.1 20.6 13.1 22.6 12.6 25.5H10.2Z"
                  fill="#ffffff"
                />
                <rect
                  x="24.2"
                  y="12.5"
                  width="4.4"
                  height="2.6"
                  rx="1.3"
                  transform="rotate(-18 24.2 12.5)"
                  fill="#99f6e4"
                />
                <rect x="10.2" y="28" width="8.8" height="2.8" rx="1.4" fill="#ffffff" />
                <rect
                  x="20.8"
                  y="28"
                  width="8.8"
                  height="2.8"
                  rx="1.4"
                  fill="#99f6e4"
                  fillOpacity="0.85"
                />
              </svg>
              <span className="text-xl font-semibold">ORCA</span>
            </div>
            <h1 className="m-0 text-balance text-[32px] font-medium leading-[38px] text-[var(--sc-text-primary)] min-[900px]:text-[40px] min-[900px]:leading-[44px]">
              {heading}
            </h1>
            <p className="mb-0 mt-3 text-base leading-5 text-[var(--sc-text-secondary)]">
              {subheading}
            </p>
          </div>

          {children}
        </div>

        <AuthFooter />
      </section>

      <AuthBrandPanel />
    </div>
  );
}
