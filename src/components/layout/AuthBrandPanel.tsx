import { BarChart3, CircleCheck, PackageCheck, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function AuthBrandPanel() {
  const t = useTranslations('Auth');

  return (
    <aside className="hidden min-h-screen overflow-hidden bg-[var(--sc-bg-secondary)] pt-14 min-[900px]:flex min-[900px]:flex-col">
      <div className="flex flex-col items-center gap-4 px-10 text-center">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 grid-cols-2 gap-[3px] rounded-[10px] bg-[var(--sc-primary)] p-[9px] shadow-[0_6px_14px_rgb(15_118_110/20%)]">
            <span className="rounded-[2px] bg-white" />
            <span className="rounded-[2px] bg-white/70" />
            <span className="rounded-[2px] bg-white/70" />
            <span className="rounded-[2px] bg-white" />
          </span>
          <span className="text-xl font-semibold">SmartChain</span>
        </div>
        <p className="m-0 max-w-[400px] text-sm leading-5 text-[var(--sc-text-tertiary)]">
          {t('brand_tagline')}
        </p>
      </div>

      <div className="mt-12 min-h-[420px] flex-1 pl-12">
        <div className="sc-auth-preview-enter h-full min-h-[420px] overflow-hidden rounded-tl-3xl border-l-4 border-t-4 border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-[var(--sc-shadow-popover)]">
          <div className="flex h-14 items-center border-b border-[var(--sc-border-default)] px-4">
            <div className="h-2.5 w-28 rounded-full bg-[var(--sc-bg-muted)]" />
            <div className="ml-auto flex gap-2">
              <span className="h-7 w-7 rounded-lg bg-[var(--sc-bg-secondary)]" />
              <span className="h-7 w-7 rounded-lg bg-[var(--sc-primary-lighter)]" />
            </div>
          </div>

          <div className="flex h-[calc(100%-3.5rem)]">
            <div className="w-[104px] shrink-0 border-r border-[var(--sc-border-default)] p-3">
              <div className="mb-5 h-7 rounded-lg bg-[var(--sc-primary-lighter)]" />
              {[68, 54, 74, 60, 70].map((width) => (
                <div
                  key={width}
                  className="mb-3 h-2 rounded-full bg-[var(--sc-bg-muted)]"
                  style={{ width: width + '%' }}
                />
              ))}
            </div>

            <div className="min-w-0 flex-1 p-5">
              <div className="mb-5 h-3 w-36 rounded-full bg-[var(--sc-text-primary)] opacity-80" />
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: PackageCheck, value: '2,486' },
                  { icon: Truck, value: '368' },
                  { icon: CircleCheck, value: '96.8%' },
                ].map(({ icon: Icon, value }) => (
                  <div
                    key={value}
                    className="rounded-xl border border-[var(--sc-border-default)] p-3 shadow-[var(--sc-shadow-section)]"
                  >
                    <Icon size={15} className="text-[var(--sc-primary)]" />
                    <strong className="mt-4 block text-sm font-medium">{value}</strong>
                    <span className="mt-1 block h-1.5 w-12 rounded-full bg-[var(--sc-bg-muted)]" />
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-[var(--sc-border-default)] p-4 shadow-[var(--sc-shadow-section)]">
                <div className="mb-5 flex items-center justify-between">
                  <span className="h-2.5 w-24 rounded-full bg-[var(--sc-bg-muted)]" />
                  <BarChart3 size={17} className="text-[var(--sc-primary)]" />
                </div>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 420 150"
                  className="h-auto w-full overflow-visible"
                >
                  {[25, 65, 105, 145].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      x2="420"
                      y1={y}
                      y2={y}
                      stroke="var(--sc-border-default)"
                      strokeWidth="1"
                    />
                  ))}
                  <polyline
                    points="0,118 55,104 110,112 165,72 220,88 275,48 330,62 380,30 420,44"
                    fill="none"
                    stroke="var(--sc-primary)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points="0,132 55,122 110,96 165,110 220,74 275,92 330,54 380,72 420,50"
                    fill="none"
                    stroke="var(--sc-info)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
