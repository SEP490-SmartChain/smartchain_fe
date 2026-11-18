import { useState, type ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

export function CommercialDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);

  return (
    <details
      className="group rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)]"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-[var(--sc-bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--sc-primary)] [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="text-[var(--sc-text-secondary)] transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      {opened && (
        <div className="border-t border-[var(--sc-border-default)] p-3 sm:p-4">{children}</div>
      )}
    </details>
  );
}
