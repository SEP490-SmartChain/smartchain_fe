import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  options: SearchableSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
}

function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function SearchableSelect({
  label,
  error,
  helperText,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  options,
  value,
  onChange,
  disabled = false,
  required = false,
  clearable = true,
  className,
  id,
}: SearchableSelectProps) {
  const t = useTranslations('Common.financialControls');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const selectId = id || reactId;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = removeVietnameseTones(search.trim());
    return options.filter((opt) => {
      const matchLabel = removeVietnameseTones(opt.label).includes(query);
      const matchSub = opt.sublabel && removeVietnameseTones(opt.sublabel).includes(query);
      const matchValue = opt.value.toLowerCase().includes(query);
      return matchLabel || matchSub || matchValue;
    });
  }, [options, search]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightedIndex(0);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    if (disabled || options.find((option) => option.value === optionValue)?.disabled) return;
    onChange?.(optionValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev < filteredOptions.length - 1 ? prev + 1 : prev;
        scrollIndexIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        scrollIndexIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (e.target instanceof HTMLButtonElement && e.target.id !== selectId) return;
      e.preventDefault();
      const target = filteredOptions[highlightedIndex];
      if (target && !target.disabled) {
        handleSelect(target.value);
      }
    }
  };

  const scrollIndexIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('li');
    items[index]?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {label && (
        <label
          htmlFor={selectId}
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
          id={selectId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={`${selectId}-list`}
          aria-invalid={!!error}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
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
              selectedOption
                ? 'font-medium text-[var(--sc-text-primary)]'
                : 'text-[var(--sc-text-tertiary)]',
            )}
          >
            {selectedOption ? selectedOption.label : placeholder || t('selectPlaceholder')}
          </span>

          <div className="flex items-center gap-1.5 pl-2 text-[var(--sc-text-secondary)]">
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn(
                'transition-transform duration-200 text-[var(--sc-text-tertiary)]',
                isOpen && 'rotate-180',
              )}
            />
          </div>
        </button>
        {clearable && selectedOption && !disabled && (
          <button
            type="button"
            aria-label={t('clearSelection')}
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
          className="sc-popover-enter absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-2 shadow-[var(--sc-shadow-popover)]"
          onKeyDown={handleKeyDown}
        >
          {/* Pinned search box */}
          <div className="relative mb-2">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
            />
            <input
              ref={searchInputRef}
              type="text"
              role="combobox"
              aria-label={searchPlaceholder || t('searchPlaceholder')}
              aria-expanded={isOpen}
              aria-controls={`${selectId}-list`}
              aria-activedescendant={
                filteredOptions[highlightedIndex]
                  ? `${selectId}-option-${highlightedIndex}`
                  : undefined
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder={searchPlaceholder || t('searchPlaceholder')}
              className="h-9 w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] pl-9 pr-8 text-sm text-[var(--sc-text-primary)] placeholder:text-[var(--sc-text-tertiary)] outline-none focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]"
            />
            {search && (
              <button
                type="button"
                aria-label={t('clearSearch')}
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)] hover:text-[var(--sc-text-primary)]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Option list */}
          <ul
            ref={listRef}
            role="listbox"
            id={`${selectId}-list`}
            aria-label={label || placeholder || t('selectPlaceholder')}
            tabIndex={-1}
            className="max-h-60 overflow-y-auto space-y-0.5 rounded-lg pr-0.5"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-[var(--sc-text-tertiary)]">
                {emptyMessage || t('emptyMessage')}
              </li>
            ) : (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.value === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <li
                    key={opt.value}
                    role="option"
                    id={`${selectId}-option-${index}`}
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
                      opt.disabled && 'cursor-not-allowed opacity-50',
                      isSelected
                        ? 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary)] font-medium'
                        : isHighlighted
                          ? 'bg-[var(--sc-bg-secondary)] text-[var(--sc-text-primary)]'
                          : 'text-[var(--sc-text-primary)]',
                    )}
                  >
                    <button
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => handleSelect(opt.value)}
                      className="flex w-full items-center justify-between text-left focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]"
                    >
                      <span className="flex flex-col min-w-0 pr-2">
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="truncate text-xs text-[var(--sc-text-tertiary)]">
                            {opt.sublabel}
                          </span>
                        )}
                      </span>

                      {isSelected && (
                        <Check
                          size={16}
                          className="shrink-0 text-[var(--sc-primary)]"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {options.length > 5 && (
            <div className="mt-1.5 border-t border-[var(--sc-border-default)]/60 pt-1.5 px-2 text-right text-[11px] text-[var(--sc-text-tertiary)]">
              {filteredOptions.length === options.length
                ? t('optionCount', { count: options.length })
                : t('filteredCount', { count: filteredOptions.length, total: options.length })}
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-0 mt-1.5 text-xs text-[var(--sc-error-dark)]">{error}</p>}
      {helperText && !error && (
        <p className="mb-0 mt-1.5 text-xs text-[var(--sc-text-secondary)]">{helperText}</p>
      )}
    </div>
  );
}
