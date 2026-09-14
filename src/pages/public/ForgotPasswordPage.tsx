import { useTranslations } from 'next-intl';

import AuthPageShell from '@/components/layout/AuthPageShell';
import { ForgotPasswordForm } from '@/features/auth';

export default function ForgotPasswordPage() {
  const t = useTranslations('Auth');

  return (
    <AuthPageShell heading={t('forgot_heading')} subheading={t('forgot_subheading')}>
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
