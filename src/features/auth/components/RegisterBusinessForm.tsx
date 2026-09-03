import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from 'react-router-dom';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { cn } from '@/lib/utils';

import { getRegisterSchema, type RegisterFormData } from '../schemas/register.schema';
import { useRegisterBusiness } from '../hooks/useRegisterBusiness';

export function RegisterBusinessForm() {
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
  });

  const onSubmit = async (data: RegisterFormData) => {
    await registerBusiness(data);
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" autoComplete="off">
      {/* Honeypot */}
      <input type="text" style={{ display: 'none' }} name="fake_user" />

      {/* Full Name */}
      <Input
        label={tAuth('full_name_label')}
        placeholder={tAuth('full_name_placeholder')}
        {...register('fullName')}
        error={errors.fullName?.message}
        required
        autoComplete="off"
      />

      {/* Email */}
      <Input
        label={tAuth('email_label')}
        type="email"
        placeholder={tAuth('email_placeholder')}
        {...register('email')}
        error={errors.email?.message}
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
        <label htmlFor="password" className="block text-sm font-semibold text-[#0F172A] mb-2">
          {tAuth('password_label')} <span className="text-[#EF4444]">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            className={cn(
              'w-full px-4 py-2.5 pr-10 text-sm text-[#0F172A] placeholder:text-[#94A3B8]',
              'bg-white border rounded-lg transition-all duration-200 outline-none shadow-sm',
              'focus:border-transparent focus:ring-2 focus:ring-[#0F766E]',
              errors.password ? 'border-[#EF4444] focus:ring-[#EF4444]' : 'border-[#E2E8F0]',
            )}
            placeholder={tAuth('password_placeholder')}
            {...register('password')}
            autoComplete="new-password"
          />
          <button
            type="button"
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] transition-colors"
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
          className="block text-sm font-semibold text-[#0F172A] mb-2"
        >
          {tAuth('confirm_password_label')} <span className="text-[#EF4444]">*</span>
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            className={cn(
              'w-full px-4 py-2.5 pr-10 text-sm text-[#0F172A] placeholder:text-[#94A3B8]',
              'bg-white border rounded-lg transition-all duration-200 outline-none shadow-sm',
              'focus:border-transparent focus:ring-2 focus:ring-[#0F766E]',
              errors.confirmPassword
                ? 'border-[#EF4444] focus:ring-[#EF4444]'
                : 'border-[#E2E8F0]',
            )}
            placeholder={tAuth('confirm_password_placeholder')}
            {...register('confirmPassword')}
            autoComplete="new-password"
          />
          <button
            type="button"
            aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] transition-colors"
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

      {/* Submit Button */}
      <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="w-full mt-2">
        {isSubmitting ? tAuth('registering') : tAuth('register_button')}
      </Button>

      {/* Login Link */}
      <div className="text-center mt-4">
        <p className="text-sm text-[#475569]">
          {tAuth('already_have_account')}{' '}
          <Link
            to="/login"
            className="text-[#0F766E] font-semibold hover:text-[#0d645d] hover:underline transition-colors"
          >
            {tAuth('login_link')}
          </Link>
        </p>
      </div>
    </form>
  );
}
