import { useState } from 'react';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const t = useTranslations('Auth');
  const { login } = useAuth();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(formData.username, formData.password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('login_error_generic');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* ── Left panel — teal brand ──────────────────────────────────── */}
      <div
        className="flex-1 relative hidden md:flex flex-col items-center justify-center overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0F766E 0%, #064e3b 60%, #022c22 100%)',
        }}
      >
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 48px), repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 48px)',
          }}
        />
        {/* Glow blob */}
        <div
          className="absolute w-[480px] h-[480px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0,229,153,0.18) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {/* Brand copy */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center">
          <h1 className="text-4xl font-bold text-white tracking-tight leading-tight">SmartChain</h1>
          <p className="text-[#A7F3D0] text-base leading-relaxed max-w-[320px]">
            Intelligent Multi-Warehouse Logistics Orchestration
          </p>
          <div className="flex gap-3 mt-2">
            {['#00E599', '#FFB800', '#A855F7', '#00B4FF'].map((c) => (
              <span
                key={c}
                className="w-2.5 h-2.5 rounded-full opacity-70"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — login form ──────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative bg-white">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.025) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="w-full max-w-[460px] px-8 py-4 z-10">
          <div className="bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.05)] p-10">
            {/* Logo row (mobile only) */}
            <p className="md:hidden text-center text-sm font-semibold text-[#0F766E] mb-2 tracking-wide uppercase">
              SmartChain
            </p>

            <h2 className="text-2xl font-bold text-[#0F172A] text-center mb-8 m-0">
              {t('login_heading')}
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col" autoComplete="off">
              {/* Honeypot */}
              <input type="text" style={{ display: 'none' }} name="fake_user" />
              <input type="password" style={{ display: 'none' }} name="fake_pass" />

              {/* Error */}
              {error && (
                <div className="mb-5 px-4 py-3 rounded-lg bg-[#FEF2F2] text-[#EF4444] text-sm border border-[#FECACA] font-medium">
                  {error}
                </div>
              )}

              {/* Username */}
              <div className="flex flex-col gap-1.5 mb-5">
                <label htmlFor="login-username" className="text-sm font-semibold text-[#0F172A]">
                  {t('username_label')} <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  id="login-username"
                  required
                  type="text"
                  className="w-full px-4 py-3 border border-[#E2E8F0] rounded-lg outline-none text-sm transition-all duration-200 text-[#0F172A] placeholder:text-[#94A3B8] bg-white focus:border-[#0F766E] focus:shadow-[0_0_0_3px_rgba(15,118,110,0.1)]"
                  placeholder={t('username_placeholder')}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5 mb-5">
                <label htmlFor="login-password" className="text-sm font-semibold text-[#0F172A]">
                  {t('password_label')} <span className="text-[#EF4444]">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    id="login-password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-4 py-3 pr-12 border border-[#E2E8F0] rounded-lg outline-none text-sm transition-all duration-200 text-[#0F172A] placeholder:text-[#94A3B8] bg-white focus:border-[#0F766E] focus:shadow-[0_0_0_3px_rgba(15,118,110,0.1)]"
                    placeholder={t('password_placeholder')}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute right-4 bg-transparent border-none text-[#94A3B8] cursor-pointer p-0 flex items-center justify-center transition-colors duration-200 hover:text-[#475569]"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    className="text-sm text-[#0F766E] bg-transparent border-none cursor-pointer p-0 font-semibold hover:text-[#0d645d] hover:underline transition-colors"
                  >
                    {t('forgot_password')}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2.5 mb-7 mt-1">
                <input
                  type="checkbox"
                  id="remember"
                  className="w-4 h-4 rounded border border-[#CBD5E1] cursor-pointer accent-[#0F766E]"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-[#475569] cursor-pointer font-medium"
                >
                  {t('remember_me')}
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-3.5 px-4 bg-[#0F766E] text-white font-semibold rounded-lg border-none cursor-pointer transition-all duration-200 text-sm hover:bg-[#0d645d] hover:shadow-md',
                  loading && 'opacity-70 cursor-not-allowed',
                )}
              >
                {loading ? t('logging_in') : t('login_heading')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
