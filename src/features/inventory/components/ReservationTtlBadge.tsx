import { useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import { formatTtl, getTtlTone, type ReservationTtlTone } from '@/lib/reservationTtl';

interface ReservationTtlBadgeProps {
  remainingSeconds: number;
}

const TONE_STATUS: Record<ReservationTtlTone, string> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  expired: 'default',
};

export function ReservationTtlBadge({ remainingSeconds }: ReservationTtlBadgeProps) {
  const t = useTranslations('Inventory');
  const tone = getTtlTone(remainingSeconds);

  return (
    <Badge
      status={TONE_STATUS[tone]}
      label={tone === 'expired' ? t('reservationExpired') : formatTtl(remainingSeconds)}
    />
  );
}
