import { useState } from 'react';

import { Link, useNavigate } from 'react-router-dom';

import { ArrowLeft, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button, Input } from '@/components/Common';
import AuthPageShell from '@/components/layout/AuthPageShell';

export default function ForgotPasswordPage() {
  const t = useTranslations('Auth');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t('forgot_email_required'));
      return;
    }
    toast.success(t('otp_sent_success'));
    navigate(`/otp?email=${encodeURIComponent(normalizedEmail)}`);
  };

  return (
    <AuthPageShell heading={t('forgot_heading')} subheading={t('forgot_subheading')}>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <Input
          id="forgot-email"
          type="email"
          label={t('email_label')}
          placeholder={t('email_placeholder')}
          autoComplete="email"
          leftIcon={<Mail size={17} />}
          value={email}
          error={error}
          required
          onChange={(event) => {
            setEmail(event.target.value);
            setError('');
          }}
        />
        <Button type="submit" className="w-full">
          {t('forgot_send')}
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--sc-text-secondary)] hover:text-[var(--sc-primary)]"
      >
        <ArrowLeft size={16} />
        {t('back_to_login')}
      </Link>
    </AuthPageShell>
  );
}
