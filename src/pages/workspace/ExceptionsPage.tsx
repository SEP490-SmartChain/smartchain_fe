import { Can } from '@/components/Common/Can/Can';
import { OperationsExceptionQueue } from '@/features/orders';
import { SlaExceptionsPanel } from '@/features/shipments';

/** Operational recovery and carrier SLA incidents retain their own scoped workflows. */
export default function ExceptionsPage() {
  return (
    <div className="space-y-6">
      <Can capability="exceptions.view">
        <OperationsExceptionQueue />
      </Can>
      <Can capability="shipments.sla.view">
        <SlaExceptionsPanel />
      </Can>
    </div>
  );
}
