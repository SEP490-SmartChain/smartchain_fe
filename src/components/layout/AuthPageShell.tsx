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
              <span className="grid h-10 w-10 grid-cols-2 gap-[3px] rounded-[10px] bg-[var(--sc-primary)] p-[9px]">
                <span className="rounded-[2px] bg-white" />
                <span className="rounded-[2px] bg-white/70" />
                <span className="rounded-[2px] bg-white/70" />
                <span className="rounded-[2px] bg-white" />
              </span>
              <span className="text-xl font-semibold">SmartChain</span>
            </div>
            <h1 className="m-0 text-[40px] font-medium leading-[44px] text-[var(--sc-text-primary)]">
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
