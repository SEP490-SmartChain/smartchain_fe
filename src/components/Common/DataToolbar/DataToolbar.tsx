import React from 'react';

import { Search, Plus } from 'lucide-react';

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
    <div className="flex justify-between items-center mb-6">
      <button
        className="flex items-center gap-2 bg-white text-blue-500 border border-blue-200 px-4 py-2 rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 hover:bg-blue-50"
        onClick={onPrimaryAction}
      >
        <Plus size={16} /> {primaryActionLabel}
      </button>
      <div className="flex items-center border border-gray-200 rounded-md px-3 py-2 w-[300px]">
        <Search size={16} className="text-gray-400 mr-2" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="border-none outline-none text-sm w-full text-gray-600 placeholder:text-gray-400 bg-transparent"
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
    </div>
  );
}
