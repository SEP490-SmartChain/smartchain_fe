import { UnderConstruction } from '@/components/Common';
import { SepayUnmatchedTransfers } from '@/features/reconciliation';
import { useAccess } from '@/hooks/useAccess';

export default function ReconciliationPage() {
  const { can } = useAccess();

  // UC-127 posting is Accountant-only; carrier reconciliation (UC-137+) is still pending.
  if (!can('invoice.bankReceipt.post')) return <UnderConstruction />;

  return <SepayUnmatchedTransfers />;
}
