import { useSearchParams } from 'react-router-dom';

import { Can } from '@/components/Common/Can/Can';
import { OperationsExceptionQueue } from '@/features/orders';
import { SlaExceptionsPanel } from '@/features/shipments';

/**
 * Operational recovery and carrier SLA incidents retain their own scoped workflows.
 * When navigated via an SLA alert link (e.g. overdue handover parcels from Picking),
 * promote SlaExceptionsPanel above OperationsExceptionQueue so the manager sees the
 * marked overdue parcels immediately at the top of the viewport.
 */
export default function ExceptionsPage() {
  const [searchParams] = useSearchParams();
  const isSlaFocused = Boolean(searchParams.get('reason') || searchParams.get('highlight'));

  if (isSlaFocused) {
    return (
      <div className="space-y-6">
        <Can capability="shipments.sla.view">
          <SlaExceptionsPanel />
        </Can>
        <Can capability="exceptions.view">
          <OperationsExceptionQueue />
        </Can>
      </div>
    );
  }

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
