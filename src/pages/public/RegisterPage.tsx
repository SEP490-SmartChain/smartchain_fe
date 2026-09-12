import { useTranslations } from 'next-intl';

import AuthPageShell from '@/components/layout/AuthPageShell';
import { RegisterBusinessForm } from '@/features/auth/components/RegisterBusinessForm';

export default function RegisterPage() {
  const t = useTranslations('Auth');

  return (
    <AuthPageShell heading={t('register_heading')} subheading={t('register_subheading')}>
      <RegisterBusinessForm />
    </AuthPageShell>
  );
}
