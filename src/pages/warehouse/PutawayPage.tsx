import { useOutletContext } from 'react-router-dom';

import { PutawayWorkspace, type InboundWarehouseScope } from '@/features/inbound';

export default function PutawayPage() {
  const scope = useOutletContext<InboundWarehouseScope>();
  return <PutawayWorkspace {...scope} />;
}
