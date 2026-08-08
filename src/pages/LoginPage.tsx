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
    <div className="min-h-screen flex bg-[#fcfcfd]">
      <div className="flex-1 bg-gradient-to-br from-blue-900 to-blue-700 relative hidden md:block overflow-hidden after:content-[''] after:absolute after:inset-0 after:bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_1px,transparent_1px,transparent_40px)]">
        {/* Placeholder for left background graphic */}
      </div>

      <div className="flex-1 flex items-center justify-center relative bg-[#fffafb]">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="w-full max-w-[460px] p-8 z-10 flex flex-col items-center">
          <div className="w-full bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05),0_0_1px_rgba(0,0,0,0.1)] p-10">
            <h2 className="text-2xl font-bold text-gray-800 text-center my-8 m-0">
              {t('login_heading')}
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col mt-4" autoComplete="off">
              <input type="text" style={{ display: 'none' }} name="fake_user" />
              <input type="password" style={{ display: 'none' }} name="fake_pass" />

              {error && (
                <div className="mb-4 p-3 rounded bg-red-50 text-red-600 text-sm border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2 mb-5">
                <label className="text-sm font-semibold text-gray-700">
                  {t('username_label')} <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    required
                    type="text"
                    className="w-full px-4 py-3 border border-gray-300 rounded-md outline-none text-sm transition-all duration-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
                    placeholder={t('username_placeholder')}
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-5">
                <label className="text-sm font-semibold text-gray-700">
                  {t('password_label')} <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md outline-none text-sm transition-all duration-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
                    placeholder={t('password_placeholder')}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-4 bg-transparent border-none text-gray-400 cursor-pointer p-0 flex items-center justify-center transition-colors duration-200 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    className="text-sm text-blue-700 bg-transparent border-none cursor-pointer p-0 font-semibold hover:underline"
                  >
                    {t('forgot_password')}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5 mb-6 mt-2">
                <input
                  type="checkbox"
                  id="remember"
                  className="w-4 h-4 rounded border border-gray-300 cursor-pointer accent-blue-700"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-gray-600 cursor-pointer font-medium"
                >
                  {t('remember_me')}
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-3.5 px-4 bg-blue-700 text-white font-semibold rounded-md border-none cursor-pointer transition-colors duration-200 text-sm hover:not(:disabled):bg-blue-800',
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
