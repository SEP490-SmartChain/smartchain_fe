const postPickupStatuses = new Set([
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURNING',
  'RETURNED',
]);

export function carrierPickupRecorded(shipment: {
  status: string;
  pickedUpAt: string | null;
}): boolean {
  return shipment.pickedUpAt !== null || postPickupStatuses.has(shipment.status);
}
