import { CarrierAccountManager, GlobalCarrierCatalog } from '@/features/catalog';

export default function CarrierCatalogPage() {
  return (
    <>
      <GlobalCarrierCatalog />
      <CarrierAccountManager />
    </>
  );
}
