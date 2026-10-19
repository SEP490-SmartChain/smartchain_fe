import { useAuthStore } from '@/stores/authStore';

import { FulfillmentBilling } from './FulfillmentBilling';

export function CommercialBilling({ tenantId }: { tenantId?: string }) {
  const revision = useAuthStore((state) => state.revision);
  return <FulfillmentBilling key={`${revision}:${tenantId ?? 'own'}`} tenantId={tenantId} />;
}
