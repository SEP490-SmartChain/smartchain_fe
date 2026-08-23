import { Link } from 'react-router-dom';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/common/Button/Button';

export default function NotFoundPage() {
  const t = useTranslations('Error');

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
      <div className="text-center max-w-md bg-white p-12 rounded-2xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] border border-gray-200">
        <h1 className="text-8xl font-black text-blue-600 m-0 leading-none drop-shadow-md">404</h1>
        <h2 className="text-2xl font-bold text-gray-900 mt-4 mb-2">{t('not_found_heading')}</h2>
        <p className="text-gray-500 mb-8 leading-relaxed">{t('not_found_message')}</p>
        <Link to="/dashboard">
          <Button variant="primary" size="lg">
            {t('back_to_home')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
