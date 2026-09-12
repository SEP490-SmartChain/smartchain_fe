import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-[var(--sc-text-primary)] group-[.toaster]:border-[var(--sc-border-default)] group-[.toaster]:rounded-xl group-[.toaster]:shadow-[var(--sc-shadow-popover)]',
          description: 'group-[.toast]:text-[var(--sc-text-secondary)]',
          actionButton: 'group-[.toast]:bg-[var(--sc-primary)] group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:bg-[var(--sc-bg-secondary)] group-[.toast]:text-[var(--sc-text-secondary)]',
          success:
            'group-[.toaster]:!bg-[var(--sc-success-bg)] group-[.toaster]:!border-[var(--sc-success-border)] group-[.toaster]:!text-[var(--sc-success-dark)]',
          error:
            'group-[.toaster]:!bg-[var(--sc-error-bg)] group-[.toaster]:!border-[var(--sc-error-border)] group-[.toaster]:!text-[var(--sc-error-dark)]',
          warning:
            'group-[.toaster]:!bg-[var(--sc-warning-bg)] group-[.toaster]:!border-[var(--sc-warning-border)] group-[.toaster]:!text-[var(--sc-warning-dark)]',
          info: 'group-[.toaster]:!bg-[var(--sc-info-bg)] group-[.toaster]:!border-[var(--sc-info-border)] group-[.toaster]:!text-[var(--sc-info-dark)]',
        },
      }}
      {...props}
    />
  );
}
