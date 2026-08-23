import Breadcrumb from '@/components/common/Breadcrumb';
import UnderConstruction from '@/components/common/UnderConstruction';

export default function InventoryPage() {
  return (
    <div className="py-8 px-10">
      <h1 className="text-[2rem] font-semibold text-[#1a1d21] mb-2 m-0">Inventory</h1>
      <Breadcrumb items={['Workspace', 'Inventory']} />
      <UnderConstruction />
    </div>
  );
}
