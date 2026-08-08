import { useTranslations } from 'next-intl';

export default function UnderConstruction() {
  const t = useTranslations('Common');
  return (
    <div className="bg-white p-12 rounded-lg border border-gray-200 text-center text-gray-500">
      {t('under_construction')}
    </div>
  );
}
