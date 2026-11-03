import type { ReceivingWarehouse } from '../api/receivingApi';

export interface InboundWarehouseScope {
  warehouse: ReceivingWarehouse;
  onNavigationLockChange: (locked: boolean) => void;
}
