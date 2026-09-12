import { Link, Navigate, useLocation } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import AuthPageShell from '@/components/layout/AuthPageShell';
import { LoginForm } from '@/features/auth';
import { getPostLoginPath } from '@/lib/authRedirect';
import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const t = useTranslations('Auth');
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (user) return <Navigate to={getPostLoginPath(user, location.state)} replace />;

  return (
    <AuthPageShell heading={t('login_heading')} subheading={t('login_subheading')}>
      <LoginForm />

      <p className="mb-0 mt-6 text-sm leading-[18px] text-[var(--sc-text-secondary)]">
        {t('no_account_label')}{' '}
        <Link
          to="/register"
          className="font-medium text-[var(--sc-primary)] hover:text-[var(--sc-primary-dark)] hover:underline"
        >
          {t('register_link')}
        </Link>
      </p>
    </AuthPageShell>
  );
}
