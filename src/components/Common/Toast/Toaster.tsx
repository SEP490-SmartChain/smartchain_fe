import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-[#0F172A] group-[.toaster]:border-[#E2E8F0] group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-[#475569]',
          actionButton: 'group-[.toast]:bg-[#0F766E] group-[.toast]:text-white',
          cancelButton: 'group-[.toast]:bg-[#F1F5F9] group-[.toast]:text-[#475569]',
          success:
            'group-[.toaster]:!bg-[#F0FDFA] group-[.toaster]:!border-[#99F6E4] group-[.toaster]:!text-[#0F766E]',
          error:
            'group-[.toaster]:!bg-[#FEF2F2] group-[.toaster]:!border-[#FCA5A5] group-[.toaster]:!text-[#EF4444]',
          warning:
            'group-[.toaster]:!bg-[#FEF3C7] group-[.toaster]:!border-[#FCD34D] group-[.toaster]:!text-[#D97706]',
          info: 'group-[.toaster]:!bg-[#EFF6FF] group-[.toaster]:!border-[#BFDBFE] group-[.toaster]:!text-[#3B82F6]',
        },
      }}
      {...props}
    />
  );
}
