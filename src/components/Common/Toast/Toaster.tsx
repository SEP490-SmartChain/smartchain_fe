import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Toaster as Sonner } from 'sonner';

import './Toaster.css';

export function Toaster() {
  const t = useTranslations('Notifications');

  return (
    <Sonner
      className="sc-toaster"
      position="top-right"
      offset={20}
      mobileOffset={12}
      duration={6000}
      closeButton
      containerAriaLabel={t('label')}
      toastOptions={{ closeButtonAriaLabel: t('dismiss') }}
      icons={{
        error: <XCircle aria-hidden="true" size={18} />,
        warning: <AlertCircle aria-hidden="true" size={18} />,
        success: <CheckCircle2 aria-hidden="true" size={18} />,
        info: <Info aria-hidden="true" size={18} />,
        close: <X aria-hidden="true" size={16} />,
      }}
    />
  );
}
