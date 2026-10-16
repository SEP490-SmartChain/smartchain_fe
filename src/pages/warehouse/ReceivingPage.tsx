import { useOutletContext } from 'react-router-dom';

import { ReceivingWorkspace, type InboundWarehouseScope } from '@/features/inbound';

export default function ReceivingPage() {
  const scope = useOutletContext<InboundWarehouseScope>();
  return <ReceivingWorkspace {...scope} />;
}
