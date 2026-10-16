import { useOutletContext } from 'react-router-dom';

import { ReceivingWorkspace, type InboundWarehouseScope } from '@/features/inbound';

export default function InboundPage() {
  const scope = useOutletContext<InboundWarehouseScope>();
  return <ReceivingWorkspace {...scope} initialStatus="SUBMITTED" />;
}
