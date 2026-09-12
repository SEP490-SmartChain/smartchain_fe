import { useState, useMemo, useEffect, useRef } from 'react';

import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Input } from '@/components/Common/Input/Input';
import { cn } from '@/lib/utils';

import { useEmailVerification } from '../hooks/useEmailVerification';
import { useRegisterBusiness } from '../hooks/useRegisterBusiness';
import { getRegisterSchema, type RegisterFormData } from '../schemas/register.schema';

// ─── OTP Input (6 individual digit boxes) ────────────────────────────────────

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const fieldIds = ['otp-1', 'otp-2', 'otp-3', 'otp-4', 'otp-5', 'otp-6'] as const;
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = fieldIds.map((_, index) => value[index] || '');

  const handleChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    if (!rawVal) {
      const newDigits = [...digits];
      newDigits[idx] = '';
      onChange(newDigits.join('').trimEnd());
      return;
    }

    if (rawVal.length > 1) {
      const newChar = rawVal.slice(-1);
      const newDigits = [...digits];
      newDigits[idx] = newChar;
      const nextVal = newDigits.join('').slice(0, 6);
      onChange(nextVal);
      if (idx < 5) refs.current[idx + 1]?.focus();
      return;
    }

    const newDigits = [...digits];
    newDigits[idx] = rawVal;
    const nextVal = newDigits.join('').slice(0, 6);
    onChange(nextVal);
    if (idx < 5) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[idx] && idx > 0) {
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[idx - 1] = '';
        onChange(newDigits.join('').trimEnd());
        refs.current[idx - 1]?.focus();
      } else if (digits[idx]) {
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[idx] = '';
        onChange(newDigits.join('').trimEnd());
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const targetIdx = Math.min(pasted.length, 5);
      refs.current[targetIdx]?.focus();
    }
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {fieldIds.map((fieldId, idx) => (
        <input
          key={fieldId}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={digits[idx]}
          disabled={disabled}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'w-11 h-12 text-center text-lg font-bold rounded-lg border transition-all outline-none',
            'focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
            digits[idx]
              ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)]'
              : 'border-[var(--sc-border-default)] bg-white',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          style={{ color: 'var(--sc-text-primary)', caretColor: 'var(--sc-primary)' }}
        />
      ))}
    </div>
  );
}

// ─── Resend countdown timer ───────────────────────────────────────────────────

function useCooldown(sentAt: number | null, cooldownSecs = 60) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!sentAt) {
      setRemaining(0);
      return;
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - sentAt) / 1000);
      setRemaining(Math.max(0, cooldownSecs - elapsed));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sentAt, cooldownSecs]);

  return remaining;
}

// ─── Step 1: Email entry ──────────────────────────────────────────────────────

function StepEmail({ onNext }: { onNext: (email: string) => void }) {
  const tAuth = useTranslations('Auth');
  const t = useTranslations();
  const { sendOtp, otpStatus } = useEmailVerification();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const isSending = otpStatus === 'sending';

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t('Validation.invalid_email'));
      return;
    }
    setEmailError('');
    const ok = await sendOtp(trimmed);
    if (ok) {
      toast.success(tAuth('otp_sent_success'));
      onNext(trimmed);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)]">
          <Mail size={22} className="text-[var(--sc-primary-dark)]" />
        </div>
        <p className="text-sm text-[var(--sc-text-secondary)]">{tAuth('otp_intro')}</p>
      </div>

      <Input
        label={tAuth('email_label')}
        type="email"
        placeholder={tAuth('email_placeholder')}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
          }
        }}
        error={emailError}
        required
        autoComplete="email"
      />

      <Button onClick={handleSend} isLoading={isSending} disabled={isSending} className="w-full">
        {isSending ? tAuth('otp_sending') : tAuth('otp_send_button')}
      </Button>

      <div className="text-center">
        <p className="text-sm text-[var(--sc-text-secondary)]">
          {tAuth('already_have_account')}{' '}
          <Link
            to="/login"
            className="font-medium text-[var(--sc-primary-dark)] transition-colors hover:text-[var(--sc-primary)]"
          >
            {tAuth('login_link')}
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─── Step 2: OTP verification ─────────────────────────────────────────────────

function StepOtp({
  email,
  onVerified,
  onBack,
}: {
  email: string;
  onVerified: () => void;
  onBack: () => void;
}) {
  const tAuth = useTranslations('Auth');
  const { sendOtp, verifyOtp, otpStatus, sentAt } = useEmailVerification();
  const [otp, setOtp] = useState('');
  const remaining = useCooldown(sentAt);
  const isVerifying = otpStatus === 'verifying';
  const isSending = otpStatus === 'sending';

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    const ok = await verifyOtp(email, otp);
    if (ok) {
      toast.success(tAuth('otp_verified_success'));
      onVerified();
    }
  };

  const handleResend = async () => {
    setOtp('');
    const ok = await sendOtp(email);
    if (ok) toast.success(tAuth('otp_sent_success'));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)]">
          <ShieldCheck size={22} className="text-[var(--sc-primary-dark)]" />
        </div>
        <p className="text-sm text-[var(--sc-text-secondary)]">{tAuth('otp_hint', { email })}</p>
      </div>

      <OtpInput value={otp} onChange={setOtp} disabled={isVerifying} />

      <Button
        onClick={handleVerify}
        isLoading={isVerifying}
        disabled={isVerifying || otp.length < 6}
        className="w-full"
      >
        {isVerifying ? tAuth('otp_confirming') : tAuth('otp_confirm_button')}
      </Button>

      <div className="flex items-center justify-between text-sm text-[var(--sc-text-secondary)]">
        <button
          type="button"
          onClick={onBack}
          className="transition-colors hover:text-[var(--sc-text-primary)]"
        >
          {tAuth('otp_change_email')}
        </button>
        {remaining > 0 ? (
          <span>{tAuth('otp_resend_cooldown', { seconds: remaining })}</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={isSending}
            className="font-medium text-[var(--sc-primary-dark)] transition-colors hover:text-[var(--sc-primary)] disabled:opacity-50"
          >
            {isSending ? tAuth('otp_resending') : tAuth('otp_resend_button')}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Registration form ────────────────────────────────────────────────

function StepRegisterForm({ verifiedEmail }: { verifiedEmail: string }) {
  const tAuth = useTranslations('Auth');
  const t = useTranslations();
  const { register: registerBusiness } = useRegisterBusiness();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(useMemo(() => getRegisterSchema(t), [t])),
    mode: 'onTouched',
    defaultValues: { email: verifiedEmail },
  });

  const onSubmit = async (data: RegisterFormData) => {
    const response = await registerBusiness(data);
    if (response.success) {
      toast.success(tAuth('register_success'));
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      autoComplete="off"
    >
      {/* Honeypot */}
      <input type="text" style={{ display: 'none' }} name="fake_user" />

      {/* Email verified badge */}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] px-3 py-2.5 text-sm text-[var(--sc-success-dark)]">
        <CheckCircle2 size={16} className="shrink-0 text-[var(--sc-success)]" />
        <span>{tAuth('email_verified_badge', { email: verifiedEmail })}</span>
      </div>

      {/* Email (hidden, pre-filled from verified step) */}
      <input type="hidden" {...register('email')} value={verifiedEmail} />

      {/* Full Name */}
      <Input
        label={tAuth('full_name_label')}
        placeholder={tAuth('full_name_placeholder')}
        {...register('fullName')}
        error={errors.fullName?.message}
        required
        autoComplete="off"
      />

      {/* Phone */}
      <Input
        label={tAuth('phone_label')}
        type="tel"
        placeholder={tAuth('phone_placeholder')}
        {...register('phone')}
        error={errors.phone?.message}
        required
        autoComplete="off"
      />

      {/* Company Name */}
      <Input
        label={tAuth('company_name_label')}
        placeholder={tAuth('company_name_placeholder')}
        {...register('companyName')}
        error={errors.companyName?.message}
        required
        autoComplete="off"
      />

      {/* Tax ID (Optional) */}
      <Input
        label={tAuth('tax_id_label')}
        placeholder={tAuth('tax_id_placeholder')}
        helperText={tAuth('tax_id_helper')}
        {...register('taxId')}
        error={errors.taxId?.message}
        autoComplete="off"
      />

      {/* Password */}
      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
        >
          {tAuth('password_label')} <span className="text-[#EF4444]">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            className={cn(
              'h-[42px] w-full rounded-lg border bg-white px-3 py-2 pr-10 text-sm text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none placeholder:text-[var(--sc-text-tertiary)]',
              'transition-[border-color,box-shadow] duration-150 hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
              errors.password ? 'border-[var(--sc-error)]' : 'border-[var(--sc-border-default)]',
            )}
            placeholder={tAuth('password_placeholder')}
            {...register('password')}
            autoComplete="new-password"
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)] transition-colors hover:text-[var(--sc-text-secondary)]"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1.5 text-xs text-[#EF4444] font-medium">{errors.password.message}</p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
        >
          {tAuth('confirm_password_label')} <span className="text-[#EF4444]">*</span>
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            className={cn(
              'h-[42px] w-full rounded-lg border bg-white px-3 py-2 pr-10 text-sm text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none placeholder:text-[var(--sc-text-tertiary)]',
              'transition-[border-color,box-shadow] duration-150 hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)]',
              errors.confirmPassword
                ? 'border-[var(--sc-error)]'
                : 'border-[var(--sc-border-default)]',
            )}
            placeholder={tAuth('confirm_password_placeholder')}
            {...register('confirmPassword')}
            autoComplete="new-password"
          />
          <button
            type="button"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)] transition-colors hover:text-[var(--sc-text-secondary)]"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            tabIndex={-1}
          >
            {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="mt-1.5 text-xs text-[#EF4444] font-medium">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* Terms Agreement */}
      <Checkbox
        label={tAuth('agree_to_terms_label')}
        {...register('agreeToTerms')}
        error={errors.agreeToTerms?.message}
      />

      {/* Submit */}
      <Button
        type="submit"
        isLoading={isSubmitting}
        disabled={isSubmitting}
        className="w-full mt-2"
      >
        {isSubmitting ? tAuth('registering') : tAuth('register_button')}
      </Button>

      {/* Login Link */}
      <div className="text-center mt-2">
        <p className="text-sm text-[var(--sc-text-secondary)]">
          {tAuth('already_have_account')}{' '}
          <Link
            to="/login"
            className="font-medium text-[var(--sc-primary-dark)] transition-colors hover:text-[var(--sc-primary)]"
          >
            {tAuth('login_link')}
          </Link>
        </p>
      </div>
    </form>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const tAuth = useTranslations('Auth');

  const steps = [
    { n: 1 as const, key: 'step_verify_email' },
    { n: 2 as const, key: 'step_enter_otp' },
    { n: 3 as const, key: 'step_create_account' },
  ] as const;

  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                current > s.n
                  ? 'bg-[var(--sc-success)] text-white'
                  : current === s.n
                    ? 'bg-[var(--sc-primary)] text-white ring-4 ring-[var(--sc-primary-alpha-20)]'
                    : 'bg-[var(--sc-bg-muted)] text-[var(--sc-text-tertiary)]',
              )}
            >
              {current > s.n ? '✓' : s.n}
            </div>
            <span
              className={cn(
                'text-[10px] mt-1 font-medium text-center leading-tight',
                current >= s.n ? 'text-[var(--sc-primary-dark)]' : 'text-[var(--sc-text-tertiary)]',
              )}
            >
              {tAuth(s.key)}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'h-0.5 flex-1 mt-[-14px] transition-all',
                current > s.n ? 'bg-[var(--sc-success)]' : 'bg-[var(--sc-bg-muted)]',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

export function RegisterBusinessForm() {
  const [step, setStep] = useState<Step>(1);
  const [verifiedEmail, setVerifiedEmail] = useState('');

  return (
    <div>
      <StepIndicator current={step} />

      {step === 1 && (
        <StepEmail
          onNext={(email) => {
            setVerifiedEmail(email);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <StepOtp email={verifiedEmail} onVerified={() => setStep(3)} onBack={() => setStep(1)} />
      )}

      {step === 3 && <StepRegisterForm verifiedEmail={verifiedEmail} />}
    </div>
  );
}
