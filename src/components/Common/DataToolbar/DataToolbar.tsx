import { Plus, Search } from 'lucide-react';

import { Button } from '@/components/Common/Button/Button';

interface DataToolbarProps {
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  searchPlaceholder?: string;
  onSearch: (query: string) => void;
}

export default function DataToolbar({
  primaryActionLabel,
  onPrimaryAction,
  searchPlaceholder = 'Search...',
  onSearch,
}: DataToolbarProps) {
  return (
    <div className="mb-6 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
      <Button type="button" variant="outline" onClick={onPrimaryAction}>
        <Plus size={16} /> {primaryActionLabel}
      </Button>
      <label className="relative sm:w-[300px]">
        <span className="sr-only">{searchPlaceholder}</span>
        <Search
          aria-hidden="true"
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
        />
        <input
          type="search"
          placeholder={searchPlaceholder}
          className="h-[42px] w-full rounded-lg border border-[var(--sc-border-default)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--sc-text-tertiary)] hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]"
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
    </div>
  );
}
