import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface ServiceChainProps {
  /** Primary service first, then fallbacks in order. */
  ids: readonly string[];
  serviceNames: Readonly<Record<string, string>>;
  /** True once the active service list loaded; a missing name then means paused/unavailable. */
  isReady: boolean;
}

const PILL =
  'inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-0.5 text-sm font-medium';
const NUMBER =
  'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums';

/** Ordered carrier services: the first is the primary, the rest are fallbacks in order. */
export function ServiceChain({ ids, serviceNames, isReady }: ServiceChainProps) {
  const t = useTranslations('Rules');
  return (
    <ol className="flex flex-wrap items-center gap-y-1.5">
      {ids.map((id, index) => {
        const name = serviceNames[id];
        const isUnavailable = name === undefined && isReady;
        const isPrimary = index === 0;
        return (
          <li key={id} className="flex items-center">
            {index > 0 && (
              <ChevronRight
                size={14}
                aria-hidden="true"
                className="mx-1 text-[var(--sc-text-tertiary)]"
              />
            )}
            <span
              title={isUnavailable ? id : undefined}
              className={cn(
                PILL,
                isUnavailable
                  ? 'border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]'
                  : isPrimary
                    ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                    : 'border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]',
              )}
            >
              <span
                className={cn(
                  NUMBER,
                  isUnavailable
                    ? 'bg-[var(--sc-bg-elevated)] text-[var(--sc-warning-dark)]'
                    : isPrimary
                      ? 'bg-[var(--sc-primary)] text-white'
                      : 'bg-[var(--sc-bg-elevated)] text-[var(--sc-text-secondary)]',
                )}
              >
                {index + 1}
              </span>
              {isUnavailable && <TriangleAlert size={14} aria-hidden="true" />}
              {isUnavailable
                ? t('serviceUnavailable')
                : (name ?? t('unavailableReference', { id }))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
