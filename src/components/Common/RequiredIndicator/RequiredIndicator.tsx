interface RequiredIndicatorProps {
  isRequired?: boolean | 'true' | 'false';
}

/** Visual companion to the control's native required or aria-required state. */
export function RequiredIndicator({ isRequired = false }: RequiredIndicatorProps) {
  if (isRequired !== true && isRequired !== 'true') return null;

  return (
    <span aria-hidden="true" className="ml-1 text-[var(--sc-error)]">
      *
    </span>
  );
}
