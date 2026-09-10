import { Link, Navigate, useLocation } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { LoginForm } from '@/features/auth';
import { getPostLoginPath } from '@/lib/authRedirect';
import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const t = useTranslations('Auth');
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (user) return <Navigate to={getPostLoginPath(user, location.state)} replace />;

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

            <LoginForm />

            {/* Register link */}
            <p className="text-center text-sm text-[#475569] mt-6">
              {t('no_account_label')}{' '}
              <Link
                to="/register"
                className="text-[#0F766E] font-semibold hover:text-[#0d645d] hover:underline transition-colors"
              >
                {t('register_link')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
