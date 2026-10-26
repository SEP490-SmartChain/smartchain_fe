import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export interface MonthPickerProps {
  value?: string; // Format: "YYYY-MM" e.g. "2026-10" or ""
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
}

export function MonthPicker({
  value,
  onChange,
  label,
  placeholder,
  error,
  helperText,
  disabled = false,
  required = false,
  clearable = true,
  className,
  id,
}: MonthPickerProps) {
  const reactId = useId();
  const inputId = id || reactId;
  const locale = useLocale();
  const t = useTranslations('Common.financialControls');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const currentRealYear = now.getFullYear();
  const currentRealMonth = now.getMonth() + 1; // 1-12

  // Parse current value
  const parsed = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
    const [y, m] = value.split('-').map(Number);
    return y && m && m >= 1 && m <= 12 ? { year: y, month: m } : null;
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(parsed?.year ?? currentRealYear);

  useEffect(() => {
    if (parsed?.year) {
      setViewYear(parsed.year);
    }
  }, [parsed?.year]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) =>
        new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2020, month, 1)),
      ),
    [locale],
  );

  const displayText = useMemo(() => {
    if (!parsed) return '';
    const mName = monthNames[parsed.month - 1];
    return locale === 'vi' ? `${mName}, ${parsed.year}` : `${mName} ${parsed.year}`;
  }, [parsed, monthNames, locale]);

  const handleSelectMonth = (monthNumber: number) => {
    const formatted = `${String(viewYear).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`;
    onChange?.(formatted);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleSelectCurrentMonth = () => {
    const formatted = `${currentRealYear}-${String(currentRealMonth).padStart(2, '0')}`;
    setViewYear(currentRealYear);
    onChange?.(formatted);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
        >
          {label}
          {required && <span className="ml-1 text-[var(--sc-error)]">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={inputId}
          role="button"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-controls={`${inputId}-dialog`}
          aria-invalid={!!error}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className={cn(
            'flex h-[42px] w-full items-center justify-between rounded-lg border bg-[var(--sc-bg-surface)] pl-3 pr-16 py-2 text-left text-sm leading-[18px] text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none',
            'cursor-pointer transition-[border-color,box-shadow,background-color] duration-150',
            'hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
            'disabled:cursor-not-allowed disabled:bg-[var(--sc-bg-secondary)] disabled:text-[var(--sc-text-disabled)]',
            error
              ? 'border-[var(--sc-error)] focus:border-[var(--sc-error)]'
              : 'border-[var(--sc-border-default)]',
          )}
        >
          <span
            className={cn(
              'truncate',
              displayText
                ? 'font-medium text-[var(--sc-text-primary)]'
                : 'text-[var(--sc-text-tertiary)]',
            )}
          >
            {displayText || placeholder || t('monthPlaceholder')}
          </span>

          <div className="flex items-center gap-1.5 pl-2 text-[var(--sc-text-secondary)]">
            <CalendarIcon size={16} aria-hidden="true" className="text-[var(--sc-text-tertiary)]" />
          </div>
        </button>
        {clearable && value && !disabled && (
          <button
            type="button"
            aria-label={t('clearMonth')}
            onClick={() => onChange?.('')}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--sc-text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Popover */}
      {isOpen && !disabled && (
        <div
          role="dialog"
          id={`${inputId}-dialog`}
          aria-label={label || t('monthPlaceholder')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setIsOpen(false);
              triggerRef.current?.focus();
            }
          }}
          className="sc-popover-enter absolute left-0 z-50 mt-1 w-64 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3 shadow-[var(--sc-shadow-popover)]"
        >
          {/* Header with Year Selector */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label={t('previousYear')}
              disabled={viewYear <= 1}
              onClick={() => setViewYear((prev) => prev - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sc-border-default)] text-[var(--sc-text-secondary)] transition-colors hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-[var(--sc-text-primary)]">{viewYear}</span>
            <button
              type="button"
              aria-label={t('nextYear')}
              disabled={viewYear >= 9999}
              onClick={() => setViewYear((prev) => prev + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--sc-border-default)] text-[var(--sc-text-secondary)] transition-colors hover:border-[var(--sc-primary-light)] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Month Grid (3 cols x 4 rows) */}
          <div className="grid grid-cols-3 gap-1.5">
            {monthNames.map((name, index) => {
              const monthNum = index + 1;
              const isSelected = parsed?.year === viewYear && parsed?.month === monthNum;
              const isCurrent = currentRealYear === viewYear && currentRealMonth === monthNum;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelectMonth(monthNum)}
                  className={cn(
                    'rounded-lg py-2 text-xs font-medium transition-colors outline-none',
                    isSelected
                      ? 'bg-[var(--sc-primary)] text-white shadow-sm'
                      : isCurrent
                        ? 'border border-[var(--sc-primary)] text-[var(--sc-primary)] hover:bg-[var(--sc-primary-lighter)]'
                        : 'text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-primary)]',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="mt-3 flex items-center justify-between border-t border-[var(--sc-border-default)]/60 pt-2 text-xs">
            <button
              type="button"
              onClick={handleSelectCurrentMonth}
              className="font-medium text-[var(--sc-primary)] hover:underline"
            >
              {t('currentMonth')}
            </button>
            {clearable && value && (
              <button
                type="button"
                onClick={() => {
                  onChange?.('');
                  setIsOpen(false);
                }}
                className="text-[var(--sc-text-secondary)] hover:text-[var(--sc-error)] hover:underline"
              >
                {t('clearSelection')}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="mb-0 mt-1.5 text-xs text-[var(--sc-error-dark)]">{error}</p>}
      {helperText && !error && (
        <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-secondary)]">{helperText}</p>
      )}
    </div>
  );
}
