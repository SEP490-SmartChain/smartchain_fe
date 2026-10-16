import React from 'react';

import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'underline' | 'pills';
  disabled?: boolean;
  id?: string;
  label?: string;
}

export function Tabs({
  tabs,
  activeId,
  onChange,
  className,
  variant = 'underline',
  disabled = false,
  id,
  label,
}: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        if (disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
        );
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        const tab = tabs[next];
        if (tab) {
          buttons[next]?.focus();
          onChange(tab.id);
        }
      }}
      className={cn(
        'flex flex-wrap',
        variant === 'underline'
          ? 'gap-6 border-b border-[var(--sc-border-default)]'
          : 'gap-1 rounded-lg bg-[var(--sc-bg-secondary)] p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            type="button"
            role="tab"
            id={id ? `${id}-${tab.id}` : undefined}
            aria-controls={id ? `${id}-panel-${tab.id}` : undefined}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={disabled}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'group flex items-center gap-2 text-sm font-medium leading-[18px] transition-[color,background-color,border-color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-60',
              variant === 'pills' ? 'rounded-md px-3 py-1.5' : '-mb-px border-b-2 px-0.5 pb-3 pt-1',
              isActive && variant === 'pills'
                ? 'bg-white text-[var(--sc-primary-dark)] shadow-[var(--sc-shadow-button)]'
                : '',
              !isActive && variant === 'pills'
                ? 'text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]'
                : '',
              isActive && variant === 'underline'
                ? 'border-[var(--sc-primary)] text-[var(--sc-primary-dark)]'
                : '',
              !isActive && variant === 'underline'
                ? 'border-transparent text-[var(--sc-text-secondary)] hover:border-[var(--sc-primary-light)] hover:text-[var(--sc-text-primary)]'
                : '',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px]',
                  isActive
                    ? 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                    : 'bg-[var(--sc-bg-muted)] text-[var(--sc-text-secondary)]',
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
