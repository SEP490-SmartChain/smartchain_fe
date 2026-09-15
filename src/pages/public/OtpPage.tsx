import { useEffect, useRef, useState } from 'react';

import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ArrowLeft, CircleCheck, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common';
import AuthPageShell from '@/components/layout/AuthPageShell';
import { cn } from '@/lib/utils';

const otpFields = ['otp-1', 'otp-2', 'otp-3', 'otp-4', 'otp-5', 'otp-6'];

export default function OtpPage() {
  const t = useTranslations('Auth');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? 'admin@company.com';
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const updateDigit = (index: number, value: string) => {
    const number = value.replace(/\D/g, '').slice(-1);
    setDigits((current) =>
      current.map((digit, digitIndex) => (digitIndex === index ? number : digit)),
    );
    setError('');
    if (number && index < 5) refs.current[index + 1]?.focus();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (digits.some((digit) => digit === '')) {
      setError(t('otp_code_required'));
      return;
    }
    setVerified(true);
    toast.success(t('otp_verified_success'));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const value = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!value) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => value[index] ?? ''));
    refs.current[Math.min(value.length, 5)]?.focus();
  };

  if (verified) {
    return (
      <AuthPageShell heading={t('otp_verified_heading')} subheading={t('otp_verified_description')}>
        <div className="flex flex-col items-center rounded-2xl border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] p-8 text-center">
          <CircleCheck size={48} strokeWidth={1.5} className="text-[var(--sc-success-dark)]" />
          <Button type="button" className="mt-6 w-full" onClick={() => navigate('/login')}>
            {t('back_to_login')}
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell heading={t('otp_page_heading')} subheading={t('otp_page_subheading', { email })}>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <div className="flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
            <ShieldCheck size={23} />
          </span>
        </div>
        <fieldset>
          <legend className="mb-3 w-full text-center text-sm font-medium text-[var(--sc-text-primary)]">
            {t('otp_code_label')}
          </legend>
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={otpFields[index]}
                id={otpFields[index]}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`${t('otp_code_label')} ${index + 1}`}
                value={digit}
                maxLength={1}
                className={cn(
                  'h-12 w-11 rounded-lg border bg-[var(--sc-bg-surface)] text-center text-lg font-medium text-[var(--sc-text-primary)] outline-none transition-[border-color,box-shadow,background-color]',
                  digit
                    ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)]'
                    : 'border-[var(--sc-border-default)]',
                  'focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
                )}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !digit && index > 0) {
                    refs.current[index - 1]?.focus();
                  }
                  if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
                  if (event.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus();
                }}
              />
            ))}
          </div>
          {error && (
            <p role="alert" className="mb-0 mt-2 text-center text-xs text-[var(--sc-error-dark)]">
              {error}
            </p>
          )}
        </fieldset>
        <Button type="submit" className="w-full">
          {t('otp_confirm_button')}
        </Button>
      </form>

      <div className="mt-5 flex items-center justify-between gap-4 text-sm">
        <Link
          to={`/forgot-password?email=${encodeURIComponent(email)}`}
          className="inline-flex items-center gap-1.5 text-[var(--sc-text-secondary)] hover:text-[var(--sc-primary)]"
        >
          <ArrowLeft size={15} />
          {t('otp_change_email').replace('← ', '')}
        </Link>
        <button
          type="button"
          disabled={seconds > 0}
          className="font-medium text-[var(--sc-primary)] disabled:text-[var(--sc-text-disabled)]"
          onClick={() => {
            setSeconds(60);
            toast.success(t('otp_sent_success'));
          }}
        >
          {seconds > 0 ? t('otp_resend_cooldown', { seconds }) : t('otp_resend_button')}
        </button>
      </div>
    </AuthPageShell>
  );
}
