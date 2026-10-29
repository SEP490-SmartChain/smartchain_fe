import { SellerOrders, OperationsCancellationWorkspace } from '@/features/orders';
import { useAccess } from '@/hooks/useAccess';

export default function OrdersPage() {
  const { can } = useAccess();
  return can('orders.cancellation.ops') ? <OperationsCancellationWorkspace /> : <SellerOrders />;
}
