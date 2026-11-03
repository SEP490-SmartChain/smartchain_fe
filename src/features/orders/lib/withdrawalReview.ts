import type { WithdrawalOptions } from '../api/withdrawalApi';

type Address = NonNullable<WithdrawalOptions['address']>;
type AddressValues = Omit<Address, 'version'>;
type Choice = WithdrawalOptions['items'][number];
type Location = {
  code: string;
  name: string;
  type: 'PROVINCE' | 'WARD';
  parentCode: string | null;
};

export function withdrawalReviewError(
  saved: Address | null | undefined,
  draft: AddressValues,
  choice: Choice | undefined,
  qty: number,
): 'ADDRESS_UNSAVED' | 'UNAVAILABLE' | null {
  if (!saved) return 'UNAVAILABLE';
  const fields = [
    'recipientName',
    'recipientPhone',
    'address',
    'provinceCode',
    'wardCode',
  ] as const;
  if (fields.some((field) => saved[field] !== draft[field])) return 'ADDRESS_UNSAVED';
  if (!choice || !Number.isInteger(qty) || qty < 1 || qty > choice.availableQty) {
    return 'UNAVAILABLE';
  }
  return null;
}

export function withdrawalAddressLine(address: Address, locations: Location[]): string {
  const province = locations.find(
    (item) => item.type === 'PROVINCE' && item.code === address.provinceCode,
  );
  const ward = locations.find(
    (item) =>
      item.type === 'WARD' &&
      item.code === address.wardCode &&
      item.parentCode === address.provinceCode,
  );
  return [
    address.address,
    ward?.name ?? address.wardCode,
    province?.name ?? address.provinceCode,
  ].join(', ');
}

export function withdrawalStockLabel(choice: Choice): string {
  return `${choice.productName} · ${choice.sku} · ${choice.warehouseName} · ${choice.lotCode} (${choice.availableQty})`;
}
