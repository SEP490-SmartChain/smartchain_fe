import { useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import { Card, CardHeader } from '@/components/Common/Card/Card';
import { Select } from '@/components/Common/Select/Select';

import { formatVnd, formatWeight, zoneKey } from '../utils/rateDisplay';

import type { RateSnapshot } from '../api/rateIntelligenceApi';

interface RateSnapshotsTableProps {
  snapshots: RateSnapshot[];
  carriers: { id: string; name: string }[];
  selectedCarrierId: string;
  isLoading: boolean;
  onCarrierChange: (carrierId: string) => void;
}

const COLUMNS = [
  'carrier',
  'service',
  'route',
  'area',
  'weight',
  'basePrice',
  'stepPrice',
  'effective',
  'version',
  'source',
] as const;

export function RateSnapshotsTable({
  snapshots,
  carriers,
  selectedCarrierId,
  isLoading,
  onCarrierChange,
}: RateSnapshotsTableProps) {
  const t = useTranslations('RateIntelligence');
  const zone = (code: string) => {
    const key = zoneKey(code);
    return key ? t(`zone${key}`) : code;
  };

  return (
    <Card padding="none">
      <div className="border-b border-[var(--sc-border-default)] p-5">
        <CardHeader title={t('pricesTitle')} description={t('pricesDescription')} />
        <div className="max-w-sm">
          <Select
            label={t('filterCarrier')}
            value={selectedCarrierId}
            options={carriers.map((carrier) => ({ value: carrier.id, label: carrier.name }))}
            placeholder={t('allCarriers')}
            isPlaceholderDisabled={false}
            onChange={(event) => onCarrierChange(event.target.value)}
          />
        </div>
      </div>
      {isLoading ? (
        <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('loading')}</p>
      ) : snapshots.length === 0 ? (
        <p className="p-6 text-sm text-[var(--sc-text-secondary)]">{t('pricesEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label={t('pricesTitle')}
            className="min-w-full divide-y divide-[var(--sc-border-default)] text-left text-sm"
          >
            <thead className="bg-[var(--sc-bg-secondary)] text-xs text-[var(--sc-text-secondary)]">
              <tr>
                {COLUMNS.map((key) => (
                  <th key={key} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sc-border-default)]">
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id} className="hover:bg-[var(--sc-bg-secondary)]">
                  <td className="whitespace-nowrap px-4 py-3">{snapshot.carrier.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{snapshot.service.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {zone(snapshot.originZone)} → {zone(snapshot.destZone)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {t(snapshot.receiverArea === 'WARD' ? 'ward' : 'commune')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatWeight(snapshot.weightMinG)}–{formatWeight(snapshot.weightMaxG)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatVnd(snapshot.basePriceVnd)} / {formatWeight(snapshot.baseWeightG)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    +{formatVnd(snapshot.stepPriceVnd)} / {formatWeight(snapshot.stepWeightG)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(snapshot.effectiveFrom).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">v{snapshot.version}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span>
                      {snapshot.source === 'CONTRACT_IMPORT' ? t('sourceFile') : t('sourceCarrier')}
                    </span>
                    {snapshot.isSample ? (
                      <span className="ml-2">
                        <Badge status="warning" label={t('sampleLabel')} />
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
