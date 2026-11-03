import { UnderConstruction } from '@/components/Common';
import { Can } from '@/components/Common/Can/Can';
import { SlaExceptionsPanel } from '@/features/shipments';

/** UC-104: the operations exception queue currently holds SLA breaches (handover and carrier progress). */
export default function ExceptionsPage() {
  return (
    <Can capability="shipments.sla.view" fallback={<UnderConstruction />}>
      <SlaExceptionsPanel />
    </Can>
  );
}
