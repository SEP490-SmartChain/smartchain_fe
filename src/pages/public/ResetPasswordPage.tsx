import { useTranslations } from 'next-intl';

import AuthPageShell from '@/components/layout/AuthPageShell';
import { ResetPasswordForm } from '@/features/auth';

export default function ResetPasswordPage() {
  const t = useTranslations('Auth');

  return (
    <AuthPageShell heading={t('reset_heading')} subheading={t('reset_subheading')}>
      <ResetPasswordForm />
    </AuthPageShell>
  );
}
